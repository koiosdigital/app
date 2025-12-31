import { create, toBinary, fromBinary } from '@bufbuild/protobuf'
import { SecSchemeVersion, SessionDataSchema } from '@/types/proto/session_pb'
import { Sec0MsgType, Sec0PayloadSchema } from '@/types/proto/sec0_pb'
import { Status } from '@/types/proto/constants_pb'

enum SecurityState {
  REQUEST,
  RESPONSE,
  FINISHED,
}

/**
 * Security0 - No encryption, plaintext communication.
 * Used for devices without PoP support (e.g., CLOCK, TRANQUIL).
 *
 * Single request/response handshake with no key exchange.
 * All data is sent/received in plaintext.
 */
export class Security0 {
  private sessionState = SecurityState.REQUEST
  private verbose: boolean

  constructor(verbose = false) {
    this.verbose = verbose
  }

  private log(message: string) {
    if (this.verbose) {
      console.debug(`%c++++ ${message} ++++`, 'color: #32cd32')
    }
  }

  async handleSession(responseData: Uint8Array | undefined): Promise<Uint8Array | undefined> {
    switch (this.sessionState) {
      case SecurityState.REQUEST:
        this.sessionState = SecurityState.RESPONSE
        return this.sessionRequest()

      case SecurityState.RESPONSE:
        if (!responseData) throw new Error('Missing response data')
        this.sessionState = SecurityState.FINISHED
        await this.sessionResponse(responseData)
        return undefined

      default:
        throw new Error('Unexpected session state')
    }
  }

  private sessionRequest(): Uint8Array {
    this.log('Security0: Sending session request')

    const request = create(SessionDataSchema)
    request.secVer = SecSchemeVersion.SecScheme0
    request.proto.case = 'sec0'
    request.proto.value = create(Sec0PayloadSchema)
    request.proto.value.msg = Sec0MsgType.S0_Session_Command
    request.proto.value.payload.case = 'sc'
    request.proto.value.payload.value = {
      $typeName: 'ble_prov.S0SessionCmd',
    }

    return toBinary(SessionDataSchema, request)
  }

  private async sessionResponse(responseData: Uint8Array): Promise<void> {
    const response = fromBinary(SessionDataSchema, responseData)

    if (response.secVer !== SecSchemeVersion.SecScheme0 || response.proto.case !== 'sec0') {
      throw new Error('Incorrect security scheme in response')
    }

    if (response.proto.value.payload.case !== 'sr') {
      throw new Error('Incorrect message type in response')
    }

    const status = response.proto.value.payload.value.status

    if (status !== Status.Success) {
      throw new Error(`Security0 session failed with status: ${status}`)
    }

    this.log('Security0: Session established successfully')
  }

  /**
   * Encrypt data - Security0 is plaintext, so just return as-is
   */
  encryptData(data: Uint8Array): Uint8Array {
    return data
  }

  /**
   * Decrypt data - Security0 is plaintext, so just return as-is
   */
  decryptData(data: Uint8Array): Uint8Array {
    return data
  }
}
