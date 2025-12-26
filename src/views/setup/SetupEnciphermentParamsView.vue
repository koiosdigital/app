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
            <p class="text-sm text-white/70">Checking device status...</p>
          </div>
        </div>

        <!-- BAD_DS_PARAMS: Checking for backup automatically -->
        <div
          v-else-if="cryptoStatus === KDCryptoStatus.BAD_DS_PARAMS && isCheckingBackup"
          class="space-y-6"
        >
          <div
            class="flex items-center gap-3 rounded-lg border border-orange-500/20 bg-orange-500/10 p-4"
          >
            <UIcon name="i-lucide-shield-alert" class="h-6 w-6 shrink-0 text-orange-400" />
            <div>
              <h2 class="font-semibold text-orange-400">Security Information Recovery</h2>
              <p class="text-sm text-white/70">
                Checking for backed up security credentials...
              </p>
            </div>
          </div>

          <div class="flex items-center justify-center py-8">
            <UIcon
              name="i-lucide-loader-2"
              class="h-12 w-12 animate-spin text-primary-400 mx-auto"
            />
          </div>
        </div>

        <!-- Checking for Backup (normal flow) -->
        <div v-else-if="isCheckingBackup && !backupParams" class="space-y-6">
          <div
            class="flex items-center gap-3 rounded-lg border border-primary-500/20 bg-primary-500/10 p-4"
          >
            <UIcon name="i-lucide-shield-check" class="h-6 w-6 shrink-0 text-primary-400" />
            <div>
              <h2 class="font-semibold text-primary-400">Securing Your Device</h2>
              <p class="text-sm text-white/70">
                Verifying security credentials...
              </p>
            </div>
          </div>

          <div class="flex items-center justify-center py-8">
            <UIcon
              name="i-lucide-loader-2"
              class="h-12 w-12 animate-spin text-primary-400 mx-auto"
            />
          </div>
        </div>

        <!-- Backup Found (Recovery) -->
        <div v-else-if="backupParams" class="space-y-6">
          <div
            class="flex items-center gap-3 rounded-lg border border-primary-500/20 bg-primary-500/10 p-4"
          >
            <UIcon name="i-lucide-check-circle" class="h-6 w-6 shrink-0 text-primary-400" />
            <div>
              <h2 class="font-semibold text-primary-400">Security Backup Found</h2>
              <p class="text-sm text-white/70">
                Your device's security credentials are available for restoration.
              </p>
            </div>
          </div>

          <div class="space-y-3">
            <p class="text-sm text-white/60">
              We found a secure backup of your device's cryptographic keys. Restoring these
              credentials will allow your device to operate securely and communicate with our
              servers.
            </p>
            <p class="text-sm text-white/60">
              This process is safe and will not affect any other device settings.
            </p>
          </div>

          <UButton color="primary" size="lg" block :loading="isRestoring" @click="restoreParams">
            Restore Security Credentials
          </UButton>
        </div>

        <!-- No Backup Found (after check) -->
        <div v-else-if="checkedForBackup && !backupParams" class="space-y-6">
          <div
            class="flex items-center gap-3 rounded-lg border border-red-500/20 bg-red-500/10 p-4"
          >
            <UIcon name="i-lucide-shield-x" class="h-6 w-6 shrink-0 text-red-400" />
            <div>
              <h2 class="font-semibold text-red-400">Security Credentials Unavailable</h2>
              <p class="text-sm text-white/70">
                We couldn't locate a backup of your device's security information.
              </p>
            </div>
          </div>

          <div class="space-y-3">
            <p class="text-sm text-white/60">
              Your device requires secure cryptographic credentials to function properly. These
              credentials may not have been backed up during initial setup, or the backup may have
              been lost.
            </p>
            <p class="text-sm text-white/60">
              Our support team can help restore your device's security credentials or guide you
              through the next steps.
            </p>

            <div
              class="flex items-center gap-2 rounded-lg border border-primary-500/20 bg-primary-500/10 p-3"
            >
              <UIcon name="i-lucide-life-buoy" class="h-5 w-5 text-primary-400" />
              <div class="flex-1">
                <p class="text-sm font-medium text-primary-400">Need assistance?</p>
                <a
                  href="mailto:support@koiosdigital.net"
                  class="text-xs text-white/70 hover:text-primary-400"
                >
                  Contact support@koiosdigital.net
                </a>
              </div>
            </div>
          </div>

          <UButton color="neutral" variant="soft" block @click="checkForBackup">
            Try Again
          </UButton>
        </div>

        <!-- Backing Up DS Params -->
        <div v-else-if="isBackingUp" class="space-y-6">
          <div
            class="flex items-center gap-3 rounded-lg border border-primary-500/20 bg-primary-500/10 p-4"
          >
            <UIcon name="i-lucide-shield-check" class="h-6 w-6 shrink-0 text-primary-400" />
            <div>
              <h2 class="font-semibold text-primary-400">Securing Your Device</h2>
              <p class="text-sm text-white/70">Creating secure backup of security credentials...</p>
            </div>
          </div>

          <div class="flex items-center justify-center py-8">
            <UIcon
              name="i-lucide-loader-2"
              class="h-12 w-12 animate-spin text-primary-400 mx-auto"
            />
          </div>

          <div class="space-y-2 text-center">
            <p class="text-xs text-white/50">
              Your device's cryptographic keys are being securely backed up to ensure they can be
              recovered if needed.
            </p>
          </div>
        </div>

        <!-- Backup Complete -->
        <div v-else-if="backupComplete" class="space-y-6">
          <div
            class="flex items-center gap-3 rounded-lg border border-primary-500/20 bg-primary-500/10 p-4"
          >
            <UIcon name="i-lucide-shield-check" class="h-6 w-6 shrink-0 text-primary-400" />
            <div>
              <h2 class="font-semibold text-primary-400">Device Secured</h2>
              <p class="text-sm text-white/70">
                Your device's security credentials are ready and backed up.
              </p>
            </div>
          </div>

          <div class="space-y-3">
            <p class="text-sm text-white/60">
              Your device's cryptographic keys have been securely backed up. These credentials
              enable secure communication with our servers and can be restored if needed.
            </p>
          </div>

          <UButton color="primary" size="lg" block @click="proceedToLicenseCheck">
            Continue Setup
          </UButton>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useBleProvStore, type KD_DSParams, KDCryptoStatus } from '@/stores/ble_prov'

