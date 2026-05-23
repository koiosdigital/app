/**
 * SRP6a Client Implementation for ESP-IDF Security2 Protocol
 * Implements RFC 5054 with 3072-bit safe prime group
 */

// RFC 5054 3072-bit safe prime (N)
const N_HEX =
  'FFFFFFFFFFFFFFFFC90FDAA22168C234C4C6628B80DC1CD129024E088A67CC74' +
  '020BBEA63B139B22514A08798E3404DDEF9519B3CD3A431B302B0A6DF25F1437' +
  '4FE1356D6D51C245E485B576625E7EC6F44C42E9A637ED6B0BFF5CB6F406B7ED' +
  'EE386BFB5A899FA5AE9F24117C4B1FE649286651ECE45B3DC2007CB8A163BF05' +
  '98DA48361C55D39A69163FA8FD24CF5F83655D23DCA3AD961C62F356208552BB' +
  '9ED529077096966D670C354E4ABC9804F1746C08CA18217C32905E462E36CE3B' +
  'E39E772C180E86039B2783A2EC07A28FB5C55DF06F4C52C9DE2BCBF695581718' +
  '3995497CEA956AE515D2261898FA051015728E5A8AAAC42DAD33170D04507A33' +
  'A85521ABDF1CBA64ECFB850458DBEF0A8AEA71575D060C7DB3970F85A6E1E4C7' +
  'ABF5AE8CDB0933D71E8C94E04A25619DCEE3D2261AD2EE6BF12FFA06D98A0864' +
  'D87602733EC86A64521F2B18177B200CBBE117577A615D6C770988C0BAD946E2' +
  '08E24FA074E5AB3143DB5BFCE0FD108E4B82D120A93AD2CAFFFFFFFFFFFFFFFF'

const N = BigInt('0x' + N_HEX)
const g = 5n
const N_BYTES = 384 // 3072 bits = 384 bytes

/**
 * Convert BigInt to fixed-length Uint8Array (big-endian)
 */
function bigIntToBytes(n: bigint, length: number = N_BYTES): Uint8Array {
  let hex = n.toString(16)
  if (hex.length % 2 !== 0) hex = '0' + hex
  const bytes = new Uint8Array(hex.length / 2)
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.substring(i * 2, i * 2 + 2), 16)
  }
  // Pad to fixed length
  if (bytes.length < length) {
    const padded = new Uint8Array(length)
    padded.set(bytes, length - bytes.length)
    return padded
  }
  return bytes.slice(bytes.length - length)
}

/**
 * Convert Uint8Array to BigInt (big-endian)
 */
function bytesToBigInt(bytes: Uint8Array): bigint {
  let hex = ''
  for (const byte of bytes) {
    hex += byte.toString(16).padStart(2, '0')
  }
  return BigInt('0x' + (hex || '0'))
}

/**
 * Pad bytes to specified length (prepend zeros)
 */
function padTo(bytes: Uint8Array, length: number = N_BYTES): Uint8Array {
  if (bytes.length >= length) return bytes.slice(bytes.length - length)
  const padded = new Uint8Array(length)
  padded.set(bytes, length - bytes.length)
  return padded
}

/**
 * Concatenate multiple Uint8Arrays
 */
function concat(...arrays: Uint8Array[]): Uint8Array {
  const totalLength = arrays.reduce((sum, arr) => sum + arr.length, 0)
  const result = new Uint8Array(totalLength)
  let offset = 0
  for (const arr of arrays) {
    result.set(arr, offset)
    offset += arr.length
  }
  return result
}

/**
 * XOR two byte arrays of equal length
 */
function xorBytes(a: Uint8Array, b: Uint8Array): Uint8Array {
  const result = new Uint8Array(a.length)
  for (let i = 0; i < a.length; i++) {
    result[i] = a[i] ^ b[i]
  }
  return result
}

/**
 * Constant-time comparison to prevent timing attacks
 */
function constantTimeEquals(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false
  let result = 0
  for (let i = 0; i < a.length; i++) {
    result |= a[i] ^ b[i]
  }
  return result === 0
}

/**
 * SHA-512 hash using Web Crypto API
 * ESP-IDF Security2 uses SHA-512 for all SRP6a operations
 */
async function sha512(...data: Uint8Array[]): Promise<Uint8Array> {
  const concatenated = concat(...data)
  const buffer = concatenated.buffer.slice(
    concatenated.byteOffset,
    concatenated.byteOffset + concatenated.byteLength,
  ) as ArrayBuffer
  const hash = await crypto.subtle.digest('SHA-512', buffer)
  return new Uint8Array(hash)
}

/**
 * Modular exponentiation: base^exp mod mod
 * Uses binary exponentiation for efficiency
 */
function modPow(base: bigint, exp: bigint, mod: bigint): bigint {
  let result = 1n
  base = base % mod
  while (exp > 0n) {
    if (exp % 2n === 1n) {
      result = (result * base) % mod
    }
    exp = exp / 2n
    base = (base * base) % mod
  }
  return result
}

/**
 * Generate cryptographically secure random BigInt
 */
