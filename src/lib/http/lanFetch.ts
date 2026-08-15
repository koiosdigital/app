/**
 * `lanFetch` is the LAN-device-facing name for {@link nativeFetch}. The two are
 * the same function — see `nativeFetch.ts` for why native builds need it.
 */
export { nativeFetch as lanFetch } from './nativeFetch'
