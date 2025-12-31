<template>
  <div class="setup-view flex flex-col bg-zinc-950">
    <!-- Header -->
    <header
      class="sticky top-0 z-10 border-b border-white/10 bg-zinc-950/95 backdrop-blur px-5 py-4"
    >
      <div class="flex items-center gap-4">
        <UButton
          color="neutral"
          variant="ghost"
          icon="i-fa6-solid:arrow-left"
          square
          @click="router.back()"
        />
        <h1 class="text-xl font-semibold">Device Security</h1>
      </div>
    </header>

    <!-- Content -->
    <div class="flex flex-1 flex-col items-center justify-center p-5">
      <div class="w-full max-w-md space-y-6">
        <!-- Error Alert -->
        <UAlert
          v-if="error"
          icon="i-fa6-solid:circle-exclamation"
          color="error"
          :title="error.title"
          :description="error.description"
        />

        <!-- Checking Crypto Status -->
        <div v-if="isCheckingStatus" class="flex flex-1 items-center justify-center">
          <div class="space-y-3 text-center">
            <UIcon
              name="i-fa6-solid:spinner"
              class="mx-auto h-12 w-12 animate-spin text-primary-400"
            />
            <p class="text-sm text-white/70">{{ statusMessage }}</p>
          </div>
        </div>

        <!-- Valid Certificate -->
        <div v-else-if="cryptoStatus === KDCryptoStatus.VALID_CERT" class="space-y-6">
          <div
            class="flex items-center gap-3 rounded-lg border border-primary-500/20 bg-primary-500/10 p-4"
          >
            <UIcon
              name="i-fa6-solid:shield-halved"
              class="h-6 w-6 flex-shrink-0 text-primary-400"
            />
            <div>
              <h2 class="font-semibold text-primary-400">Device Verified</h2>
              <p class="text-sm text-white/70">Device has a valid certificate</p>
            </div>
          </div>

          <div v-if="isGettingClaimToken" class="flex flex-1 items-center justify-center">
            <div class="space-y-3 text-center">
              <UIcon
                name="i-fa6-solid:spinner"
                class="mx-auto h-12 w-12 animate-spin text-primary-400"
              />
              <p class="text-sm text-white/70">Getting claim token...</p>
            </div>
          </div>

          <UButton
            v-else
            color="primary"
            size="lg"
            block
            :loading="isProcessing"
            @click="proceedToNetwork"
          >
            Continue to WiFi Setup
          </UButton>
        </div>

        <!-- Waiting for Key Generation -->
        <div
          v-else-if="
            cryptoStatus === KDCryptoStatus.UNINITIALIZED ||
            cryptoStatus === KDCryptoStatus.KEY_GENERATED
          "
          class="space-y-6"
        >
          <div
            class="flex items-center gap-3 rounded-lg border border-yellow-500/20 bg-yellow-500/10 p-4"
          >
            <UIcon name="i-fa6-regular:clock" class="h-6 w-6 flex-shrink-0 text-yellow-400" />
            <div>
              <h2 class="font-semibold text-yellow-400">Device Initializing</h2>
              <p class="text-sm text-white/70">
                The device is generating cryptographic keys. This usually takes a few seconds.
              </p>
            </div>
          </div>

          <div class="space-y-3">
            <p class="text-sm text-white/60">
              If this continues for more than a minute, please contact support.
            </p>
            <UButton color="neutral" variant="soft" block @click="checkCryptoStatus">
              Check Again
            </UButton>
          </div>
        </div>

        <!-- Need License Key (CSR ready but no cert) -->
        <div v-else-if="cryptoStatus === KDCryptoStatus.VALID_CSR" class="space-y-6">
          <div
            class="flex items-center gap-3 rounded-lg border border-orange-500/20 bg-orange-500/10 p-4"
          >
            <UIcon name="i-fa6-solid:key" class="h-6 w-6 shrink-0 text-orange-400" />
            <div>
              <h2 class="font-semibold text-orange-400">License Required</h2>
              <p class="text-sm text-white/70">
                This device needs a license to obtain its security certificate.
              </p>
            </div>
          </div>

          <div class="space-y-4">
            <p class="text-sm text-white/60">
              Purchase a license key to activate your device. The license includes lifetime access
              to firmware updates and cloud features.
            </p>

            <UButton
              color="primary"
              size="lg"
              block
              :loading="isStartingCheckout"
              :disabled="isStartingCheckout"
              @click="startCheckout"
            >
              <UIcon name="i-fa6-regular:credit-card" class="mr-2 h-5 w-5" />
              Purchase License
            </UButton>

            <div class="relative">
              <div class="absolute inset-0 flex items-center">
                <div class="w-full border-t border-white/10"></div>
              </div>
              <div class="relative flex justify-center text-xs uppercase">
                <span class="bg-zinc-950 px-2 text-white/40">or</span>
              </div>
            </div>

            <div class="space-y-3">
              <p class="text-sm text-white/60 text-center">Already have a license key?</p>
              <UInput
                v-model="licenseKey"
                placeholder="Enter license key"
                size="lg"
                :disabled="isProvisioningCert"
              />
              <UButton
                color="neutral"
                variant="soft"
                size="lg"
                block
                :disabled="!licenseKey || isProvisioningCert"
                :loading="isProvisioningCert"
                @click="provisionWithLicenseKey"
              >
                Redeem License Key
              </UButton>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useHead } from '@unhead/vue'
