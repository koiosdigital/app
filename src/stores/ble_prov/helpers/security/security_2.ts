/**
 * Security2 - SRP6a + AES-256-GCM encryption
 * Used for username/password authentication with ESP-IDF devices
 */

import { create, toBinary, fromBinary } from '@bufbuild/protobuf'
import { SecSchemeVersion, SessionDataSchema } from '@/types/proto/session_pb'
import { Sec2MsgType, Sec2PayloadSchema } from '@/types/proto/sec2_pb'
import { Status } from '@/types/proto/constants_pb'
import { SRP6aClient } from './srp6a'

enum SecurityState {
  REQUEST0, // Send username + client public key A
  RESPONSE0_REQUEST1, // Receive device pubkey B + salt, send client proof M1
  RESPONSE1, // Receive device proof M2 + nonce, verify
  FINISHED,
}

export class Security2 {
  private sessionState = SecurityState.REQUEST0
  private srpClient: SRP6aClient
  private sessionKey: Uint8Array | null = null
  private nonce: Uint8Array | null = null // Single shared nonce for both encrypt/decrypt
  private verbose: boolean

  constructor(username: string, password: string, verbose = false) {
    this.srpClient = new SRP6aClient(username, password)
    this.verbose = verbose
  }

  private log(message: string) {
    if (this.verbose) {
      console.debug(`%c++++ ${message} ++++`, 'color: #32cd32')
    }
  }

  async handleSession(responseData: Uint8Array | undefined): Promise<Uint8Array | undefined> {
    switch (this.sessionState) {
      case SecurityState.REQUEST0:
        this.sessionState = SecurityState.RESPONSE0_REQUEST1
        return this.setup0Request()

      case SecurityState.RESPONSE0_REQUEST1:
        if (!responseData) throw new Error('Missing response data')
        this.sessionState = SecurityState.RESPONSE1
        await this.setup0Response(responseData)
        return this.setup1Request()

      case SecurityState.RESPONSE1:
        if (!responseData) throw new Error('Missing response data')
        this.sessionState = SecurityState.FINISHED
        await this.setup1Response(responseData)
        return undefined

      default:
        throw new Error('Unexpected session state')
    }
  }

  /**
   * Step 0 Request: Send client username + public key A
   */
  private setup0Request(): Uint8Array {
    const request = create(SessionDataSchema)
    request.secVer = SecSchemeVersion.SecScheme2
    request.proto.case = 'sec2'
    request.proto.value = create(Sec2PayloadSchema)
    request.proto.value.msg = Sec2MsgType.S2Session_Command0
    request.proto.value.payload.case = 'sc0'
    request.proto.value.payload.value = {
      clientUsername: this.srpClient.getUsername(),
      clientPubkey: this.srpClient.getPublicKey(),
      $typeName: 'ble_prov.S2SessionCmd0',
    }

    this.log(`Client Username: ${new TextDecoder().decode(this.srpClient.getUsername())}`)
    this.log(`Client Public Key A: 0x${this.uint8ToHex(this.srpClient.getPublicKey()).slice(0, 64)}...`)

    return toBinary(SessionDataSchema, request)
  }

  /**
   * Step 0 Response: Receive device public key B + salt
   */
  private async setup0Response(responseData: Uint8Array): Promise<void> {
    const response = fromBinary(SessionDataSchema, responseData)

    if (response.secVer !== SecSchemeVersion.SecScheme2 || response.proto.case !== 'sec2') {
      throw new Error('Incorrect security scheme')
    }

    if (response.proto.value.payload.case !== 'sr0') {
      throw new Error('Incorrect message type')
    }

    const status = response.proto.value.payload.value.status
    if (status !== Status.Success) {
      throw new Error(`Session setup0 failed with status: ${status}`)
    }

    const devicePubkey = response.proto.value.payload.value.devicePubkey
    const deviceSalt = response.proto.value.payload.value.deviceSalt

    this.log(`Device Public Key B: 0x${this.uint8ToHex(devicePubkey).slice(0, 64)}...`)
    this.log(`Device Salt: 0x${this.uint8ToHex(deviceSalt)}`)

    // Process with SRP6a client to derive shared secret
    await this.srpClient.processDevicePublicKey(devicePubkey, deviceSalt)
  }

  /**
   * Step 1 Request: Send client proof M1
   */
  private async setup1Request(): Promise<Uint8Array> {
    const clientProof = await this.srpClient.computeClientProof()

    this.log(`Client Proof M1: 0x${this.uint8ToHex(clientProof)}`)

    const request = create(SessionDataSchema)
    request.secVer = SecSchemeVersion.SecScheme2
    request.proto.case = 'sec2'
    request.proto.value = create(Sec2PayloadSchema)
    request.proto.value.msg = Sec2MsgType.S2Session_Command1
    request.proto.value.payload.case = 'sc1'
    request.proto.value.payload.value = {
      clientProof: clientProof,
      $typeName: 'ble_prov.S2SessionCmd1',
    }

    return toBinary(SessionDataSchema, request)
  }

