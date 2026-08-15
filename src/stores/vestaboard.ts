import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { Preferences } from '@capacitor/preferences'
import {
  refreshTokens,
  requestEmailCode,
  verifyEmailCode,
  VestaboardAuthError,
  type VestaboardTokens,
} from '@/lib/vestaboard/auth'
import { vestaboardQuery, VestaboardApiError } from '@/lib/vestaboard/client'

// Persisted in Capacitor Preferences (Keychain-backed on iOS), namespaced so
// they never collide with the Koios tokens in the auth store.
const KEYS = {
  ACCESS: 'vestaboard_access_token',
  REFRESH: 'vestaboard_refresh_token',
  EXPIRES: 'vestaboard_expires_at',
  EMAIL: 'vestaboard_email',
} as const

// Refresh slightly early so a request in flight never races the server's
// expiry check, and to absorb clock skew. Their tokens last 24h.
const CLOCK_SKEW_MS = 60_000

async function setOrRemove(key: string, value?: string) {
  if (value) {
    await Preferences.set({ key, value })
  } else {
    await Preferences.remove({ key })
  }
}

/**
 * Vestaboard account link.
 *
 * Kept separate from the Koios `auth` store: this is a third-party account the
 * user opts into, and losing it must never sign them out of Koios.
 */
export const useVestaboardStore = defineStore('vestaboard', () => {
  const accessToken = ref<string>()
  const refreshToken = ref<string>()
  const expiresAt = ref(0)
  const email = ref<string>()
  const initialized = ref(false)

  // Their refresh tokens rotate and are single-use, so two parallel refreshes
  // would spend each other's token and break the link. Coalesce into one.
  let refreshInFlight: Promise<string | undefined> | null = null

  /** True once the account is linked, even if the access token is stale. */
  const isLinked = computed(() => Boolean(refreshToken.value || accessToken.value))

  async function persist(tokens: VestaboardTokens, forEmail?: string) {
    accessToken.value = tokens.accessToken
    expiresAt.value = tokens.expiresAt
    // A refresh response always carries a replacement; keep the old one only if
    // a response somehow omits it.
    if (tokens.refreshToken) refreshToken.value = tokens.refreshToken
    if (forEmail) email.value = forEmail

    await Promise.all([
      setOrRemove(KEYS.ACCESS, accessToken.value),
      setOrRemove(KEYS.REFRESH, refreshToken.value),
      setOrRemove(KEYS.EXPIRES, String(expiresAt.value)),
      setOrRemove(KEYS.EMAIL, email.value),
    ])
  }

  /** Load persisted tokens. Safe to call repeatedly. */
  async function initialize() {
    if (initialized.value) return
    const [access, refresh, expires, storedEmail] = await Promise.all([
      Preferences.get({ key: KEYS.ACCESS }),
      Preferences.get({ key: KEYS.REFRESH }),
      Preferences.get({ key: KEYS.EXPIRES }),
      Preferences.get({ key: KEYS.EMAIL }),
    ])
    accessToken.value = access.value ?? undefined
    refreshToken.value = refresh.value ?? undefined
    expiresAt.value = Number(expires.value ?? 0)
    email.value = storedEmail.value ?? undefined
    initialized.value = true
  }

  /** Forget the link. Does not touch the Koios session. */
  async function unlink() {
    accessToken.value = undefined
    refreshToken.value = undefined
    expiresAt.value = 0
    email.value = undefined
    await Promise.all(Object.values(KEYS).map((key) => Preferences.remove({ key })))
  }

  /** Send the 6-digit sign-in code to `address`. */
  async function sendCode(address: string) {
    await requestEmailCode(address)
    email.value = address.trim()
  }

  /** Complete sign-in with the emailed code. */
  async function submitCode(address: string, code: string) {
    const tokens = await verifyEmailCode(address, code)
    await persist(tokens, address.trim())
  }

  async function doRefresh(): Promise<string | undefined> {
    const token = refreshToken.value
    if (!token) return undefined
    try {
      const tokens = await refreshTokens(token)
      await persist(tokens)
      return tokens.accessToken
    } catch (err) {
      // `invalid_grant` means the token was revoked or already spent — the link
      // is dead and the user has to sign in again. Anything else (offline, 5xx)
      // is transient, so keep the tokens and let the caller retry.
      if (err instanceof VestaboardAuthError && err.code === 'invalid_grant') {
        await unlink()
      }
      throw err
    }
  }

  /** A usable access token, refreshing first if it is expired or about to be. */
  async function getAccessToken(): Promise<string | undefined> {
    await initialize()
    const fresh = accessToken.value && Date.now() < expiresAt.value - CLOCK_SKEW_MS
    if (fresh) return accessToken.value
    if (!refreshToken.value) return accessToken.value

    if (!refreshInFlight) {
      refreshInFlight = doRefresh().finally(() => {
        refreshInFlight = null
      })
    }
    return refreshInFlight
  }

  /**
   * Run a Vestaboard operation, refreshing and retrying once if the API says
   * the token is stale.
   */
  async function query<T>(
    operationName: string,
    document: string,
    variables: Record<string, unknown> = {},
  ): Promise<T> {
    const token = await getAccessToken()
    if (!token) throw new VestaboardApiError('Vestaboard account is not linked')

    try {
      return await vestaboardQuery<T>(token, operationName, document, variables)
    } catch (err) {
      if (!(err instanceof VestaboardApiError) || !err.needsRefresh) throw err

      // Force a refresh even if the token still looks unexpired to us — the
      // server is the authority on that.
      expiresAt.value = 0
      const retryToken = await getAccessToken()
      if (!retryToken || retryToken === token) throw err
      return vestaboardQuery<T>(retryToken, operationName, document, variables)
    }
  }

  return {
    accessToken,
    email,
    isLinked,
    initialize,
    sendCode,
    submitCode,
    getAccessToken,
    query,
    unlink,
  }
})
