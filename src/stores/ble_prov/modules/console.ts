import { activeMethod } from './connection'
import type { KDCryptoStatus, KD_DSParams } from '../methods/esp-prov/helpers/kd_console'

/**
 * KD Console Module
 *
 * Thin dispatcher. The kd_console wire protocol is a Koios extension only
 * implemented by esp-prov on devices with a crypto module — when the active
 * method doesn't expose `console`, these calls throw.
 */

function requireConsole() {
  const console = activeMethod.value?.console
  if (!console) {
    throw new Error('Active method does not expose a kd_console interface')
  }
  return console
}

export async function getCryptoStatus(): Promise<KDCryptoStatus> {
  return requireConsole().getCryptoStatus()
}

export async function getCSR(): Promise<string> {
  return requireConsole().getCSR()
}

export async function getDSParams(): Promise<KD_DSParams> {
  return requireConsole().getDSParams()
}

export async function setDSParams(params: KD_DSParams): Promise<void> {
  return requireConsole().setDSParams(params)
}

export async function setClaimToken(token: string): Promise<void> {
  return requireConsole().setClaimToken(token)
}

export async function setDeviceCert(certPem: string): Promise<void> {
  return requireConsole().setDeviceCert(certPem)
}
