import { BleClient } from '@capacitor-community/bluetooth-le'
import { connectedDevice, connectedDeviceServiceMap } from './connection'
import { sec1 } from './session'
import { KDCryptoStatus, type KD_DSParams } from '../helpers/kd_console'
import { create, toBinary, fromBinary } from '@bufbuild/protobuf'
import {
  ConsoleMessageSchema,
  CryptoStatusRequestSchema,
  GetCsrRequestSchema,
  GetDsParamsRequestSchema,
  SetDsParamsRequestSchema,
  SetClaimTokenRequestSchema,
} from '@/types/proto/kd/v1/console_pb'

/**
 * KD Console Module
 * Handles device console commands for crypto state management
 *
 * Simplified BLE Console Protocol:
 * Frame Format (max 512 bytes MTU):
 * | magic (1) | total_len (2) | chunk_idx (1) | chunk_len (1) | payload (≤505) | crc16 (2) |
 *
 * Control Commands (single byte, no framing):
 * - 0xAA: Reset state machine → Response: 0xFF
 * - 0xBB: Request next response chunk → Next chunk or 0x00 if none
 * - 0xCC: Retransmit last sent chunk → Last chunk again
 */

const KOIOS_SERVICE_UUID = '1775244D-6B43-439B-877C-060F2D9BED07'.toLowerCase()
const KD_CONSOLE_CHAR = 'kd_console'

// Control commands
const CMD_RESET = 0xaa
const CMD_NEXT_CHUNK = 0xbb
const CMD_RETRANSMIT = 0xcc  // Available for error recovery

// Response codes
const RESP_RESET_ACK = 0xff
const RESP_NO_MORE_DATA = 0x00

// Frame constants
const FRAME_MAGIC = 0xa5
const FRAME_HEADER_SIZE = 5 // magic(1) + total_len(2) + chunk_idx(1) + chunk_len(1)
const FRAME_CRC_SIZE = 2
const MAX_PAYLOAD_PER_CHUNK = 505 // 512 MTU - 5 header - 2 CRC
const MAX_RETRANSMIT_ATTEMPTS = 3

/**
 * Calculate CRC16-CCITT for payload data
 * Polynomial: 0x1021 (x^16 + x^12 + x^5 + 1)
 * Initial value: 0xFFFF
 */
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

/**
 * Get the kd_console characteristic UUID
 */
function getCharacteristicUUID(): string {
  const characteristic = connectedDeviceServiceMap.value.get(KD_CONSOLE_CHAR)
  if (!characteristic) {
    throw new Error('kd_console characteristic not found')
  }
  return characteristic.uuid
}

/**
 * Write raw data to kd_console characteristic (encrypted)
 */
async function writeRaw(data: Uint8Array): Promise<void> {
  if (!connectedDevice.value || !sec1.value) {
    throw new Error('Device not connected or session not established')
  }

  const encrypted = sec1.value.encryptData(data)
  await BleClient.write(
    connectedDevice.value.deviceId,
    KOIOS_SERVICE_UUID,
    getCharacteristicUUID(),
    new DataView(encrypted.buffer)
  )
}

/**
 * Read raw data from kd_console characteristic (decrypted)
 */
async function readRaw(): Promise<Uint8Array> {
  if (!connectedDevice.value || !sec1.value) {
    throw new Error('Device not connected or session not established')
  }

  const response = await BleClient.read(
    connectedDevice.value.deviceId,
    KOIOS_SERVICE_UUID,
    getCharacteristicUUID()
  )

  const encrypted = new Uint8Array(response.buffer)
  return sec1.value.decryptData(encrypted)
}

/**
 * Send a control command (single byte) and read response
 */
async function sendControlCommand(cmd: number): Promise<Uint8Array> {
  await writeRaw(new Uint8Array([cmd]))
  return await readRaw()
}

/**
 * Reset device state machine
 * Sends 0xAA, expects 0xFF response
 */
async function resetStateMachine(): Promise<void> {
  console.log('Resetting device state machine...')
  const response = await sendControlCommand(CMD_RESET)

  if (response.length !== 1 || response[0] !== RESP_RESET_ACK) {
    throw new Error(
      `Reset failed: expected 0xFF, got ${Array.from(response)
        .map((b) => '0x' + b.toString(16).padStart(2, '0'))
        .join(' ')}`
    )
  }
  console.log('State machine reset successful')
}

/**
 * Request next response chunk
 * Sends 0xBB, returns next chunk or null if no more data
 */
async function requestNextChunk(): Promise<Uint8Array | null> {
  const response = await sendControlCommand(CMD_NEXT_CHUNK)

  if (response.length === 1 && response[0] === RESP_NO_MORE_DATA) {
    return null
  }

  return response
}

/**
 * Request retransmission of the last chunk
 * Sends 0xCC, returns the retransmitted chunk
 */
async function requestRetransmit(): Promise<Uint8Array> {
  console.log('Requesting retransmit (0xCC)...')
  return await sendControlCommand(CMD_RETRANSMIT)
}

