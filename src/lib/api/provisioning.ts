import createClient from 'openapi-fetch'
import type { paths, components } from '@/types/provisioning-api'

/**
 * Provisioning API client
 * Used for DS params backup/restore and license operations
 * No auth middleware - uses x-device-id header for device identification
 */
export const provisioningClient = createClient<paths>({
  baseUrl: 'https://provisioning.api.koiosdigital.net',
})

/**
 * Type exports for convenience
 */
export type DsParams = components['schemas']['DsParams']
export type CheckoutRequest = components['schemas']['CheckoutRequest']
export type CheckoutResponse = components['schemas']['CheckoutResponse']
export type RedeemRequest = components['schemas']['RedeemRequest']
