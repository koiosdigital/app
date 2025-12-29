import * as stable from '@stablelib/x25519'
import { AESCipher, create as createAES } from '@libp2p/aes-ctr'

import { create, toBinary, fromBinary } from '@bufbuild/protobuf'
import { SecSchemeVersion, SessionDataSchema } from '@/types/proto/session_pb'
import { Sec1MsgType, Sec1PayloadSchema } from '@/types/proto/sec1_pb'

enum SecurityState {
  REQUEST1,
  RESPONSE1_REQUEST2,
  RESPONSE2,
  FINISHED,
}

export type SecurityHandler = (responseData: Uint8Array) => Promise<Uint8Array | null>

export class Security1 {
  private sessionState = SecurityState.REQUEST1
  private pop: Uint8Array
  private clientPrivateKey!: Uint8Array
  private clientPublicKey!: Uint8Array
  private devicePublicKey!: Uint8Array
  private cipher!: AESCipher
  private verbose: boolean

  constructor(pop: string, verbose = false) {
    this.pop = new TextEncoder().encode(pop)
    this.verbose = verbose
  }

  private async generateKeyPair() {
    if (this.clientPrivateKey) return
    //this.clientPrivateKey = ed.utils.randomPrivateKey();
    const keypair = stable.generateKeyPair()
    this.clientPrivateKey = keypair.secretKey
    this.clientPublicKey = keypair.publicKey
  }

  private log(message: string) {
    if (this.verbose) {
      console.debug(`%c++++ ${message} ++++`, 'color: #32cd32')
    }
  }

  async handleSession(responseData: Uint8Array | undefined): Promise<Uint8Array | undefined> {
    switch (this.sessionState) {
      case SecurityState.REQUEST1:
        this.sessionState = SecurityState.RESPONSE1_REQUEST2
        return this.setup0Request()

      case SecurityState.RESPONSE1_REQUEST2:
        if (!responseData) throw new Error('Missing response data')
        this.sessionState = SecurityState.RESPONSE2
        await this.setup0Response(responseData)
        return this.setup1Request()

      case SecurityState.RESPONSE2:
        if (!responseData) throw new Error('Missing response data')
        this.sessionState = SecurityState.FINISHED
        await this.setup1Response(responseData)
        return undefined

      default:
        throw new Error('Unexpected session state')
    }
  }

  private async setup0Request(): Promise<Uint8Array> {
    await this.generateKeyPair()
    const setupReq = create(SessionDataSchema)
    setupReq.secVer = SecSchemeVersion.SecScheme1
    setupReq.proto.case = 'sec1'
    setupReq.proto.value = create(Sec1PayloadSchema)
    setupReq.proto.value.msg = Sec1MsgType.Session_Command0
    setupReq.proto.value.payload.case = 'sc0'
    setupReq.proto.value.payload.value = {
      clientPubkey: this.clientPublicKey,
      $typeName: 'ble_prov.SessionCmd0',
    }

    this.log(`Client Public Key: 0x${this.uint8ToHex(this.clientPublicKey)}`)
    this.log(`Client Private Key: 0x${this.uint8ToHex(this.clientPrivateKey)}`)
    return toBinary(SessionDataSchema, setupReq)
  }

  private async setup0Response(responseData: Uint8Array) {
    const setupResp = fromBinary(SessionDataSchema, responseData)

    if (setupResp.secVer !== SecSchemeVersion.SecScheme1 || setupResp.proto.case !== 'sec1') {
      throw new Error('Incorrect security scheme')
    }

    if (setupResp.proto.value.payload.case !== 'sr0') {
      throw new Error('Incorrect message type')
    }

    this.devicePublicKey = setupResp.proto.value.payload.value.devicePubkey
    const sharedKey = stable.sharedKey(this.clientPrivateKey, this.devicePublicKey, true)

    if (this.pop.length > 0) {
      const popHash = new Uint8Array(
        await crypto.subtle.digest('SHA-256', new Uint8Array(this.pop)),
      )
      sharedKey.set(this.xorBytes(sharedKey, popHash))
    }

    this.cipher = createAES(sharedKey, setupResp.proto.value.payload.value.deviceRandom)

    this.log(`Device Public Key: 0x${this.uint8ToHex(this.devicePublicKey)}`)
    this.log(
      `Device Random: 0x${this.uint8ToHex(setupResp.proto.value.payload.value.deviceRandom)}`,
    )
    this.log(`Shared Key: 0x${this.uint8ToHex(sharedKey)}`)
  }

  private async setup1Request(): Promise<Uint8Array> {
    const encryptedDeviceKey = this.cipher.encrypt(this.devicePublicKey)
    this.log(`Client Proof: 0x${this.uint8ToHex(encryptedDeviceKey)}`)

    const setupReq = create(SessionDataSchema)
    setupReq.secVer = SecSchemeVersion.SecScheme1
    setupReq.proto.case = 'sec1'
    setupReq.proto.value = create(Sec1PayloadSchema)
    setupReq.proto.value.msg = Sec1MsgType.Session_Command1
    setupReq.proto.value.payload.case = 'sc1'
    setupReq.proto.value.payload.value = {
      clientVerifyData: encryptedDeviceKey,
      $typeName: 'ble_prov.SessionCmd1',
    }

    return toBinary(SessionDataSchema, setupReq)
  }

  private async setup1Response(responseData: Uint8Array) {
    const setupResp = fromBinary(SessionDataSchema, responseData)
    if (setupResp.secVer !== SecSchemeVersion.SecScheme1 || setupResp.proto.case !== 'sec1') {
      throw new Error('Incorrect security scheme')
    }
    if (setupResp.proto.value.payload.case !== 'sr1') {
      throw new Error('Incorrect message type')
    }

    const decrypted = this.cipher.encrypt(setupResp.proto.value.payload.value.deviceVerifyData)

    this.log(`Device Proof: 0x${this.uint8ToHex(decrypted)}`)
    this.log(`Client Public Key: 0x${this.uint8ToHex(this.clientPublicKey)}`)

    if (!this.uint8Equals(decrypted, this.clientPublicKey)) {
      throw new Error('Failed to verify device!')
    }
  }

  private xorBytes(a: Uint8Array, b: Uint8Array): Uint8Array {
    return a.map((val, i) => val ^ b[i])
  }

  private uint8ToHex(bytes: Uint8Array): string {
    return Array.from(bytes)
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('')
  }

  private uint8Equals(a: Uint8Array, b: Uint8Array): boolean {
    return a.length === b.length && a.every((val, i) => val === b[i])
  }

  encryptData(data: Uint8Array): Uint8Array {
    return this.cipher.encrypt(data)
  }

  decryptData(data: Uint8Array): Uint8Array {
    return this.cipher.encrypt(data)
  }
}