import { Browser } from '@capacitor/browser'
import { Preferences } from '@capacitor/preferences'
import { useBleProvStore, KDCryptoStatus } from '@/stores/ble_prov'
import { apiClient } from '@/lib/api/client'
import { provisioningClient } from '@/lib/api/provisioning'
import { ENV } from '@/config/environment'
import { isNativePlatform, openPopupSync, addBrowserFinishedListener } from '@/utils/browser'

useHead({
  title: 'Device Security | Koios Digital',
  meta: [{ name: 'description', content: 'Configure security for your Koios Digital device' }],
})

// Storage keys for license checkout recovery
const PENDING_LICENSE_KEY = 'pending_license_key'
const PENDING_DEVICE_ID = 'pending_device_id'

/**
 * Store license key and device ID for recovery if app is killed during checkout
 */
async function storePendingLicense(licenseKey: string, deviceId: string) {
  await Promise.all([
    Preferences.set({ key: PENDING_LICENSE_KEY, value: licenseKey }),
    Preferences.set({ key: PENDING_DEVICE_ID, value: deviceId }),
  ])
}

/**
 * Get pending license key and device ID from storage
 */
async function getPendingLicense(): Promise<{
  licenseKey: string | null
  deviceId: string | null
}> {
  const [licenseResult, deviceResult] = await Promise.all([
    Preferences.get({ key: PENDING_LICENSE_KEY }),
    Preferences.get({ key: PENDING_DEVICE_ID }),
  ])
  return {
    licenseKey: licenseResult.value,
    deviceId: deviceResult.value,
  }
}

/**
 * Clear pending license data after successful redemption
 */
async function clearPendingLicense() {
  await Promise.all([
    Preferences.remove({ key: PENDING_LICENSE_KEY }),
    Preferences.remove({ key: PENDING_DEVICE_ID }),
  ])
}

const router = useRouter()
const route = useRoute()
const bleStore = useBleProvStore()

const cryptoStatus = ref<KDCryptoStatus | undefined>(undefined)
const isCheckingStatus = ref(false)
const statusMessage = ref('Checking device security...')
const isGettingClaimToken = ref(false)
const isProcessing = ref(false)
const isProvisioningCert = ref(false)
const isStartingCheckout = ref(false)
const licenseKey = ref('')
const error = ref<{ title: string; description: string } | undefined>(undefined)

// Popup reference for tracking checkout window (web only)
let checkoutPopup: Window | null = null
// Cleanup function for browser listener (native only)
let cleanupBrowserListener: (() => void) | null = null
// Cleanup function for message listener (web only)
let cleanupMessageListener: (() => void) | null = null

/**
 * Build the return URL for checkout callback
 * Uses appNativeUrl for native platforms to handle deep links
 */
function getReturnUrl(): string {
  const baseUrl = isNativePlatform() ? ENV.appNativeUrl : window.location.origin
  return `${baseUrl}/setup/license_callback`
}

/**
 * Start Stripe checkout session
 * On native: Opens in-app browser, deep link brings user back
 * On web: Opens popup synchronously to avoid browser popup blockers
 */
