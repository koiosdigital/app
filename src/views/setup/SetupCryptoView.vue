<template>
  <div class="flex min-h-screen flex-col bg-zinc-950">
    <!-- Header -->
    <header
      class="sticky top-0 z-10 border-b border-white/10 bg-zinc-950/95 backdrop-blur px-5 py-4"
    >
      <div class="flex items-center gap-4">
        <UButton
          color="neutral"
          variant="ghost"
          icon="i-lucide-arrow-left"
          square
          @click="router.back()"
        />
        <h1 class="text-xl font-semibold">Device Security</h1>
      </div>
    </header>

    <!-- Content -->
    <div class="flex flex-1 flex-col items-center p-5">
      <div class="w-full max-w-md space-y-6">
        <!-- Error Alert -->
        <UAlert
          v-if="error"
          icon="i-lucide-alert-circle"
          color="error"
          :title="error.title"
          :description="error.description"
        />

        <!-- Checking Crypto Status -->
        <div v-if="isCheckingStatus" class="flex flex-1 items-center justify-center">
          <div class="space-y-3 text-center">
            <UIcon
              name="i-lucide-loader-2"
              class="h-12 w-12 animate-spin text-primary-400 mx-auto"
            />
            <p class="text-sm text-white/70">Checking device security...</p>
          </div>
        </div>

        <!-- Valid Certificate -->
        <div v-else-if="cryptoStatus === KDCryptoStatus.VALID_CERT" class="space-y-6">
          <div
            class="flex items-center gap-3 rounded-lg border border-primary-500/20 bg-primary-500/10 p-4"
          >
            <UIcon name="i-lucide-shield-check" class="h-6 w-6 flex-shrink-0 text-primary-400" />
            <div>
              <h2 class="font-semibold text-primary-400">Device Verified</h2>
              <p class="text-sm text-white/70">Device has a valid certificate</p>
            </div>
          </div>

          <div v-if="isGettingClaimToken" class="space-y-3 text-center">
            <UIcon name="i-lucide-loader-2" class="h-8 w-8 animate-spin text-primary-400" />
            <p class="text-sm text-white/70">Getting claim token...</p>
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
            <UIcon name="i-lucide-clock" class="h-6 w-6 flex-shrink-0 text-yellow-400" />
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

        <!-- Need License Key -->
        <div v-else-if="showLicenseKeyInput" class="space-y-6">
          <div
            class="flex items-center gap-3 rounded-lg border border-orange-500/20 bg-orange-500/10 p-4"
          >
            <UIcon name="i-lucide-key" class="h-6 w-6 shrink-0 text-orange-400" />
            <div>
              <h2 class="font-semibold text-orange-400">License Key Required</h2>
              <p class="text-sm text-white/70">
                This device needs a license key to obtain a certificate.
              </p>
            </div>
          </div>

          <div class="space-y-3">
            <UInput
              v-model="licenseKey"
              placeholder="Enter license key"
              size="lg"
              :disabled="isProvisioningCert"
            />

            <div class="flex items-center gap-2 text-sm text-white/60">
              <UIcon name="i-lucide-info" class="h-4 w-4" />
              <span>Don't have a license key?</span>
              <a href="#" class="text-primary-400 hover:underline">Contact Support</a>
            </div>
          </div>

          <UButton
            color="primary"
            size="lg"
            block
            :disabled="!licenseKey || isProvisioningCert"
            :loading="isProvisioningCert"
            @click="provisionCertificate"
          >
            Provision Certificate
          </UButton>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useBleProvStore, KDCryptoStatus } from '@/stores/ble_prov'
import { apiClient } from '@/lib/api/client'

const router = useRouter()
const bleStore = useBleProvStore()

const cryptoStatus = ref<KDCryptoStatus | undefined>(undefined)
const isCheckingStatus = ref(false)
const isGettingClaimToken = ref(false)
const isProcessing = ref(false)
const isProvisioningCert = ref(false)
const showLicenseKeyInput = ref(false)
const licenseKey = ref('')
const error = ref<{ title: string; description: string } | undefined>(undefined)

async function checkCryptoStatus() {
  // Clear previous error
  error.value = undefined
  isCheckingStatus.value = true

  try {
    const status = await bleStore.console.getCryptoStatus()
    cryptoStatus.value = status

    // If device has no cert or CSR, show appropriate message
    if (status === KDCryptoStatus.UNINITIALIZED || status === KDCryptoStatus.KEY_GENERATED) {
      // Device is still initializing
      return
    }

    // If device has CSR but no cert, need license key
    if (status === KDCryptoStatus.VALID_CSR) {
      showLicenseKeyInput.value = true
      return
    }

    // If device has valid cert, get claim token
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

async function provisionCertificate() {
  if (!licenseKey.value) return

  // Clear previous error
  error.value = undefined
  isProvisioningCert.value = true

  try {
    // Get CSR from device
    await bleStore.console.getCSR()

    // TODO: Call API to provision certificate
    // const response = await apiClient.POST('/v1/devices/provision-cert', {
    //   body: {
    //     csr,
    //     licenseKey: licenseKey.value,
    //   },
    // })

    // TODO: Send certificate back to device
    // For now, just check status again
    await checkCryptoStatus()
  } catch (err) {
    error.value = {
      title: 'Certificate Provisioning Error',
      description:
        err instanceof Error
          ? err.message
          : 'Failed to provision certificate. Please verify your license key and try again.',
    }
    console.error('Cert provisioning error:', err)
  } finally {
    isProvisioningCert.value = false
  }
}

async function getAndSendClaimToken() {
  // Clear previous error
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
  // Redirect if no device connected
  if (!bleStore.connection.connectedDevice) {
    router.replace('/setup/new')
    return
  }

  await checkCryptoStatus()
})
</script>
