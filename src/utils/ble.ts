import { BleClient } from '@capacitor-community/bluetooth-le'
import { Capacitor } from '@capacitor/core'

export interface BleAvailabilityResult {
  available: boolean
  errorMessage?: string
  errorTitle?: string
  instructions?: string[]
}

/**
 * Check if Bluetooth Low Energy is available on the current platform
 * Returns platform-specific error messages and instructions
 */
export async function checkBleAvailability(): Promise<BleAvailabilityResult> {
  const platform = Capacitor.getPlatform()

  // Web platform - require Chrome/Edge
  if (platform === 'web') {
    const isChrome = /Chrome|Chromium|Edg/.test(navigator.userAgent)
    if (!isChrome) {
      return {
        available: false,
        errorTitle: 'Browser Not Supported',
        errorMessage:
          'Bluetooth provisioning requires Chrome, Edge, or another Chromium-based browser.',
        instructions: [
          'Please open this page in Google Chrome or Microsoft Edge',
          'Alternatively, use the mobile app for the best experience',
        ],
      }
    }

    // Check if Web Bluetooth API is available
    if (!('bluetooth' in navigator)) {
      return {
        available: false,
        errorTitle: 'Bluetooth Not Available',
        errorMessage: 'Your browser does not support Web Bluetooth.',
        instructions: [
          'Ensure you are using a recent version of Chrome or Edge',
          'Check that Bluetooth is enabled on your device',
          'Some browsers disable Web Bluetooth in incognito/private mode',
        ],
      }
    }

    return { available: true }
  }

  // iOS platform
  if (platform === 'ios') {
    try {
      await BleClient.initialize()
      return { available: true }
    } catch (error) {
      return {
        available: false,
        errorTitle: 'Bluetooth Permission Required',
        errorMessage: 'This app needs Bluetooth access to set up your devices.',
        instructions: [
          'Open the Settings app',
          'Scroll down and tap "Koios"',
          'Enable Bluetooth permission',
          'Return to this app and try again',
        ],
      }
    }
  }

  // Android platform
  if (platform === 'android') {
    try {
      await BleClient.initialize()
      return { available: true }
    } catch (error) {
      return {
        available: false,
        errorTitle: 'Bluetooth Permission Required',
        errorMessage: 'This app needs Bluetooth and location access to set up your devices.',
        instructions: [
          'Open your device Settings',
          'Go to Apps > Koios > Permissions',
          'Enable "Nearby devices" or "Bluetooth" permission',
          'Enable "Location" permission (required for Bluetooth scanning on Android)',
          'Return to this app and try again',
        ],
      }
    }
  }

  // Unknown platform
  return {
    available: false,
    errorTitle: 'Platform Not Supported',
    errorMessage: `Bluetooth provisioning is not supported on ${platform}.`,
  }
}

/**
 * Initialize Bluetooth and return whether it was successful
 */
export async function initializeBluetooth(): Promise<boolean> {
  try {
    await BleClient.initialize()
    return true
  } catch (error) {
    console.error('Failed to initialize Bluetooth:', error)
    return false
  }
}