async function startCheckout() {
  error.value = undefined
  isStartingCheckout.value = true

  try {
    if (isNativePlatform()) {
      // Native: Get checkout URL first, then open in-app browser
      const { data, error: apiError } = await provisioningClient.POST('/v1/license/checkout', {
        body: {
          key_type: 'matrx', // TODO: Detect device type
          return_url: getReturnUrl(),
        },
      })

      if (apiError || !data?.url) {
        throw new Error('Failed to create checkout session')
      }

      // Listen for browser close (user cancelled)
      cleanupBrowserListener = addBrowserFinishedListener(() => {
        console.log('In-app browser closed by user')
        // User closed browser without completing - do nothing
      })

      // Open in-app browser
      await Browser.open({ url: data.url })
      // Deep link will handle the callback via appUrlOpen listener
    } else {
      // Web: Open popup synchronously first to avoid blockers
      checkoutPopup = openPopupSync('_blank', 'width=500,height=700')

      if (!checkoutPopup) {
        throw new Error('Could not open checkout window. Please allow popups for this site.')
      }

      // Show loading message in popup
      checkoutPopup.document.write(`
        <html>
          <head>
            <title>Loading Checkout...</title>
            <style>
              body {
                background: #09090b;
                color: white;
                font-family: system-ui, sans-serif;
                display: flex;
                align-items: center;
                justify-content: center;
                height: 100vh;
                margin: 0;
              }
            </style>
          </head>
          <body>
            <div style="text-align: center;">
              <p>Loading checkout...</p>
            </div>
          </body>
        </html>
      `)

      // Request checkout session from API
      const { data, error: apiError } = await provisioningClient.POST('/v1/license/checkout', {
        body: {
          key_type: 'matrx', // TODO: Detect device type
          return_url: getReturnUrl(),
        },
      })

      if (apiError || !data?.url) {
        checkoutPopup.close()
        throw new Error('Failed to create checkout session')
      }

      // Redirect popup to Stripe checkout
      checkoutPopup.location.href = data.url

      // Set up message listener for callback
      setupMessageListener()
    }
  } catch (err) {
    console.error('Checkout error:', err)
    error.value = {
      title: 'Checkout Error',
      description: err instanceof Error ? err.message : 'Failed to start checkout',
    }
  } finally {
    isStartingCheckout.value = false
  }
}

/**
 * Handle postMessage from checkout callback popup (web only)
 */
function handleLicenseMessage(event: MessageEvent) {
  // Verify origin
  if (event.origin !== window.location.origin) {
    return
  }

  // Check message type
  if (event.data?.type === 'LICENSE_CALLBACK') {
    const key = event.data.licenseKey
    checkoutPopup = null

    if (key) {
      licenseKey.value = key
      // Store for recovery in case of failure
      const deviceId = bleStore.connection.connectedDevice?.deviceId
      if (deviceId) {
        storePendingLicense(key, deviceId)
      }
      provisionWithLicenseKey()
    }
  }
}

/**
 * Set up message listener for checkout callback (web only)
 */
function setupMessageListener() {
  window.addEventListener('message', handleLicenseMessage)
  cleanupMessageListener = () => {
    window.removeEventListener('message', handleLicenseMessage)
  }
}

/**
 * Provision certificate using license key
 */
async function provisionWithLicenseKey() {
  if (!licenseKey.value) return

  error.value = undefined
  isProvisioningCert.value = true
  statusMessage.value = 'Getting CSR from device...'
  isCheckingStatus.value = true

  try {
    // Step 1: Get CSR from device
    const csr = await bleStore.console.getCSR()
    console.log('Got CSR from device')

    // Step 2: Redeem license key to sign CSR
    statusMessage.value = 'Signing certificate...'
    const {
      data: certPem,
      error: redeemError,
      response,
    } = await provisioningClient.POST('/v1/license/redeem', {
      body: {
        license_key: licenseKey.value,
        csr: csr,
      },
      parseAs: 'text',
    })

    if (response?.status === 404) {
      throw new Error('Invalid license key. Please check and try again.')
    }

    if (response?.status === 400) {
      throw new Error('License key has already been used.')
    }

    if (redeemError || !certPem) {
      throw new Error('Failed to redeem license. Please try again.')
    }

    console.log('Got signed certificate from server')

    // Step 3: Set certificate on device
    statusMessage.value = 'Installing certificate on device...'
    await bleStore.console.setDeviceCert(certPem)
    console.log('Certificate installed on device')

    // Step 4: Verify crypto status
    statusMessage.value = 'Verifying installation...'
    const status = await bleStore.console.getCryptoStatus()

    if (status !== KDCryptoStatus.VALID_CERT) {
      throw new Error('Certificate installed but verification failed. Please try again.')
    }

    // Success - update state and proceed
    cryptoStatus.value = status
    licenseKey.value = ''
    isCheckingStatus.value = false

    // Clear pending license from storage
    await clearPendingLicense()

    // Get claim token and proceed to network setup
    await getAndSendClaimToken()
  } catch (err) {
    console.error('Provisioning error:', err)
    isCheckingStatus.value = false

    // Check if it's a GATT error
    if (bleStore.isGattError(err)) {
      bleStore.setGattError(err)
      router.replace('/setup/new')
      return
    }

    error.value = {
      title: 'Provisioning Error',
      description:
        err instanceof Error
          ? err.message
          : 'Failed to provision certificate. Please verify your license key and try again.',
    }
  } finally {
    isProvisioningCert.value = false
  }
}