const router = useRouter()
const bleStore = useBleProvStore()

const cryptoStatus = ref<KDCryptoStatus | undefined>(undefined)
const isCheckingStatus = ref(false)
const isCheckingBackup = ref(false)
const isRestoring = ref(false)
const isBackingUp = ref(false)
const checkedForBackup = ref(false)
const backupParams = ref<KD_DSParams | undefined>(undefined)
const backupComplete = ref(false)
const error = ref<{ title: string; description: string } | undefined>(undefined)

async function checkCryptoStatus() {
  // Clear previous error
  error.value = undefined
  isCheckingStatus.value = true

  try {
    const status = await bleStore.console.getCryptoStatus()
    cryptoStatus.value = status

    // If status is BAD_DS_PARAMS, automatically check for backup
    if (status === KDCryptoStatus.BAD_DS_PARAMS) {
      isCheckingStatus.value = false
      await checkForBackup()
      return
    }

    // For VALID_CSR or VALID_CERT, backup DS params
    if (status === KDCryptoStatus.VALID_CSR || status === KDCryptoStatus.VALID_CERT) {
      await backupDSParams()
      return
    }

    // For UNINITIALIZED or KEY_GENERATED, wait for key generation
    if (status === KDCryptoStatus.UNINITIALIZED || status === KDCryptoStatus.KEY_GENERATED) {
      // Poll every 2 seconds until we reach a usable state
      setTimeout(checkCryptoStatus, 2000)
      return
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
      title: 'Status Check Error',
      description:
        err instanceof Error ? err.message : 'Failed to check device status. Please try again.',
    }
  } finally {
    isCheckingStatus.value = false
  }
}

