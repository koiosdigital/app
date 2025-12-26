import { defineStore } from 'pinia'
import { ref } from 'vue'
import * as connection from './modules/connection'
import * as session from './modules/session'
import * as wifi from './modules/wifi'
import * as kdConsole from './modules/console'

/**
 * BLE Provisioning Store
 * Unified store that exports all BLE provisioning modules
 */
export const useBleProvStore = defineStore('ble_prov', () => {
  // Global error state for GATT errors
  const gattError = ref<{ title: string; description: string } | undefined>(undefined)

  /**
   * Check if an error is a GATT error
   */
  function isGattError(error: unknown): boolean {
    if (!(error instanceof Error)) return false
    const message = error.message.toLowerCase()
    return (
      message.includes('gatt') ||
      message.includes('bluetooth') ||
      message.includes('device not connected') ||
      message.includes('characteristic not found') ||
      message.includes('connection lost') ||
      message.includes('disconnected')
    )
  }

  /**
   * Set GATT error and prepare for restart
   */
  function setGattError(error: unknown) {
    console.error('GATT error detected:', error)
    gattError.value = {
      title: 'Bluetooth Connection Error',
      description:
        error instanceof Error
          ? error.message
          : 'Lost connection to device. Please restart the setup process.',
    }
  }

  /**
   * Clear GATT error
   */
  function clearGattError() {
    gattError.value = undefined
  }

  return {
    // Global error state
    gattError,
    setGattError,
    clearGattError,
    isGattError,

    // Connection module
    connection: {
      connectedDevice: connection.connectedDevice,
      connectedDeviceServiceMap: connection.connectedDeviceServiceMap,
      discoveredDevices: connection.discoveredDevices,
      isScanning: connection.isScanning,
      initializeBluetooth: connection.initializeBluetooth,
      startScan: connection.startScan,
      stopScan: connection.stopScan,
      connectToDevice: connection.connectToDevice,
      disconnectDevice: connection.disconnectDevice,
    },

    // Session module
    session: {
      sessionEstablished: session.sessionEstablished,
      sec1: session.sec1,
      establishSession: session.establishSession,
      resetSession: session.resetSession,
    },

    // WiFi module
    wifi: {
      discoveredAPs: wifi.discoveredAPs,
      scanningForAPs: wifi.scanningForAPs,
      connectingToAP: wifi.connectingToAP,
      connectedToAP: wifi.connectedToAP,
      scanForAPs: wifi.scanForAPs,
      connectToAP: wifi.connectToAP,
      resetWiFiState: wifi.resetWiFiState,
    },

    // Console module
    console: {
      getCryptoStatus: kdConsole.getCryptoStatus,
      getCSR: kdConsole.getCSR,
      getDSParams: kdConsole.getDSParams,
      setDSParams: kdConsole.setDSParams,
      setClaimToken: kdConsole.setClaimToken,
      setDeviceCert: kdConsole.setDeviceCert,
    },
  }
})

// Export types
export type { WifiAP } from './modules/wifi'
export { KDCryptoStatus, type KD_DSParams } from './helpers/kd_console'