function generateSecureRandom(bytes: number): bigint {
  const randomBytes = new Uint8Array(bytes)
  crypto.getRandomValues(randomBytes)
  return bytesToBigInt(randomBytes)
}

/**
 * Compute multiplier k = H(N || PAD(g)) per RFC 5054
 */
async function computeK(): Promise<bigint> {
  const nBytes = bigIntToBytes(N)
  const gBytes = padTo(bigIntToBytes(g, 1), N_BYTES)
  const hash = await sha512(nBytes, gBytes)
  return bytesToBigInt(hash)
}

/**
 * SRP6a Client for ESP-IDF Security2 Protocol
 */
export class SRP6aClient {
  private username: Uint8Array
  private password: Uint8Array
  private a: bigint // Client secret (random 256-bit)
  private A: bigint // Client public key: A = g^a mod N
  private B: bigint | null = null // Device public key
  private salt: Uint8Array | null = null
  private S: bigint | null = null // Shared secret
  private K: Uint8Array | null = null // Full session key (64 bytes) - used for proofs
  private sessionKey: Uint8Array | null = null // Truncated key (32 bytes) - used for AES
  private M1: Uint8Array | null = null // Client proof

  constructor(username: string, password: string) {
    this.username = new TextEncoder().encode(username)
    this.password = new TextEncoder().encode(password)
    // Generate random 256-bit client secret
    this.a = generateSecureRandom(32)
    // Compute client public key A = g^a mod N
    this.A = modPow(g, this.a, N)
  }

  /**
   * Get client public key A as bytes (384 bytes)
   */
  getPublicKey(): Uint8Array {
    return bigIntToBytes(this.A)
  }

  /**
   * Get username as bytes
   */
  getUsername(): Uint8Array {
    return this.username
  }

  /**
   * Process device response (B, salt) and compute shared secret
   * Called after receiving S2SessionResp0
   */
  async processDevicePublicKey(B: Uint8Array, salt: Uint8Array): Promise<void> {
    this.B = bytesToBigInt(B)
    this.salt = salt

    // Verify B != 0 mod N (security check per RFC 5054)
    if (this.B % N === 0n) {
      throw new Error('Invalid device public key (B == 0 mod N)')
    }

    // u = H(PAD(A) || PAD(B))
    const paddedA = padTo(bigIntToBytes(this.A))
    const paddedB = padTo(B)
    const uHash = await sha512(paddedA, paddedB)
    const u = bytesToBigInt(uHash)

    if (u === 0n) {
      throw new Error('Invalid u value (equals zero)')
    }

    // x = H(salt || H(username || ":" || password))
    const colonBytes = new TextEncoder().encode(':')
    const innerHash = await sha512(this.username, colonBytes, this.password)
    const xHash = await sha512(salt, innerHash)
    const x = bytesToBigInt(xHash)

    // k = H(N || PAD(g))
    const k = await computeK()

    // S = (B - k * g^x)^(a + u * x) mod N
    const gx = modPow(g, x, N)
    const kgx = (k * gx) % N
    let base = (this.B - kgx) % N
    if (base < 0n) base += N

    const exp = (this.a + u * x) % (N - 1n)
    this.S = modPow(base, exp, N)

    // K = H(S) - session key
    // Full 64-byte hash is used for proof calculations
    // First 32 bytes are used for AES-256 encryption key
    const sBytes = bigIntToBytes(this.S)
    this.K = await sha512(sBytes)
    this.sessionKey = this.K.slice(0, 32)
  }

  /**
   * Compute client proof M1
   * M1 = H(H(N) XOR H(g) || H(username) || salt || A || B || K)
   */
  async computeClientProof(): Promise<Uint8Array> {
    if (!this.K || !this.salt || this.B === null) {
      throw new Error('Must call processDevicePublicKey first')
    }

    // H(N) XOR H(g)
    const hN = await sha512(bigIntToBytes(N))
    const hg = await sha512(padTo(bigIntToBytes(g, 1), N_BYTES))
    const hNxorHg = xorBytes(hN, hg)

    // H(username)
    const hI = await sha512(this.username)

    // M1 = H(hNxorHg || hI || salt || A || B || K)
    this.M1 = await sha512(
      hNxorHg,
      hI,
      this.salt,
      bigIntToBytes(this.A),
      bigIntToBytes(this.B),
      this.K,
    )

    return this.M1
  }

  /**
   * Verify device proof M2
   * M2 = H(A || M1 || K)
   */
  async verifyDeviceProof(M2: Uint8Array): Promise<boolean> {
    if (!this.M1 || !this.K) {
      throw new Error('Must call computeClientProof first')
    }

    const expectedM2 = await sha512(bigIntToBytes(this.A), this.M1, this.K)

    return constantTimeEquals(expectedM2, M2)
  }

  /**
   * Get session key for AES-256-GCM encryption
   * Returns first 32 bytes of H(S)
   */
  getSessionKey(): Uint8Array {
    if (!this.sessionKey) {
      throw new Error('Session key not yet derived')
    }
    return this.sessionKey
  }
}
