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
  SetDeviceCertRequestSchema,
} from '@/types/proto/kd/v1/console_pb'

/**
 * KD Console Module
 * Handles device console commands for crypto state management
 *
 * Simplified BLE Console Protocol:
 * Frame Format (max 512 bytes MTU):
 * Header (6 bytes): magic(1) | total_len_hi | total_len_lo | chunk_idx | chunk_len_hi | chunk_len_lo
 * Payload: up to 504 bytes
 * Trailer (2 bytes): crc_hi | crc_lo
 * Total frame size: 512 bytes max (6 + 504 + 2)
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
const FRAME_HEADER_SIZE = 6 // magic(1) + total_len(2) + chunk_idx(1) + chunk_len(2)
const FRAME_CRC_SIZE = 2
const MAX_PAYLOAD_PER_CHUNK = 504 // 512 MTU - 6 header - 2 CRC
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

  console.log(`[writeRaw] Plain data length: ${data.length}`)
  const encrypted = sec1.value.encryptData(data)
  console.log(`[writeRaw] Encrypted length: ${encrypted.length}`)

  await BleClient.write(
    connectedDevice.value.deviceId,
    KOIOS_SERVICE_UUID,
    getCharacteristicUUID(),
    new DataView(encrypted.buffer)
  )
  console.log('[writeRaw] Write complete')
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
  console.log('[readRaw] Encrypted length:', encrypted.length)

  const decrypted = sec1.value.decryptData(encrypted)
  console.log('[readRaw] Decrypted length:', decrypted.length)

  return decrypted
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
  console.log('[requestNextChunk] Sending 0xBB...')
  const response = await sendControlCommand(CMD_NEXT_CHUNK)

  if (response.length === 1 && response[0] === RESP_NO_MORE_DATA) {
    console.log('[requestNextChunk] Got 0x00 - no more data')
    return null
  }

  console.log(`[requestNextChunk] Got ${response.length} bytes`)
  return response
}

/**
 * Request retransmission of the last chunk
 * Sends 0xCC, returns the retransmitted chunk
 */
async function requestRetransmit(): Promise<Uint8Array> {
  console.log('[requestRetransmit] Sending 0xCC...')
  const response = await sendControlCommand(CMD_RETRANSMIT)
  console.log(`[requestRetransmit] Got ${response.length} bytes`)
  return response
}

/**
 * Build a framed chunk for transmission
 * Format: magic(1) | total_len(2) | chunk_idx(1) | chunk_len(2) | payload | crc16(2)
 */
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

  console.log(`[buildFrame] totalLen=${totalLen}, chunkIdx=${chunkIdx}, chunkLen=${chunkLen}`)
  console.log(`[buildFrame] Header bytes: ${hexDump(frame.slice(0, FRAME_HEADER_SIZE))}`)
  console.log(`[buildFrame] CRC=0x${crc.toString(16).padStart(4, '0')}, frame size=${frame.length}`)
  console.log(`[buildFrame] Full frame: ${hexDump(frame)}`)

  return frame
}

type ParseFrameResult =
  | { success: true; totalLen: number; chunkIdx: number; chunkData: Uint8Array }
  | { success: false; error: string; isCrcError: boolean }

/**
 * Helper to format bytes as hex string for debugging
 */
function hexDump(data: Uint8Array, maxBytes = 32): string {
  const slice = data.slice(0, Math.min(maxBytes, data.length))
  const hex = Array.from(slice)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join(' ')
  return data.length > maxBytes ? `${hex} ... (${data.length} bytes total)` : hex
}

/**
 * Parse and validate a framed response
 * Returns a result object - use isCrcError to determine if retransmit may help
 */
