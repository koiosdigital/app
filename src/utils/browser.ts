import { Capacitor } from '@capacitor/core'
import { Browser } from '@capacitor/browser'

/**
 * Browser utility for handling external URLs
 * Uses Capacitor Browser plugin on native platforms, window.open on web
 */

export type BrowserOpenOptions = {
  /** URL to open */
  url: string
  /** Window name for web (default: '_blank') */
  windowTarget?: string
  /** Window features for web popup mode */
  windowFeatures?: string
}

export type BrowserCloseCallback = () => void

/**
 * Opens a URL in an in-app browser (native) or popup/tab (web)
 *
 * On native platforms:
 * - Uses Capacitor Browser plugin which opens an in-app browser
 * - Browser closes automatically when user navigates to a deep link
 * - Returns a close function that can be called to programmatically close
 *
 * On web:
 * - Opens a popup window synchronously (required for popup blockers)
 * - Returns the window reference for monitoring
 */
export async function openBrowser(options: BrowserOpenOptions): Promise<Window | null> {
  const { url, windowTarget = '_blank', windowFeatures } = options

  if (Capacitor.isNativePlatform()) {
    // Use Capacitor Browser plugin for native
    await Browser.open({ url })
    return null // Native browser doesn't return a window reference
  } else {
    // Use window.open for web
    return window.open(url, windowTarget, windowFeatures)
  }
}

/**
 * Opens a URL synchronously for popup flows (web only)
 * This MUST be called synchronously from a user interaction to avoid popup blockers
 *
 * @param target - Window target name
 * @param features - Window features (dimensions, etc.)
 * @returns Window reference or null
 */
export function openPopupSync(target = '_blank', features = 'width=500,height=700'): Window | null {
  if (Capacitor.isNativePlatform()) {
    return null // Not applicable for native
  }
  return window.open('about:blank', target, features)
}

/**
 * Closes the in-app browser (native only)
 */
export async function closeBrowser(): Promise<void> {
  if (Capacitor.isNativePlatform()) {
    await Browser.close()
  }
}

/**
 * Adds a listener for browser finished event (native only)
 * Called when the in-app browser is closed by the user
 */
export function addBrowserFinishedListener(callback: BrowserCloseCallback): () => void {
  if (!Capacitor.isNativePlatform()) {
    return () => {} // No-op for web
  }

  const listener = Browser.addListener('browserFinished', callback)
  return () => {
    listener.then((l) => l.remove())
  }
}

/**
 * Opens an external authentication flow
 * Handles the differences between web (popup) and native (in-app browser)
 *
 * @param getUrl - Async function that returns the URL to open (called after popup is opened on web)
 * @param onComplete - Callback when the flow completes (browser closed or navigated back)
 * @returns Cleanup function
 */
export async function openAuthFlow(
  getUrl: () => Promise<string>,
  onComplete?: () => void,
): Promise<{ popup: Window | null; cleanup: () => void }> {
  let popup: Window | null = null
  let removeListener: () => void = () => {}

  if (Capacitor.isNativePlatform()) {
    // Native: Just open the browser, deep links will handle the callback
    const url = await getUrl()
    await Browser.open({ url })

    // Listen for browser close
    if (onComplete) {
      removeListener = addBrowserFinishedListener(onComplete)
    }
  } else {
    // Web: Open popup synchronously first, then get URL
    popup = openPopupSync()

    if (!popup) {
      throw new Error('Could not open popup window. Please allow popups for this site.')
    }

    // Show loading state
    popup.document.write(`
      <html>
        <head>
          <title>Loading...</title>
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
          </style>
        </head>
        <body>
          <div style="text-align: center;">
            <p>Loading...</p>
          </div>
        </body>
      </html>
    `)

    // Get the actual URL and navigate
    const url = await getUrl()
    popup.location.href = url
  }

  const cleanup = () => {
    removeListener()
    if (popup && !popup.closed) {
      popup.close()
    }
  }

  return { popup, cleanup }
}

/**
 * Check if we're on a native platform
 */
export function isNativePlatform(): boolean {
  return Capacitor.isNativePlatform()
}

/**
 * Check if we're on web platform
 */
export function isWebPlatform(): boolean {
  return !Capacitor.isNativePlatform()
}
