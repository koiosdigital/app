import createClient, { type Middleware } from 'openapi-fetch'
import type { paths } from '@/types/api'
import { ENV } from '@/config/environment'
import { useAuthStore } from '@/stores/auth/auth'

/**
 * Authentication middleware that adds Bearer token to requests
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
}

/**
 * Error handling middleware
 */
const errorMiddleware: Middleware = {
  async onResponse({ response }) {
    if (!response.ok) {
      // Log error responses for debugging
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
 * Create a custom API client instance (for testing or different base URLs)
 */
export function createApiClient(baseUrl: string) {
  const client = createClient<paths>({ baseUrl })
  client.use(authMiddleware)
  client.use(errorMiddleware)
  return client
}
