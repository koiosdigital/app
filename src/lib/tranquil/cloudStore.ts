/**
 * Tranquil pattern STORE — the one cloud-backed Tranquil surface. Hits device-api
 * `/v1/store/*` (proxied to kd-tranquil-tracks) with the Keycloak USER token, so
 * it is login-gated and, per device-api, requires the user to own/share a
 * TRANQUIL device (403 otherwise). Distinct from the LAN-direct control API
 * (src/lib/tranquil/local/*).
 *
 * Not typed via openapi-fetch: the store routes are plain proxy paths, absent
 * from device-api's generated OpenAPI doc.
 */

import { ENV } from '@/config/environment'
import { useAuthStore } from '@/stores/auth/auth'

const BASE = `${ENV.apiBaseUrl}/v1/store`

export interface StorePattern {
  uuid: string
  name: string
  creator?: string | null
  encrypted?: number
  size_bytes?: number
  reversible?: number
  start_point?: number
  created_at?: string | null
}

export interface StorePatternPage {
  data: StorePattern[]
  pagination: { total: number; page: number; per_page: number; total_pages: number }
}

export interface StorePlaylist {
  uuid: string
  name: string
  description: string
  featured_pattern_uuid?: string | null
  patterns: StorePattern[]
}

export interface StorePlaylistPage {
  data: StorePlaylist[]
  pagination: { total: number; page: number; per_page: number; total_pages: number }
}

export type StoreErrorKind = 'unauthorized' | 'forbidden' | 'http' | 'network'

export class StoreError extends Error {
  constructor(
    public kind: StoreErrorKind,
    message: string,
  ) {
    super(message)
    this.name = 'StoreError'
  }
}

async function authFetch(path: string): Promise<Response> {
  const token = await useAuthStore().getAccessToken()
  let res: Response
  try {
    res = await fetch(`${BASE}${path}`, { headers: { Authorization: `Bearer ${token}` } })
  } catch {
    throw new StoreError('network', 'Cannot reach the store. Check your connection.')
  }
  if (res.status === 401)
    throw new StoreError('unauthorized', 'Your session expired — sign in again.')
  if (res.status === 403) {
    throw new StoreError(
      'forbidden',
      'The pattern store is available once you own a Tranquil table.',
    )
  }
  if (!res.ok) throw new StoreError('http', `Store request failed (${res.status}).`)
  return res
}

export type StoreSort = 'popularity' | 'name' | 'created_at'

export interface StoreListQuery {
  search?: string
  sort?: StoreSort
  order?: 'asc' | 'desc'
}

function pageQuery(page: number, perPage: number, query?: StoreListQuery): string {
  const params = new URLSearchParams({ page: String(page), per_page: String(perPage) })
  if (query?.search?.trim()) params.set('search', query.search.trim())
  if (query?.sort) params.set('sort', query.sort)
  if (query?.order) params.set('order', query.order)
  return params.toString()
}

export const tranquilStore = {
  /** Paginated catalog. NOTE: the store is 1-based (unlike the local device). */
  async listPatterns(page = 1, perPage = 24, query?: StoreListQuery): Promise<StorePatternPage> {
    const res = await authFetch(`/patterns?${pageQuery(page, perPage, query)}`)
    return res.json() as Promise<StorePatternPage>
  },

  /** Curated playlists, each with its ordered patterns. 1-based like /patterns. */
  async listPlaylists(page = 1, perPage = 24, query?: StoreListQuery): Promise<StorePlaylistPage> {
    const res = await authFetch(`/playlists?${pageQuery(page, perPage, query)}`)
    return res.json() as Promise<StorePlaylistPage>
  },

  async getPattern(uuid: string): Promise<StorePattern> {
    const res = await authFetch(`/patterns/${uuid}`)
    return res.json() as Promise<StorePattern>
  },

  /** Single curated playlist with its ordered patterns. */
  async getPlaylist(uuid: string): Promise<StorePlaylist> {
    const res = await authFetch(`/playlists/${uuid}`)
    return res.json() as Promise<StorePlaylist>
  },

  /** Authenticated thumbnail URL — fetch with a bearer (see useAuthenticatedImage). */
  thumbUrl(uuid: string): string {
    return `${BASE}/patterns/${uuid}/thumb.png`
  },
}
