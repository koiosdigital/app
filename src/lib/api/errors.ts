import type { components } from '@/types/api'

type ErrorResponseDto = components['schemas']['ErrorResponseDto']

/**
 * Type guard to check if an object is an ErrorResponseDto
 */
function isErrorResponse(error: unknown): error is ErrorResponseDto {
  return (
    typeof error === 'object' &&
    error !== null &&
    'message' in error &&
    typeof (error as ErrorResponseDto).message === 'string'
  )
}

/**
 * Extracts a human-readable error message from various error types.
 * Handles API error responses, Error objects, strings, and unknown types.
 *
 * @param error - The error to extract message from (API response, Error, string, or unknown)
 * @param fallback - Fallback message if extraction fails (default: 'An unexpected error occurred')
 * @returns Human-readable error message
 */
export function getErrorMessage(error: unknown, fallback = 'An unexpected error occurred'): string {
  // Handle null/undefined
  if (error == null) {
    return fallback
  }

  // Handle ErrorResponseDto from API
  if (isErrorResponse(error)) {
    return error.message
  }

  // Handle standard Error objects
  if (error instanceof Error) {
    return error.message
  }

  // Handle string errors
  if (typeof error === 'string') {
    return error
  }

  // Handle objects with a message property
  if (typeof error === 'object' && 'message' in error) {
    const msg = (error as { message: unknown }).message
    if (typeof msg === 'string') {
      return msg
    }
  }

  // Handle objects with an error property (nested error responses)
  if (typeof error === 'object' && 'error' in error) {
    const nested = (error as { error: unknown }).error
    return getErrorMessage(nested, fallback)
  }

  return fallback
}

/**
 * Creates an Error with the extracted message from an API error response.
 * Useful for throwing consistent errors from API calls.
 *
 * @param error - The error to convert
 * @param fallback - Fallback message if extraction fails
 * @returns Error object with extracted message
 */
export function toError(error: unknown, fallback = 'An unexpected error occurred'): Error {
  return new Error(getErrorMessage(error, fallback))
}
