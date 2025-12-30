/**
 * OAuth flow composable for handling OAuth2 authentication
 * Supports both web (popup) and native (in-app browser) flows
 */

import { ref, onUnmounted } from 'vue'
import { Preferences } from '@capacitor/preferences'
import { InAppBrowser } from '@capacitor/inappbrowser'
import { Capacitor } from '@capacitor/core'
import { openPopupSync } from '@/utils/browser'
import { decodeState, isStateExpired, type OAuthState } from '@/utils/oauthState'

const PENDING_SESSION_KEY = 'oauth_pending_session'
const PENDING_NONCE_KEY = 'oauth_pending_nonce'

export interface OAuthFlowOptions {
  onSuccess: (code: string, state: OAuthState) => Promise<void> | void
  onError?: (error: Error) => void
}

export interface PendingOAuthSession {
  // Context
  fieldId: string
  appId: string
  deviceId?: string
  installationId?: string
  mode: 'install' | 'edit' | 'license'

  // Security
  nonce: string
  timestamp: number

  // Full form state snapshot
  formValues: Record<string, unknown>
  displayTime: number
  skippedByUser: boolean
}

export interface OAuthFlowContext {
  fieldId: string
  appId: string
  deviceId?: string
  installationId?: string
  mode: 'install' | 'edit' | 'license'
  formValues?: Record<string, unknown>
  displayTime?: number
  skippedByUser?: boolean
}

export function useOAuthFlow(options: OAuthFlowOptions) {
  const isConnecting = ref(false)
  const error = ref<string | null>(null)
  let popup: Window | null = null
  let messageHandler: ((e: MessageEvent) => void) | null = null

  async function startFlow(authUrl: string, context: OAuthFlowContext) {
    error.value = null
    isConnecting.value = true

    // Parse the URL to extract the state we added
    const url = new URL(authUrl)
    const stateStr = url.searchParams.get('state')

    if (!stateStr) {
      error.value = 'Missing state parameter in auth URL'
      isConnecting.value = false
      return
    }

    const state = decodeState(stateStr)
    if (!state) {
      error.value = 'Invalid state parameter'
      isConnecting.value = false
      return
    }

    // Store nonce for validation
    await Preferences.set({ key: PENDING_NONCE_KEY, value: state.nonce })

    if (Capacitor.isNativePlatform()) {
      // Native: Store full session for recovery after app switch
      const session: PendingOAuthSession = {
        fieldId: context.fieldId,
        appId: context.appId,
        deviceId: context.deviceId,
        installationId: context.installationId,
        mode: context.mode,
        nonce: state.nonce,
        timestamp: state.timestamp,
        formValues: context.formValues || {},
        displayTime: context.displayTime || 10,
        skippedByUser: context.skippedByUser || false,
      }
      await Preferences.set({
        key: PENDING_SESSION_KEY,
        value: JSON.stringify(session),
      })

      // Open in external browser (Safari) so universal links work on redirect
      await InAppBrowser.openInExternalBrowser({ url: authUrl })
      // Flow continues via universal link → OAuthCallbackView
    } else {
      // Web: Open popup synchronously (required for popup blockers)
      popup = openPopupSync('oauth', 'width=500,height=700')
      if (!popup) {
        error.value = 'Could not open popup window. Please allow popups for this site.'
        isConnecting.value = false
        return
      }

      // Show loading state in popup
      popup.document.write(`
        <html>
          <head>
            <title>Connecting...</title>
            <style>
              body {
                background: #09090b;
                color: white;
                font-family: system-ui, sans-serif;
                display: flex;
                align-items: center;
                justify-content: center;
                height: 100vh;
                margin: 0;
              }
              .spinner {
                width: 40px;
                height: 40px;
                border: 3px solid rgba(255,255,255,0.1);
                border-top-color: #3b82f6;
                border-radius: 50%;
                animation: spin 1s linear infinite;
              }
              @keyframes spin {
                to { transform: rotate(360deg); }
              }
            </style>
          </head>
          <body>
            <div style="text-align: center;">
              <div class="spinner"></div>
              <p style="margin-top: 16px; color: rgba(255,255,255,0.7);">Connecting...</p>
            </div>
          </body>
        </html>
      `)

      popup.location.href = authUrl
      setupMessageListener(state.nonce)
    }
  }

  function setupMessageListener(expectedNonce: string) {
    messageHandler = (event: MessageEvent) => {
      console.log('[OAuth] Message received:', event.origin, event.data?.type)
      // Only accept messages from same origin
      if (event.origin !== window.location.origin) {
        console.log('[OAuth] Origin mismatch:', event.origin, 'vs', window.location.origin)
        return
      }
      if (event.data?.type !== 'OAUTH_CALLBACK') return

      console.log('[OAuth] Processing OAUTH_CALLBACK message')
      const { code, state: stateStr, error: oauthError } = event.data
      const state = decodeState(stateStr)

      if (!state || state.nonce !== expectedNonce) {
        console.log('[OAuth] Nonce mismatch:', state?.nonce, 'vs', expectedNonce)
        error.value = 'Invalid state - possible CSRF attack'
        isConnecting.value = false
        cleanup()
        return
      }

      if (isStateExpired(state)) {
        error.value = 'OAuth session expired. Please try again.'
        isConnecting.value = false
        cleanup()
        return
      }

      if (oauthError) {
        error.value = oauthError
        options.onError?.(new Error(oauthError))
      } else if (code) {
        console.log('[OAuth] Calling onSuccess with code')
        options.onSuccess(code, state)
      }

      isConnecting.value = false
      cleanup()
    }

    window.addEventListener('message', messageHandler)
  }

  function cleanup() {
    if (messageHandler) {
      window.removeEventListener('message', messageHandler)
      messageHandler = null
    }
    if (popup && !popup.closed) {
      popup.close()
    }
    popup = null
  }

  onUnmounted(cleanup)

  // For native: check if returning from OAuth
  async function getPendingSession(): Promise<PendingOAuthSession | null> {
    const { value } = await Preferences.get({ key: PENDING_SESSION_KEY })
    if (!value) return null
    try {
      return JSON.parse(value)
    } catch {
      return null
    }
  }

  async function clearPendingSession(): Promise<void> {
    await Preferences.remove({ key: PENDING_SESSION_KEY })
    await Preferences.remove({ key: PENDING_NONCE_KEY })
  }

  async function validateNonce(nonce: string): Promise<boolean> {
    const { value } = await Preferences.get({ key: PENDING_NONCE_KEY })
    return value === nonce
  }

  function cancel() {
    isConnecting.value = false
    cleanup()
  }

  return {
    startFlow,
    isConnecting,
    error,
    getPendingSession,
    clearPendingSession,
    validateNonce,
    cancel,
  }
}