/**
 * Build a framed chunk for transmission
 * Format: magic(1) | total_len(2) | chunk_idx(1) | chunk_len(1) | payload | crc16(2)
 */
function buildFrame(totalLen: number, chunkIdx: number, chunkData: Uint8Array): Uint8Array {
  const chunkLen = chunkData.length
  const frame = new Uint8Array(FRAME_HEADER_SIZE + chunkLen + FRAME_CRC_SIZE)

  frame[0] = FRAME_MAGIC
  frame[1] = (totalLen >> 8) & 0xff
  frame[2] = totalLen & 0xff
  frame[3] = chunkIdx
  frame[4] = chunkLen
  frame.set(chunkData, FRAME_HEADER_SIZE)

  const crc = calculateCRC16(chunkData)
  frame[FRAME_HEADER_SIZE + chunkLen] = (crc >> 8) & 0xff
  frame[FRAME_HEADER_SIZE + chunkLen + 1] = crc & 0xff

  return frame
}

type ParseFrameResult =
  | { success: true; totalLen: number; chunkIdx: number; chunkData: Uint8Array }
  | { success: false; error: string; isCrcError: boolean }

/**
 * Parse and validate a framed response
 * Returns a result object - use isCrcError to determine if retransmit may help
 */
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
  const chunkLen = frame[4]

  const expectedFrameSize = FRAME_HEADER_SIZE + chunkLen + FRAME_CRC_SIZE
  if (frame.length < expectedFrameSize) {
    return {
      success: false,
      error: `Frame incomplete: expected ${expectedFrameSize}, got ${frame.length}`,
      isCrcError: false,
    }
  }

  const chunkData = frame.slice(FRAME_HEADER_SIZE, FRAME_HEADER_SIZE + chunkLen)
  const receivedCRC = (frame[FRAME_HEADER_SIZE + chunkLen] << 8) | frame[FRAME_HEADER_SIZE + chunkLen + 1]
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
 * Parse a frame with retransmit on CRC errors
 * @param frame Initial frame data
 * @returns Parsed frame result
 * @throws Error if parsing fails after max retransmit attempts
 */
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

    // Non-CRC errors are not recoverable via retransmit
    if (!result.isCrcError) {
      throw new Error(result.error)
    }

    attempts++
    console.warn(`CRC error (attempt ${attempts}/${MAX_RETRANSMIT_ATTEMPTS}): ${result.error}`)

    if (attempts >= MAX_RETRANSMIT_ATTEMPTS) {
      throw new Error(`${result.error} after ${MAX_RETRANSMIT_ATTEMPTS} retransmit attempts`)
    }

    // Request retransmit and try again
    currentFrame = await requestRetransmit()
  }

  // Should not reach here
  throw new Error('Unexpected error in parseFrameWithRetry')
}

/**
 * Send a KD Console command with the simplified protocol
 * @param payload Protobuf payload as Uint8Array
 * @returns Decrypted protobuf response payload
 */
async function sendKDConsoleCommand(payload: Uint8Array): Promise<Uint8Array> {
  if (!sec1.value) {
    throw new Error('Session not established')
  }

  console.log('sendKDConsoleCommand: payload length =', payload.length)

  // Step 1: Reset state machine
  await resetStateMachine()

  // Step 2: Send request chunks
  const totalLen = payload.length
  const numChunks = Math.ceil(totalLen / MAX_PAYLOAD_PER_CHUNK)
  console.log(`Sending ${numChunks} chunk(s), total ${totalLen} bytes`)

  let firstResponseFrame: Uint8Array | null = null

  for (let chunkIdx = 0; chunkIdx < numChunks; chunkIdx++) {
    const offset = chunkIdx * MAX_PAYLOAD_PER_CHUNK
    const chunkData = payload.slice(offset, Math.min(offset + MAX_PAYLOAD_PER_CHUNK, totalLen))

    const frame = buildFrame(totalLen, chunkIdx, chunkData)
    console.log(`Sending chunk ${chunkIdx}: ${chunkData.length} bytes`)

    await writeRaw(frame)

    // Read response after each chunk
    const response = await readRaw()

    // On the last chunk, the response should be the first response frame
    if (chunkIdx === numChunks - 1) {
      // Check if we got a framed response or empty
      if (response.length > 1 && response[0] === FRAME_MAGIC) {
        firstResponseFrame = response
      }
    }
  }

  // Step 3: Collect response chunks
  const responseChunks: Uint8Array[] = []
  let expectedTotalLen = 0
  let receivedLen = 0

  // Process first response if we got one
  if (firstResponseFrame) {
    const parsed = await parseFrameWithRetry(firstResponseFrame)
    expectedTotalLen = parsed.totalLen
    responseChunks.push(parsed.chunkData)
    receivedLen += parsed.chunkData.length
    console.log(`Response chunk 0: ${parsed.chunkData.length} bytes of ${expectedTotalLen} total`)
  }

  // Fetch remaining chunks using 0xBB
  while (receivedLen < expectedTotalLen) {
    console.log(`Fetching next chunk (have ${receivedLen}/${expectedTotalLen})`)

    const nextFrame = await requestNextChunk()
    if (!nextFrame) {
      throw new Error(`No more data but expected ${expectedTotalLen - receivedLen} more bytes`)
    }

    const parsed = await parseFrameWithRetry(nextFrame)
    responseChunks.push(parsed.chunkData)
    receivedLen += parsed.chunkData.length
    console.log(`Response chunk ${parsed.chunkIdx}: ${parsed.chunkData.length} bytes`)
  }

  // Step 4: Concatenate response chunks
  const responsePayload = new Uint8Array(expectedTotalLen)
  let offset = 0
  for (const chunk of responseChunks) {
    responsePayload.set(chunk, offset)
    offset += chunk.length
  }

  console.log('Response complete:', responsePayload.length, 'bytes')
  return responsePayload
}

