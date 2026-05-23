import { create, toBinary, fromBinary } from '@bufbuild/protobuf'
import {
  ConsoleMessageSchema,
  type ConsoleMessage,
  CryptoStatusRequestSchema,
  GetCsrRequestSchema,
  GetDsParamsRequestSchema,
  SetDsParamsRequestSchema,
  SetClaimTokenRequestSchema,
  SetDeviceCertRequestSchema,
  SetDsParamsRequest,
} from '@/types/proto/kd/v1/console_pb'
import { KDCryptoStatus, type KD_DSParams } from './helpers/kd_console'
import { rawRead, rawWrite, type CharacteristicMap } from './transport'
import type { EspProvSecurity } from './session'
import type { KdConsoleApi } from '../types'

/**
 * Simplified BLE Console Protocol (Koios kd_console extension):
 * Frame Format (max 512 bytes MTU):
 * Header (6 bytes): magic(1) | total_len_hi | total_len_lo | chunk_idx | chunk_len_hi | chunk_len_lo
 * Payload: up to 504 bytes
 * Trailer (2 bytes): crc_hi | crc_lo
 *
 * Control Commands (single byte, no framing):
 * - 0xAA: Reset state machine → Response: 0xFF
 * - 0xBB: Request next response chunk → Next chunk or 0x00 if none
 * - 0xCC: Retransmit last sent chunk → Last chunk again
 */

const KD_CONSOLE_CHAR = 'kd_console'

const CMD_RESET = 0xaa
const CMD_NEXT_CHUNK = 0xbb
const CMD_RETRANSMIT = 0xcc

const RESP_RESET_ACK = 0xff
const RESP_NO_MORE_DATA = 0x00

const FRAME_MAGIC = 0xa5
const FRAME_HEADER_SIZE = 6
const FRAME_CRC_SIZE = 2
const MAX_PAYLOAD_PER_CHUNK = 504
const MAX_RETRANSMIT_ATTEMPTS = 3

function calculateCRC16(data: Uint8Array): number {
  let crc = 0xffff
  for (let i = 0; i < data.length; i++) {
    crc ^= data[i] << 8
    for (let j = 0; j < 8; j++) {
      if (crc & 0x8000) {
        crc = (crc << 1) ^ 0x1021
      } else {
        crc = crc << 1
      }
    }
  }
  return crc & 0xffff
}

function buildFrame(totalLen: number, chunkIdx: number, chunkData: Uint8Array): Uint8Array {
  const chunkLen = chunkData.length
  const frame = new Uint8Array(FRAME_HEADER_SIZE + chunkLen + FRAME_CRC_SIZE)

  frame[0] = FRAME_MAGIC
  frame[1] = (totalLen >> 8) & 0xff
  frame[2] = totalLen & 0xff
  frame[3] = chunkIdx
  frame[4] = (chunkLen >> 8) & 0xff
  frame[5] = chunkLen & 0xff
  frame.set(chunkData, FRAME_HEADER_SIZE)

  const crc = calculateCRC16(chunkData)
  frame[FRAME_HEADER_SIZE + chunkLen] = (crc >> 8) & 0xff
  frame[FRAME_HEADER_SIZE + chunkLen + 1] = crc & 0xff

  return frame
}

type ParseFrameResult =
  | { success: true; totalLen: number; chunkIdx: number; chunkData: Uint8Array }
  | { success: false; error: string; isCrcError: boolean }

function parseFrame(frame: Uint8Array): ParseFrameResult {
  if (frame.length < FRAME_HEADER_SIZE + FRAME_CRC_SIZE) {
    return { success: false, error: `Frame too short: ${frame.length} bytes`, isCrcError: false }
  }
  if (frame[0] !== FRAME_MAGIC) {
    return {
      success: false,
      error: `Invalid frame magic: 0x${frame[0].toString(16).padStart(2, '0')}`,
      isCrcError: false,
    }
  }

  const totalLen = (frame[1] << 8) | frame[2]
  const chunkIdx = frame[3]
  const chunkLen = (frame[4] << 8) | frame[5]

  const expectedFrameSize = FRAME_HEADER_SIZE + chunkLen + FRAME_CRC_SIZE
  if (frame.length < expectedFrameSize) {
    return {
      success: false,
      error: `Frame incomplete: expected ${expectedFrameSize}, got ${frame.length}`,
      isCrcError: false,
    }
  }

  const chunkData = frame.slice(FRAME_HEADER_SIZE, FRAME_HEADER_SIZE + chunkLen)
  const crcOffset = FRAME_HEADER_SIZE + chunkLen
  const receivedCRC = (frame[crcOffset] << 8) | frame[crcOffset + 1]
  const calculatedCRC = calculateCRC16(chunkData)

  if (receivedCRC !== calculatedCRC) {
    return {
      success: false,
      error:
        `CRC mismatch: received 0x${receivedCRC.toString(16).padStart(4, '0')}, ` +
        `calculated 0x${calculatedCRC.toString(16).padStart(4, '0')}`,
      isCrcError: true,
    }
  }

  return { success: true, totalLen, chunkIdx, chunkData }
}

