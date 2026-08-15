import { Capacitor, CapacitorHttp } from '@capacitor/core'

/**
 * A `fetch`-compatible function that routes through the OS networking stack on
 * native platforms, and falls back to global `fetch` on web.
 *
 * Two things need this:
 *
 * 1. **LAN-direct device APIs** served over cleartext `http://<ip>` (discovered
 *    via mDNS). The native iOS/Android WebView runs on an `https://localhost`
 *    origin (`iosScheme: 'https'`), so a plain `fetch` to an `http` device is
 *    blocked as mixed content (surfacing as `TypeError: Load failed`).
 *
 * 2. **Third-party APIs that do not grant us CORS.** CapacitorHttp is not
 *    subject to the WebView's preflight/origin checks, so a native build can
 *    talk to an API that would reject our origin in a browser.
 *
 * Both cases work on native because CapacitorHttp honours
 * `NSAllowsLocalNetworking` and bypasses the WebView's mixed-content and CORS
 * checks. On web neither workaround is available, so the request goes out as a
 * normal `fetch` and is subject to the usual browser rules.
 *
 * Intended to be passed as the `fetch` option to an `openapi-fetch` client, or
 * called directly. Only suitable for small JSON APIs (no streaming);
 * binary/multipart uploads should not use it.
 */
export async function nativeFetch(
  input: Request | string | URL,
  init?: RequestInit,
): Promise<Response> {
  if (!Capacitor.isNativePlatform()) {
    return fetch(input as RequestInfo, init)
  }

  const req = input instanceof Request ? input : new Request(input, init)

  const headers: Record<string, string> = {}
  req.headers.forEach((value, key) => {
    headers[key] = value
  })

  const hasBody = req.method !== 'GET' && req.method !== 'HEAD'
  const bodyText = hasBody ? await req.text() : ''
  let data: unknown
  if (bodyText) {
    try {
      data = JSON.parse(bodyText)
    } catch {
      data = bodyText
    }
  }

  const res = await CapacitorHttp.request({
    url: req.url,
    method: req.method,
    headers,
    data,
  })

  const respHeaders = new Headers()
  for (const [key, value] of Object.entries(res.headers ?? {})) {
    if (typeof value === 'string') respHeaders.set(key, value)
  }

  // CapacitorHttp parses JSON responses into an object; re-serialize so the
  // caller can parse it back (and tag the content type it needs).
  const isJsonObject = res.data != null && typeof res.data !== 'string'
  const body = res.data == null ? null : isJsonObject ? JSON.stringify(res.data) : String(res.data)
  if (isJsonObject && !respHeaders.has('content-type')) {
    respHeaders.set('content-type', 'application/json')
  }

  return new Response(body, { status: res.status, headers: respHeaders })
}