/**
 * Get device crypto status
 */
export async function getCryptoStatus(): Promise<KDCryptoStatus> {
  console.log('getCryptoStatus: Creating request')

  const request = create(ConsoleMessageSchema, {
    payload: {
      case: 'cryptoStatusRequest',
      value: create(CryptoStatusRequestSchema),
    },
  })

  const requestBytes = toBinary(ConsoleMessageSchema, request)
  console.log('getCryptoStatus: Request bytes length =', requestBytes.length)

  const responseBytes = await sendKDConsoleCommand(requestBytes)
  console.log('getCryptoStatus: Response bytes length =', responseBytes.length)

  const response = fromBinary(ConsoleMessageSchema, responseBytes)
  console.log('getCryptoStatus: Response parsed, payload case =', response.payload.case)

  if (response.payload.case !== 'cryptoStatusResponse') {
    throw new Error(`Unexpected response type: ${response.payload.case}`)
  }

  const status = response.payload.value.status as KDCryptoStatus
  console.log('getCryptoStatus: Status =', status)

  return status
}

/**
 * Get Certificate Signing Request (CSR) from device
 */
export async function getCSR(): Promise<string> {
  console.log('getCSR: Creating request')

  const request = create(ConsoleMessageSchema, {
    payload: {
      case: 'getCsrRequest',
      value: create(GetCsrRequestSchema),
    },
  })

  const requestBytes = toBinary(ConsoleMessageSchema, request)
  const responseBytes = await sendKDConsoleCommand(requestBytes)
  const response = fromBinary(ConsoleMessageSchema, responseBytes)

  if (response.payload.case !== 'getCsrResponse') {
    throw new Error(`Unexpected response type: ${response.payload.case}`)
  }

  const csrBytes = response.payload.value.csrPem
  return new TextDecoder().decode(csrBytes)
}

/**
 * Get Digital Signature parameters
 */
export async function getDSParams(): Promise<KD_DSParams> {
  console.log('getDSParams: Creating request')

  const request = create(ConsoleMessageSchema, {
    payload: {
      case: 'getDsParamsRequest',
      value: create(GetDsParamsRequestSchema),
    },
  })

  const requestBytes = toBinary(ConsoleMessageSchema, request)
  const responseBytes = await sendKDConsoleCommand(requestBytes)
  const response = fromBinary(ConsoleMessageSchema, responseBytes)

  if (response.payload.case !== 'getDsParamsResponse') {
    throw new Error(`Unexpected response type: ${response.payload.case}`)
  }

  return JSON.parse(response.payload.value.dsParamsJson) as KD_DSParams
}

/**
 * Set Digital Signature parameters
 */
export async function setDSParams(dsParams: KD_DSParams): Promise<void> {
  console.log('setDSParams: Creating request')

  const request = create(ConsoleMessageSchema, {
    payload: {
      case: 'setDsParamsRequest',
      value: create(SetDsParamsRequestSchema, {
        dsParamsJson: JSON.stringify(dsParams),
      }),
    },
  })

  const requestBytes = toBinary(ConsoleMessageSchema, request)
  const responseBytes = await sendKDConsoleCommand(requestBytes)
  const response = fromBinary(ConsoleMessageSchema, responseBytes)

  if (response.payload.case !== 'setDsParamsResponse') {
    throw new Error(`Unexpected response type: ${response.payload.case}`)
  }

  if (response.payload.value.result?.success !== true) {
    throw new Error('Failed to set DS params')
  }
}

/**
 * Set claim token on device
 */
export async function setClaimToken(claimToken: string): Promise<void> {
  console.log('setClaimToken: Creating request')

  const claimTokenBytes = new TextEncoder().encode(claimToken)

  const request = create(ConsoleMessageSchema, {
    payload: {
      case: 'setClaimTokenRequest',
      value: create(SetClaimTokenRequestSchema, {
        claimToken: claimTokenBytes,
      }),
    },
  })

  const requestBytes = toBinary(ConsoleMessageSchema, request)
  const responseBytes = await sendKDConsoleCommand(requestBytes)
  const response = fromBinary(ConsoleMessageSchema, responseBytes)

  if (response.payload.case !== 'setClaimTokenResponse') {
    throw new Error(`Unexpected response type: ${response.payload.case}`)
  }

  if (response.payload.value.result?.success !== true) {
    throw new Error('Failed to set claim token')
  }
}