/**
 * Build a kd_console transport bound to a given device + security session.
 * Returned object implements `KdConsoleApi`.
 */
export function buildKdConsoleApi(
  deviceId: string,
  serviceMap: CharacteristicMap,
  security: EspProvSecurity,
): KdConsoleApi {
  async function writeEncrypted(data: Uint8Array): Promise<void> {
    const encrypted = await security.encryptData(data)
    await rawWrite(deviceId, serviceMap, KD_CONSOLE_CHAR, encrypted)
  }

  async function readDecrypted(): Promise<Uint8Array> {
    const encrypted = await rawRead(deviceId, serviceMap, KD_CONSOLE_CHAR)
    const decrypted = await security.decryptData(encrypted)
    return decrypted
  }

  async function sendControl(cmd: number): Promise<Uint8Array> {
    await writeEncrypted(new Uint8Array([cmd]))
    return await readDecrypted()
  }

  async function resetStateMachine(): Promise<void> {
    const response = await sendControl(CMD_RESET)
    if (response.length !== 1 || response[0] !== RESP_RESET_ACK) {
      throw new Error(
        `Reset failed: expected 0xFF, got ${Array.from(response)
          .map((b) => '0x' + b.toString(16).padStart(2, '0'))
          .join(' ')}`,
      )
    }
  }

  async function requestNextChunk(): Promise<Uint8Array | null> {
    const response = await sendControl(CMD_NEXT_CHUNK)
    if (response.length === 1 && response[0] === RESP_NO_MORE_DATA) return null
    return response
  }

  async function requestRetransmit(): Promise<Uint8Array> {
    return sendControl(CMD_RETRANSMIT)
  }

  async function parseFrameWithRetry(frame: Uint8Array): Promise<{
    totalLen: number
    chunkIdx: number
    chunkData: Uint8Array
  }> {
    let currentFrame = frame
    let attempts = 0

    while (attempts < MAX_RETRANSMIT_ATTEMPTS) {
      const result = parseFrame(currentFrame)
      if (result.success) {
        return { totalLen: result.totalLen, chunkIdx: result.chunkIdx, chunkData: result.chunkData }
      }
      if (!result.isCrcError) throw new Error(result.error)

      attempts++
      console.warn(`CRC error (attempt ${attempts}/${MAX_RETRANSMIT_ATTEMPTS}): ${result.error}`)
      if (attempts >= MAX_RETRANSMIT_ATTEMPTS) {
        throw new Error(`${result.error} after ${MAX_RETRANSMIT_ATTEMPTS} retransmit attempts`)
      }

      currentFrame = await requestRetransmit()
    }

    throw new Error('Unexpected error in parseFrameWithRetry')
  }

  async function sendKDConsoleCommand(payload: Uint8Array): Promise<Uint8Array> {
    await resetStateMachine()

    const totalLen = payload.length
    const numChunks = Math.ceil(totalLen / MAX_PAYLOAD_PER_CHUNK)

    let firstResponseFrame: Uint8Array | null = null
    let chunkIdx = 0

    while (chunkIdx < numChunks) {
      const offset = chunkIdx * MAX_PAYLOAD_PER_CHUNK
      const chunkData = payload.slice(offset, Math.min(offset + MAX_PAYLOAD_PER_CHUNK, totalLen))
      const frame = buildFrame(totalLen, chunkIdx, chunkData)

      let retransmitAttempts = 0

      while (retransmitAttempts < MAX_RETRANSMIT_ATTEMPTS) {
        await writeEncrypted(frame)
        const response = await readDecrypted()

        if (response.length === 1) {
          if (response[0] === CMD_NEXT_CHUNK) {
            break
          } else if (response[0] === CMD_RETRANSMIT) {
            retransmitAttempts++
            console.warn(
              `Device NAK: CRC error, retransmitting chunk ${chunkIdx} (attempt ${retransmitAttempts}/${MAX_RETRANSMIT_ATTEMPTS})`,
            )
            continue
          } else {
            break
          }
        }

        if (chunkIdx === numChunks - 1 && response.length > 1 && response[0] === FRAME_MAGIC) {
          firstResponseFrame = response
        }
        break
      }

      if (retransmitAttempts >= MAX_RETRANSMIT_ATTEMPTS) {
        throw new Error(
          `Failed to send chunk ${chunkIdx} after ${MAX_RETRANSMIT_ATTEMPTS} retransmit attempts`,
        )
      }

      chunkIdx++
    }

    const responseChunks: Uint8Array[] = []
    let expectedTotalLen = 0
    let receivedLen = 0

    if (firstResponseFrame) {
      const parsed = await parseFrameWithRetry(firstResponseFrame)
      expectedTotalLen = parsed.totalLen
      responseChunks.push(parsed.chunkData)
      receivedLen += parsed.chunkData.length
    }

    while (receivedLen < expectedTotalLen) {
      const nextFrame = await requestNextChunk()
      if (!nextFrame) {
        throw new Error(`No more data but expected ${expectedTotalLen - receivedLen} more bytes`)
      }
      const parsed = await parseFrameWithRetry(nextFrame)
      responseChunks.push(parsed.chunkData)
      receivedLen += parsed.chunkData.length
    }

    const responsePayload = new Uint8Array(expectedTotalLen)
    let offset = 0
    for (const chunk of responseChunks) {
      responsePayload.set(chunk, offset)
      offset += chunk.length
    }
    return responsePayload
  }

  async function sendConsoleRequest<T>(
    requestCase: string,
    requestValue: object,
    expectedResponseCase: string,
    extractValue: (responseValue: unknown) => T,
  ): Promise<T> {
    const request = create(ConsoleMessageSchema, {
      payload: { case: requestCase, value: requestValue } as ConsoleMessage['payload'],
    })

    const requestBytes = toBinary(ConsoleMessageSchema, request)
    const responseBytes = await sendKDConsoleCommand(requestBytes)
    const response = fromBinary(ConsoleMessageSchema, responseBytes)

    if (response.payload.case !== expectedResponseCase) {
      throw new Error(`Unexpected response type: ${response.payload.case}`)
    }
    return extractValue(response.payload.value)
  }

  return {
    async getCryptoStatus(): Promise<KDCryptoStatus> {
      return sendConsoleRequest(
        'cryptoStatusRequest',
        create(CryptoStatusRequestSchema),
        'cryptoStatusResponse',
        (value) => (value as { status: KDCryptoStatus }).status,
      )
    },

    async getCSR(): Promise<string> {
      return sendConsoleRequest(
        'getCsrRequest',
        create(GetCsrRequestSchema),
        'getCsrResponse',
        (value) => new TextDecoder().decode((value as { csrPem: Uint8Array }).csrPem),
      )
    },

    async getDSParams(): Promise<KD_DSParams> {
      return sendConsoleRequest(
        'getDsParamsRequest',
        create(GetDsParamsRequestSchema),
        'getDsParamsResponse',
        (value) =>
          ({
            ds_key_id: (value as SetDsParamsRequest).keyBlockId,
            rsa_len: (value as SetDsParamsRequest).rsaLen,
            cipher_c: (value as SetDsParamsRequest).cipherC,
            iv: (value as SetDsParamsRequest).iv,
          }) as KD_DSParams,
      )
    },

    async setDSParams(dsParams: KD_DSParams): Promise<void> {
      return sendConsoleRequest(
        'setDsParamsRequest',
        create(SetDsParamsRequestSchema, {
          keyBlockId: dsParams.ds_key_id,
          rsaLen: dsParams.rsa_len,
          cipherC: dsParams.cipher_c,
          iv: dsParams.iv,
        }),
        'setDsParamsResponse',
        (value) => {
          if ((value as { result?: { success?: boolean } }).result?.success !== true) {
            throw new Error('Failed to set DS params')
          }
        },
      )
    },

    async setClaimToken(claimToken: string): Promise<void> {
      return sendConsoleRequest(
        'setClaimTokenRequest',
        create(SetClaimTokenRequestSchema, { claimToken: new TextEncoder().encode(claimToken) }),
        'setClaimTokenResponse',
        (value) => {
          if ((value as { result?: { success?: boolean } }).result?.success !== true) {
            throw new Error('Failed to set claim token')
          }
        },
      )
    },

    async setDeviceCert(certPem: string): Promise<void> {
      return sendConsoleRequest(
        'setDeviceCertRequest',
        create(SetDeviceCertRequestSchema, { certPem: new TextEncoder().encode(certPem) }),
        'setDeviceCertResponse',
        (value) => {
          if ((value as { result?: { success?: boolean } }).result?.success !== true) {
            throw new Error('Failed to set device certificate')
          }
        },
      )
    },
  }
}
