import { Security0 } from './helpers/security/security_0'
import { Security1 } from './helpers/security/security_1'
import { Security2 } from './helpers/security/security_2'
import { sendData, type CharacteristicMap } from './transport'
import type { Security2Credentials } from '../types'

export type EspProvSecurity = Security0 | Security1 | Security2

/**
 * Run the esp-prov security handshake for the given security level. Returns
 * the security handler so callers can use it to encrypt/decrypt subsequent
 * traffic (wifi-scan, wifi-config, kd_console).
 */
export async function runSecurityHandshake(
  deviceId: string,
  serviceMap: CharacteristicMap,
  popOrCreds: string | Security2Credentials,
  level: 0 | 1 | 2,
): Promise<EspProvSecurity> {
  if (level === 0) {
    const sec = new Security0()
    const request = await sec.handleSession(undefined)
    const response = await sendData(deviceId, serviceMap, 'prov-session', request!)
    if (!response) throw new Error('No response from Security0 session')
    await sec.handleSession(response)
    return sec
  }

  if (level === 1) {
    const pop = typeof popOrCreds === 'string' ? popOrCreds : ''
    const sec = new Security1(pop)

    const session0 = await sec.handleSession(undefined)
    const response0 = await sendData(deviceId, serviceMap, 'prov-session', session0!)
    if (!response0) throw new Error('No response from session step 0')

    const session1 = await sec.handleSession(response0)
    const response1 = await sendData(deviceId, serviceMap, 'prov-session', session1!)
    if (!response1) throw new Error('No response from session step 1')

    await sec.handleSession(response1)
    return sec
  }

  // level === 2
  if (typeof popOrCreds === 'string') {
    throw new Error('Security2 requires username and password credentials')
  }
  const { username, password } = popOrCreds
  const sec = new Security2(username, password)

  const session0 = await sec.handleSession(undefined)
  const response0 = await sendData(deviceId, serviceMap, 'prov-session', session0!)
  if (!response0) throw new Error('No response from Security2 session step 0')

  const session1 = await sec.handleSession(response0)
  const response1 = await sendData(deviceId, serviceMap, 'prov-session', session1!)
  if (!response1) throw new Error('No response from Security2 session step 1')

  await sec.handleSession(response1)
  return sec
}
