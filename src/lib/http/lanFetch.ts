import { Capacitor, CapacitorHttp } from '@capacitor/core'

/**
 * A `fetch`-compatible function for LAN-direct device APIs served over cleartext
 * `http://<ip>` (discovered via mDNS).
 *
 * The native iOS/Android WebView runs on an `https://localhost` origin
 * (`iosScheme: 'https'`), so a plain `fetch` to an `http` device is blocked by
 * the WebView as mixed content (surfacing as `TypeError: Load failed`). On a
 * native platform we route the request through CapacitorHttp, which uses the
 * OS networking stack — honouring `NSAllowsLocalNetworking` and bypassing the
 * WebView's mixed-content and CORS checks. On web we fall back to global fetch.
 *
 * Intended to be passed as the `fetch` option to an `openapi-fetch` client bound
 * to a device's LAN base URL. Only suitable for the small JSON device APIs
 * (no streaming); binary/multipart uploads should not use it.
 */
export async function lanFetch(
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
  // openapi-fetch client can parse it back (and tag the content type it needs).
  const isJsonObject = res.data != null && typeof res.data !== 'string'
  const body = res.data == null ? null : isJsonObject ? JSON.stringify(res.data) : String(res.data)
  if (isJsonObject && !respHeaders.has('content-type')) {
    respHeaders.set('content-type', 'application/json')
  }

  return new Response(body, { status: res.status, headers: respHeaders })
}