  /**
   * Step 1 Response: Verify device proof M2, get nonce
   */
  private async setup1Response(responseData: Uint8Array): Promise<void> {
    const response = fromBinary(SessionDataSchema, responseData)

    if (response.secVer !== SecSchemeVersion.SecScheme2 || response.proto.case !== 'sec2') {
      throw new Error('Incorrect security scheme')
    }

    if (response.proto.value.payload.case !== 'sr1') {
      throw new Error('Incorrect message type')
    }

    const status = response.proto.value.payload.value.status
    if (status !== Status.Success) {
      throw new Error(`Session setup1 failed with status: ${status}`)
    }

    const deviceProof = response.proto.value.payload.value.deviceProof
    const deviceNonce = response.proto.value.payload.value.deviceNonce

    this.log(`Device Proof M2: 0x${this.uint8ToHex(deviceProof)}`)
    this.log(`Device Nonce: 0x${this.uint8ToHex(deviceNonce)}`)

    // Verify device proof
    const verified = await this.srpClient.verifyDeviceProof(deviceProof)
    if (!verified) {
      throw new Error('Failed to verify device proof M2!')
    }

    // Store session key and nonce
    this.sessionKey = this.srpClient.getSessionKey()

    // Single shared nonce for both encrypt/decrypt (ESP-IDF behavior)
    this.nonce = new Uint8Array(deviceNonce)

    this.log(`Session Key: 0x${this.uint8ToHex(this.sessionKey)}`)
    this.log('Security2 session established successfully')
  }

  /**
   * AES-256-GCM Encryption
   */
  async encryptData(plaintext: Uint8Array): Promise<Uint8Array> {
    if (!this.sessionKey || !this.nonce) {
      throw new Error('Session not established')
    }

    const keyBuffer = this.sessionKey.buffer.slice(
      this.sessionKey.byteOffset,
      this.sessionKey.byteOffset + this.sessionKey.byteLength,
    ) as ArrayBuffer

    const key = await crypto.subtle.importKey('raw', keyBuffer, { name: 'AES-GCM' }, false, [
      'encrypt',
    ])

    // AES-GCM with 96-bit nonce, 128-bit tag (default)
    const iv = this.nonce.buffer.slice(
      this.nonce.byteOffset,
      this.nonce.byteOffset + this.nonce.byteLength,
    ) as ArrayBuffer
    const data = plaintext.buffer.slice(
      plaintext.byteOffset,
      plaintext.byteOffset + plaintext.byteLength,
    ) as ArrayBuffer
    const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, data)

    // Increment shared nonce (big-endian counter in last 4 bytes)
    this.incrementNonce(this.nonce)

    return new Uint8Array(ciphertext)
  }

  /**
   * AES-256-GCM Decryption
   */
  async decryptData(ciphertext: Uint8Array): Promise<Uint8Array> {
    if (!this.sessionKey || !this.nonce) {
      throw new Error('Session not established')
    }

    const keyBuffer = this.sessionKey.buffer.slice(
      this.sessionKey.byteOffset,
      this.sessionKey.byteOffset + this.sessionKey.byteLength,
    ) as ArrayBuffer

    const key = await crypto.subtle.importKey('raw', keyBuffer, { name: 'AES-GCM' }, false, [
      'decrypt',
    ])

    const iv = this.nonce.buffer.slice(
      this.nonce.byteOffset,
      this.nonce.byteOffset + this.nonce.byteLength,
    ) as ArrayBuffer
    const data = ciphertext.buffer.slice(
      ciphertext.byteOffset,
      ciphertext.byteOffset + ciphertext.byteLength,
    ) as ArrayBuffer
    const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, data)

    // Increment shared nonce
    this.incrementNonce(this.nonce)

    return new Uint8Array(plaintext)
  }

  /**
   * Increment 96-bit nonce (big-endian counter in last 4 bytes)
   * ESP-IDF increments the last 4 bytes as a 32-bit big-endian counter
   */
  private incrementNonce(nonce: Uint8Array): void {
    // nonce is 12 bytes, last 4 bytes are the counter (big-endian)
    const counterOffset = 8 // bytes 8-11 are the counter

    for (let i = 11; i >= counterOffset; i--) {
      if (nonce[i] === 255) {
        nonce[i] = 0
      } else {
        nonce[i]++
        break
      }
    }
  }

  private uint8ToHex(bytes: Uint8Array): string {
    return Array.from(bytes)
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('')
  }
}
