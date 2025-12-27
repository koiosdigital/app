import createClient, { type Middleware } from 'openapi-fetch'
import type { paths, components } from '@/types/provisioning-api'
import { useAuthStore } from '@/stores/auth/auth'

/**
 * Authentication middleware for endpoints that require Bearer token
 * Adds auth for all license endpoints (checkout and redeem)
 */
const authMiddleware: Middleware = {
  async onRequest({ request }) {
    const url = new URL(request.url)

    // Add auth for all license endpoints
    if (url.pathname.startsWith('/v1/license/')) {
      const authStore = useAuthStore()

      try {
        const token = await authStore.getAccessToken()
        if (token) {
          request.headers.set('Authorization', `Bearer ${token}`)
        }
      } catch (error) {
        console.error('Failed to get access token for provisioning request:', error)
      }
    }

    return request
  },
}

/**
 * Provisioning API client
 * Used for DS params backup/restore and license operations
 * - DS params endpoints use x-device-id header
 * - License checkout endpoints require Bearer token auth
 */
export const provisioningClient = createClient<paths>({
  baseUrl: 'https://provisioning.api.koiosdigital.net',
})

// Register auth middleware
provisioningClient.use(authMiddleware)

/**
 * Type exports for convenience
 */
export type DsParams = components['schemas']['DsParams']
export type CheckoutRequest = components['schemas']['CheckoutRequest']
export type CheckoutResponse = components['schemas']['CheckoutResponse']
export type RedeemRequest = components['schemas']['RedeemRequest']