async function checkCryptoStatus() {
  error.value = undefined
  isCheckingStatus.value = true
  statusMessage.value = 'Checking device security...'

  try {
    const status = await bleStore.console.getCryptoStatus()
    cryptoStatus.value = status

    // If device has no cert or CSR, device is still initializing
    if (status === KDCryptoStatus.UNINITIALIZED || status === KDCryptoStatus.KEY_GENERATED) {
      isCheckingStatus.value = false
      return
    }

    // If device has CSR but no cert, show license purchase options
    if (status === KDCryptoStatus.VALID_CSR) {
      isCheckingStatus.value = false
      return
    }

    // If device has valid cert, get claim token and proceed
    if (status === KDCryptoStatus.VALID_CERT) {
      await getAndSendClaimToken()
    }
  } catch (err) {
    console.error('Crypto status error:', err)

    // Check if it's a GATT error
    if (bleStore.isGattError(err)) {
      bleStore.setGattError(err)
      router.replace('/setup/new')
      return
    }

    error.value = {
      title: 'Crypto Status Error',
      description:
        err instanceof Error
          ? err.message
          : 'Failed to check device crypto status. Please try again.',
    }
  } finally {
    isCheckingStatus.value = false
  }
}

async function getAndSendClaimToken() {
  error.value = undefined
  isGettingClaimToken.value = true

  try {
    // Call API to get claim token
    const { data, error: apiError } = await apiClient.GET('/v1/devices/get_claim_token')

    if (apiError) {
      throw new Error('Failed to get claim token from server')
    }

    if (!data?.token) {
      throw new Error('No claim token returned from server')
    }

    // Send claim token to device
    await bleStore.console.setClaimToken(data.token)

    // Automatically proceed to WiFi setup
    router.push('/setup/network')
  } catch (err) {
    console.error('Claim token error:', err)

    // Check if it's a GATT error
    if (bleStore.isGattError(err)) {
      bleStore.setGattError(err)
      router.replace('/setup/new')
      return
    }

    error.value = {
      title: 'Claim Token Error',
      description:
        err instanceof Error ? err.message : 'Failed to get claim token. Please try again.',
    }
  } finally {
    isGettingClaimToken.value = false
  }
}

async function proceedToNetwork() {
  router.push('/setup/network')
}

onMounted(async () => {
  const connectedDevice = bleStore.connection.connectedDevice

  // Check if returning from checkout with license_key
  const urlLicenseKey = route.query.license_key as string | undefined
  if (urlLicenseKey) {
    licenseKey.value = urlLicenseKey
    // Clean up URL
    router.replace({ path: route.path, query: {} })
    // Close in-app browser if it's still open (native)
    if (isNativePlatform()) {
      Browser.close().catch(() => {})
    }

    // Store license key for recovery
    if (connectedDevice?.deviceId) {
      await storePendingLicense(urlLicenseKey, connectedDevice.deviceId)
    }

    // If device is still connected, provision immediately
    if (connectedDevice) {
      await provisionWithLicenseKey()
      return
    }

    // Device disconnected during checkout - show recovery message
    error.value = {
      title: 'Device Disconnected',
      description:
        'The device was disconnected during checkout. Please reconnect to the same device to complete setup. Your license key has been saved.',
    }
    router.replace('/setup/new')
    return
  }

  // Check for pending license from previous session (app was killed)
  const pending = await getPendingLicense()
  if (pending.licenseKey) {
    // We have a pending license - check if we're connected to the same device
    if (connectedDevice?.deviceId === pending.deviceId) {
      licenseKey.value = pending.licenseKey
      await provisionWithLicenseKey()
      return
    } else if (connectedDevice) {
      // Connected to a different device - clear pending and continue normally
      await clearPendingLicense()
    } else {
      // No device connected but we have a pending license
      error.value = {
        title: 'License Key Saved',
        description: `You have a pending license key. Please reconnect to your device to complete setup.`,
      }
      router.replace('/setup/new')
      return
    }
  }

  // Redirect if no device connected
  if (!connectedDevice) {
    router.replace('/setup/new')
    return
  }

  await checkCryptoStatus()
})

onUnmounted(() => {
  // Cleanup browser listener on unmount (native)
  if (cleanupBrowserListener) {
    cleanupBrowserListener()
    cleanupBrowserListener = null
  }
  // Cleanup message listener on unmount (web)
  if (cleanupMessageListener) {
    cleanupMessageListener()
    cleanupMessageListener = null
  }
})
</script>

<style scoped>
.setup-view {
  height: 100vh;
  height: 100dvh;
}
</style>