function parseFrame(frame: Uint8Array): ParseFrameResult {
  console.log('[parseFrame] Input frame:', hexDump(frame))

  if (frame.length < FRAME_HEADER_SIZE + FRAME_CRC_SIZE) {
    console.log('[parseFrame] ERROR: Frame too short')
    return { success: false, error: `Frame too short: ${frame.length} bytes`, isCrcError: false }
  }

  if (frame[0] !== FRAME_MAGIC) {
    console.log('[parseFrame] ERROR: Invalid magic byte')
    return {
      success: false,
      error: `Invalid frame magic: 0x${frame[0].toString(16).padStart(2, '0')}`,
      isCrcError: false,
    }
  }

  const totalLen = (frame[1] << 8) | frame[2]
  const chunkIdx = frame[3]
  const chunkLen = (frame[4] << 8) | frame[5]

  console.log(`[parseFrame] Header: totalLen=${totalLen}, chunkIdx=${chunkIdx}, chunkLen=${chunkLen}`)
  console.log(`[parseFrame] Frame length=${frame.length}, expected min=${FRAME_HEADER_SIZE + chunkLen + FRAME_CRC_SIZE}`)

  const expectedFrameSize = FRAME_HEADER_SIZE + chunkLen + FRAME_CRC_SIZE
  if (frame.length < expectedFrameSize) {
    console.log('[parseFrame] ERROR: Frame incomplete')
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

  console.log(`[parseFrame] CRC offset=${crcOffset}, bytes=[0x${frame[crcOffset].toString(16).padStart(2, '0')}, 0x${frame[crcOffset + 1].toString(16).padStart(2, '0')}]`)
  console.log(`[parseFrame] Received CRC=0x${receivedCRC.toString(16).padStart(4, '0')}, Calculated CRC=0x${calculatedCRC.toString(16).padStart(4, '0')}`)
  console.log(`[parseFrame] Chunk data (first 16 bytes):`, hexDump(chunkData, 16))

  if (receivedCRC !== calculatedCRC) {
    console.log('[parseFrame] ERROR: CRC mismatch')
    // Also log the last few bytes of the frame to check for alignment issues
    console.log(`[parseFrame] Frame tail (last 8 bytes):`, hexDump(frame.slice(-8), 8))
    return {
      success: false,
      error:
        `CRC mismatch: received 0x${receivedCRC.toString(16).padStart(4, '0')}, ` +
        `calculated 0x${calculatedCRC.toString(16).padStart(4, '0')}`,
      isCrcError: true,
    }
  }

  console.log('[parseFrame] SUCCESS: Frame valid')
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
  let chunkIdx = 0

  while (chunkIdx < numChunks) {
    const offset = chunkIdx * MAX_PAYLOAD_PER_CHUNK
    const chunkData = payload.slice(offset, Math.min(offset + MAX_PAYLOAD_PER_CHUNK, totalLen))

    const frame = buildFrame(totalLen, chunkIdx, chunkData)
    console.log(`[sendKDConsoleCommand] Sending chunk ${chunkIdx}/${numChunks - 1}: ${chunkData.length} bytes`)

    let retransmitAttempts = 0

    while (retransmitAttempts < MAX_RETRANSMIT_ATTEMPTS) {
      await writeRaw(frame)

      // Read response after each chunk
      const response = await readRaw()
      console.log(
        `[sendKDConsoleCommand] After chunk ${chunkIdx}, got ${response.length} byte response:`,
        hexDump(response, 16)
      )

      // Check for control command responses
      if (response.length === 1) {
        if (response[0] === CMD_NEXT_CHUNK) {
          // Device says "next chunk please" (0xBB)
          console.log('[sendKDConsoleCommand] Device ACK: 0xBB (send next chunk)')
          break // Move to next chunk
        } else if (response[0] === CMD_RETRANSMIT) {
          // Device says "CRC error, retransmit" (0xCC)
          retransmitAttempts++
          console.warn(
            `[sendKDConsoleCommand] Device NAK: 0xCC (CRC error), retransmitting chunk ${chunkIdx} (attempt ${retransmitAttempts}/${MAX_RETRANSMIT_ATTEMPTS})`
          )
          continue // Retry sending the same chunk
        } else {
          console.log(`[sendKDConsoleCommand] Unexpected single-byte response: 0x${response[0].toString(16).padStart(2, '0')}`)
          break // Proceed anyway
        }
      }

      // On the last chunk, the response should be the first response frame
      if (chunkIdx === numChunks - 1) {
        // Check if we got a framed response
        if (response.length > 1 && response[0] === FRAME_MAGIC) {
          console.log('[sendKDConsoleCommand] Got first response frame with request response')
          firstResponseFrame = response
        } else {
          console.log('[sendKDConsoleCommand] Response after last chunk is not a frame')
        }
      }
      break // Success, move to next chunk
    }

    if (retransmitAttempts >= MAX_RETRANSMIT_ATTEMPTS) {
      throw new Error(`Failed to send chunk ${chunkIdx} after ${MAX_RETRANSMIT_ATTEMPTS} retransmit attempts`)
    }

    chunkIdx++
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

/**
 * Set device certificate (PEM format)
 */
export async function setDeviceCert(certPem: string): Promise<void> {
  console.log('setDeviceCert: Creating request')

  const certPemBytes = new TextEncoder().encode(certPem)

  const request = create(ConsoleMessageSchema, {
    payload: {
      case: 'setDeviceCertRequest',
      value: create(SetDeviceCertRequestSchema, {
        certPem: certPemBytes,
      }),
    },
  })

  const requestBytes = toBinary(ConsoleMessageSchema, request)
  const responseBytes = await sendKDConsoleCommand(requestBytes)
  const response = fromBinary(ConsoleMessageSchema, responseBytes)

  if (response.payload.case !== 'setDeviceCertResponse') {
    throw new Error(`Unexpected response type: ${response.payload.case}`)
  }

  if (response.payload.value.result?.success !== true) {
    throw new Error('Failed to set device certificate')
  }
}
