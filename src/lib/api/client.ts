import createClient, { type Middleware } from 'openapi-fetch'
import type { paths } from '@/types/api'
import { ENV } from '@/config/environment'
import { useAuthStore } from '@/stores/auth/auth'
import router from '@/router'

// Track if we're currently refreshing to avoid loops
let isRefreshing = false

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
    // On 401, try to refresh token and retry once
    if (response.status === 401 && !isRefreshing) {
      isRefreshing = true
      const authStore = useAuthStore()

      try {
        const newToken = await authStore.refreshAccessToken()
        if (newToken) {
          // Retry with new token
          const retryRequest = new Request(request.url, {
            method: request.method,
            headers: new Headers(request.headers),
            body: request.body,
            credentials: request.credentials,
          })
          retryRequest.headers.set('Authorization', `Bearer ${newToken}`)

          const retryResponse = await fetch(retryRequest)
          isRefreshing = false
          return retryResponse
        } else {
          // Refresh failed, redirect to login
          redirectToLogin()
        }
      } catch (error) {
        console.error('Token refresh failed during 401 retry:', error)
        redirectToLogin()
      }

      isRefreshing = false
    }

    return response
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
