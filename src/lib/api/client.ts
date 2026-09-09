import createClient, { type Middleware } from 'openapi-fetch'
import type { paths } from '@/types/api'
import { ENV } from '@/config/environment'
import { useAuthStore } from '@/stores/auth/auth'
import router from '@/router'

/**
 * Redirect to login with current path preserved
 */
function redirectToLogin() {
  const currentPath = window.location.pathname + window.location.search
  router.replace({
    path: '/login',
    query: currentPath !== '/' ? { redirect: currentPath } : undefined,
  })
}

/**
 * Authentication middleware that adds Bearer token and retries on 401
 */
const authMiddleware: Middleware = {
  async onRequest({ request }) {
    const authStore = useAuthStore()

    try {
      const token = await authStore.getAccessToken()
      if (token) {
        request.headers.set('Authorization', `Bearer ${token}`)
      }
    } catch (error) {
      console.error('Failed to get access token for API request:', error)
    }

    return request
  },

  async onResponse({ request, response }) {
    if (response.status !== 401) return response

    // A 401 despite the proactive refresh in onRequest means the token was
    // rejected server-side (clock skew, key rotation, revocation). Attempt one
    // shared refresh + retry before surfacing anything. refreshAccessToken() is
    // single-flight, so a burst of concurrent 401s coalesces into one refresh
    // rather than each racing (and invalidating) the rotating refresh token.
    const authStore = useAuthStore()

    let newToken: string | undefined
    try {
      newToken = await authStore.refreshAccessToken()
    } catch (error) {
      console.error('Token refresh failed during 401 retry:', error)
    }

    if (!newToken) {
      // True auth failure: the refresh token is missing/expired/revoked. The
      // store has already logged out; send the user to login. The original 401
      // is returned so genuine auth failures still surface to the caller.
      redirectToLogin()
      return response
    }

    // Retry once with the fresh token via raw fetch (bypasses this middleware,
    // so there is no refresh loop). A transient expiry is now invisible to the
    // caller — the retried response is what they see.
    const retryRequest = new Request(request.url, {
      method: request.method,
      headers: new Headers(request.headers),
      body: request.body,
      credentials: request.credentials,
    })
    retryRequest.headers.set('Authorization', `Bearer ${newToken}`)
    return await fetch(retryRequest)
  },
}

/**
 * Error handling middleware
 */
const errorMiddleware: Middleware = {
  async onResponse({ response }) {
    if (!response.ok && response.status !== 401) {
      // Log errors (skip 401 since auth middleware handles it)
      console.error('API Error:', {
        url: response.url,
        status: response.status,
        statusText: response.statusText,
      })
    }
    return response
  },
}

/**
 * Main API client instance
 * Configured with base URL based on environment and automatic authentication
 */
export const apiClient = createClient<paths>({
  baseUrl: ENV.apiBaseUrl,
})

// Register middleware
apiClient.use(authMiddleware)
apiClient.use(errorMiddleware)

/**
 * Authenticated fetch against the API for callers that map responses by hand
 * (the Tranquil cloud client). Same contract as the typed client: bearer
 * token attached, one shared refresh + retry on 401, login redirect on a
 * terminal auth failure. `path` is relative to the API base URL.
 */
export async function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  const authStore = useAuthStore()
  const url = `${ENV.apiBaseUrl}${path}`
  const doFetch = async (token: string | undefined) => {
    const headers = new Headers(init?.headers ?? {})
    if (token) headers.set('Authorization', `Bearer ${token}`)
    if (init?.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json')
    return fetch(url, { ...init, headers })
  }

  let token: string | undefined
  try {
    token = await authStore.getAccessToken()
  } catch (error) {
    console.error('Failed to get access token for API request:', error)
  }
  const response = await doFetch(token)
  if (response.status !== 401) return response

  let fresh: string | undefined
  try {
    fresh = await authStore.refreshAccessToken()
  } catch (error) {
    console.error('Token refresh failed during 401 retry:', error)
  }
  if (!fresh) {
    redirectToLogin()
    return response
  }
  return doFetch(fresh)
}
