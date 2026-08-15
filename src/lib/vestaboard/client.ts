// =============================================================================
// Vestaboard GraphQL transport.
//
// Their whole API is one endpoint. Auth is the raw Auth0 access token in an
// `x-vestaboard-token` header — note it is NOT an `Authorization: Bearer`
// header, and the token is passed without any prefix.
// =============================================================================

import { nativeFetch } from '@/lib/http/nativeFetch'

const GRAPHQL_URL = 'https://api.vestaboard.com/graphql'

interface GraphQLError {
  message: string
  extensions?: { code?: string }
}

interface GraphQLResponse<T> {
  data?: T
  errors?: GraphQLError[]
}

export class VestaboardApiError extends Error {
  /** GraphQL `extensions.code`, e.g. `TOKEN_REFRESH_REQUIRED`. */
  readonly code?: string
  /** HTTP status, when the failure was at the transport level. */
  readonly status?: number

  constructor(message: string, opts: { code?: string; status?: number } = {}) {
    super(message)
    this.name = 'VestaboardApiError'
    this.code = opts.code
    this.status = opts.status
  }

  /**
   * True when the access token is stale. Vestaboard signals this two ways: a
   * 401, or a 200 carrying a `TOKEN_REFRESH_REQUIRED` GraphQL error.
   */
  get needsRefresh(): boolean {
    return this.status === 401 || this.code === 'TOKEN_REFRESH_REQUIRED'
  }
}

/** Execute one operation against the Vestaboard API. */
export async function vestaboardQuery<T>(
  accessToken: string,
  operationName: string,
  query: string,
  variables: Record<string, unknown> = {},
): Promise<T> {
  let res: Response
  try {
    res = await nativeFetch(GRAPHQL_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: '*/*',
        'x-vestaboard-token': accessToken,
      },
      body: JSON.stringify({ operationName, query, variables }),
    })
  } catch (err) {
    throw new VestaboardApiError(err instanceof Error ? err.message : 'Could not reach Vestaboard')
  }

  const text = await res.text()
  let body: GraphQLResponse<T>
  try {
    body = text ? JSON.parse(text) : {}
  } catch {
    throw new VestaboardApiError(`Unexpected response from Vestaboard (${res.status})`, {
      status: res.status,
    })
  }

  // Check errors before status: a stale token comes back as HTTP 200 with a
  // TOKEN_REFRESH_REQUIRED error, and the caller needs that code to know it
  // should refresh rather than surface a failure.
  const first = body.errors?.[0]
  if (first) {
    throw new VestaboardApiError(first.message, {
      code: first.extensions?.code,
      status: res.status,
    })
  }
  if (!res.ok) {
    throw new VestaboardApiError(`Vestaboard request failed (${res.status})`, {
      status: res.status,
    })
  }
  if (!body.data) {
    throw new VestaboardApiError('Vestaboard returned no data')
  }
  return body.data
}
