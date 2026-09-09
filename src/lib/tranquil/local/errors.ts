/**
 * Error model for the Tranquil LAN-direct API, ported from tranquil-app.
 * The device's local HTTP/WS server is the source of these; distinct from the
 * cloud (koios-app) auth/api errors.
 */

export enum ErrorCode {
  Unknown = 'UNKNOWN',
  NetworkError = 'NETWORK_ERROR',
  WsDisconnected = 'WS_DISCONNECTED',
  Timeout = 'TIMEOUT',
  DeviceError = 'DEVICE_ERROR',
  InvalidRequest = 'INVALID_REQUEST',
  NotFound = 'NOT_FOUND',
  Unauthorized = 'UNAUTHORIZED',
  Forbidden = 'FORBIDDEN',
  CloudError = 'CLOUD_ERROR',
}

export class TranquilError extends Error {
  constructor(
    message: string,
    public code: ErrorCode = ErrorCode.Unknown,
    public details?: unknown,
  ) {
    super(message)
    this.name = 'TranquilError'
  }
}

export function formatTranquilError(error: unknown): string {
  if (error instanceof TranquilError) {
    switch (error.code) {
      case ErrorCode.WsDisconnected:
        return 'Connection lost. Reconnecting…'
      case ErrorCode.Timeout:
        return 'Request timed out. Please try again.'
      case ErrorCode.DeviceError:
        return `Device error: ${error.message}`
      case ErrorCode.NotFound:
        return 'Resource not found'
      case ErrorCode.NetworkError:
        return error.message || 'Cannot reach the table on your network.'
      case ErrorCode.Forbidden:
        return error.message || 'Only the owner can do that.'
      default:
        return error.message
    }
  }
  if (error instanceof Error) return error.message
  return 'An unexpected error occurred'
}