async function backupDSParams() {
  isBackingUp.value = true
  error.value = undefined

  try {
    // Get DS params from device
    const dsParams = await bleStore.console.getDSParams()

    // Get device ID (ASCII name like MATRX-xxxxxxxx) from connected device
    const deviceId = bleStore.connection.connectedDevice?.name
    if (!deviceId) {
      console.warn('No device name available, skipping DS params backup')
      backupComplete.value = true
      return
    }

    // Backup to provisioning server
    const response = await fetch('https://provisioning.api.koiosdigital.net/v1/ds_params', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-device-id': deviceId,
      },
      body: JSON.stringify(dsParams),
    })

    if (!response.ok) {
      console.error('Failed to backup DS params:', response.status, response.statusText)
      // Continue anyway - backup is optional
      backupComplete.value = true
    } else {
      console.log('DS params backed up successfully')

      // TESTING: Force restore flow to test the complete recovery process
      // In production, this should just set backupComplete.value = true
      console.log('TESTING MODE: Simulating BAD_DS_PARAMS to test restore flow')

      // Simulate checking for backup and finding it
      cryptoStatus.value = KDCryptoStatus.BAD_DS_PARAMS
      isBackingUp.value = false
      await checkForBackup()
      return
    }
  } catch (err) {
    console.error('DS params backup error:', err)
    // Continue anyway - backup is optional
    backupComplete.value = true
  } finally {
    isBackingUp.value = false
  }
}

async function checkForBackup() {
  // Clear previous error
  error.value = undefined
  isCheckingBackup.value = true
  checkedForBackup.value = false
  backupParams.value = undefined

  try {
    // Get device ID (ASCII name like MATRX-xxxxxxxx) from connected device
    const deviceId = bleStore.connection.connectedDevice?.name
    if (!deviceId) {
      throw new Error('No device name available')
    }

    // Fetch backup from provisioning server
    const response = await fetch('https://provisioning.api.koiosdigital.net/v1/ds_params', {
      method: 'GET',
      headers: {
        'x-device-id': deviceId,
      },
    })

    if (response.status === 404) {
      // No backup found
      backupParams.value = undefined
      checkedForBackup.value = true
      return
    }

    if (!response.ok) {
      throw new Error(`Failed to fetch backup: ${response.status} ${response.statusText}`)
    }

    const params = await response.json()
    backupParams.value = params as KD_DSParams
    checkedForBackup.value = true
  } catch (err) {
    console.error('Backup check error:', err)

    // Check if it's a GATT error
    if (bleStore.isGattError(err)) {
      bleStore.setGattError(err)
      router.replace('/setup/new')
      return
    }

    error.value = {
      title: 'Backup Check Error',
      description:
        err instanceof Error ? err.message : 'Failed to check for backup. Please try again.',
    }
  } finally {
    isCheckingBackup.value = false
  }
}

async function restoreParams() {
  if (!backupParams.value) return

  // Clear previous error
  error.value = undefined
  isRestoring.value = true

  try {
    // Restore params to device
    await bleStore.console.setDSParams(backupParams.value)

    // Verify crypto status is now valid
    const status = await bleStore.console.getCryptoStatus()

    if (status === KDCryptoStatus.BAD_DS_PARAMS) {
      throw new Error('Parameters restored but still invalid. Please contact support.')
    }

    // Success - proceed to backup and continue
    cryptoStatus.value = status
    await backupDSParams()
  } catch (err) {
    console.error('Restore error:', err)

    // Check if it's a GATT error
    if (bleStore.isGattError(err)) {
      bleStore.setGattError(err)
      router.replace('/setup/new')
      return
    }

    error.value = {
      title: 'Restore Error',
      description:
        err instanceof Error
          ? err.message
          : 'Failed to restore parameters. Please try again or contact support.',
    }
  } finally {
    isRestoring.value = false
  }
}

async function proceedToLicenseCheck() {
  router.push('/setup/crypto')
}

onMounted(async () => {
  // Redirect if no device connected
  if (!bleStore.connection.connectedDevice) {
    bleStore.setGattError(new Error('Device disconnected before parameter setup'))
    router.replace('/setup/new')
    return
  }

  await checkCryptoStatus()
})
</script>
