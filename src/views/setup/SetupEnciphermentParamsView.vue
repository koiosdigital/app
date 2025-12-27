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
    <div class="flex flex-1 flex-col items-center justify-center p-5">
      <div class="w-full max-w-md space-y-6">
        <!-- Loading State -->
        <div v-if="isLoading && !error" class="flex flex-1 items-center justify-center">
          <div class="space-y-3 text-center">
            <UIcon
              name="i-lucide-loader-2"
              class="mx-auto h-12 w-12 animate-spin text-primary-400"
            />
            <p class="text-sm text-white/70">{{ loadingMessage }}</p>
          </div>
        </div>

        <!-- Error State -->
        <div v-else-if="error" class="space-y-6">
          <div
            class="flex items-center gap-3 rounded-lg border border-red-500/20 bg-red-500/10 p-4"
          >
            <UIcon name="i-lucide-shield-x" class="h-6 w-6 shrink-0 text-red-400" />
            <div>
              <h2 class="font-semibold text-red-400">{{ error.title }}</h2>
              <p class="text-sm text-white/70">{{ error.description }}</p>
            </div>
          </div>

          <div class="space-y-3">
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

          <UButton
            v-if="error.retryAction"
            color="neutral"
            variant="soft"
            block
            @click="error.retryAction"
          >
            Try Again
          </UButton>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useHead } from '@unhead/vue'
import { useBleProvStore, KDCryptoStatus } from '@/stores/ble_prov'
import { provisioningClient } from '@/lib/api/provisioning'

useHead({
  title: 'Device Security | Koios',
  meta: [{ name: 'description', content: 'Verifying device security credentials' }],
})

const router = useRouter()
const bleStore = useBleProvStore()

const isLoading = ref(false)
const loadingMessage = ref('Checking device status...')
const error = ref<{ title: string; description: string; retryAction?: () => void } | undefined>(
  undefined
)

async function checkCryptoStatus() {
  error.value = undefined
  isLoading.value = true
  loadingMessage.value = 'Checking device status...'

  try {
    const status = await bleStore.console.getCryptoStatus()

    // If status is BAD_DS_PARAMS, automatically restore from backup
    if (status === KDCryptoStatus.BAD_DS_PARAMS) {
      await restoreFromBackup()
      return
    }

    // For VALID_CSR or VALID_CERT, backup DS params and proceed
    if (status === KDCryptoStatus.VALID_CSR || status === KDCryptoStatus.VALID_CERT) {
      await backupDSParams()
      router.push('/setup/crypto')
      return
    }

    // For UNINITIALIZED or KEY_GENERATED, wait for key generation
    if (status === KDCryptoStatus.UNINITIALIZED || status === KDCryptoStatus.KEY_GENERATED) {
      loadingMessage.value = 'Waiting for key generation...'
      setTimeout(checkCryptoStatus, 2000)
      return
    }

    // Unknown status - proceed anyway
    router.push('/setup/crypto')
  } catch (err) {
    console.error('Crypto status error:', err)
    handleError(err, 'Status Check Error', 'Failed to check device status.', checkCryptoStatus)
  }
}

async function backupDSParams() {
  loadingMessage.value = 'Backing up security credentials...'

  try {
    const dsParams = await bleStore.console.getDSParams()

    const deviceId = bleStore.connection.connectedDevice?.name
    if (!deviceId) {
      console.warn('No device name available, skipping DS params backup')
      return
    }

    const { error } = await provisioningClient.POST('/v1/ds_params', {
      params: { header: { 'x-device-id': deviceId } },
      body: dsParams,
    })

    if (error) {
      console.error('Failed to backup DS params:', error)
      // Continue anyway - backup is optional
    } else {
      console.log('DS params backed up successfully')
    }
  } catch (err) {
    console.error('DS params backup error:', err)
    // Continue anyway - backup is optional, don't block the flow
  }
}

async function restoreFromBackup() {
  loadingMessage.value = 'Checking for backup...'

  try {
    const deviceId = bleStore.connection.connectedDevice?.name
    if (!deviceId) {
      throw new Error('No device name available')
    }

    // Fetch backup from provisioning server
    const { data: params, error: fetchError, response } = await provisioningClient.GET('/v1/ds_params', {
      params: { header: { 'x-device-id': deviceId } },
    })

    if (response.status === 404) {
      // No backup found
      isLoading.value = false
      error.value = {
        title: 'Security Credentials Unavailable',
        description:
          "We couldn't locate a backup of your device's security information. The backup may not have been created during initial setup.",
        retryAction: restoreFromBackup,
      }
      return
    }

    if (fetchError || !params) {
      throw new Error(`Failed to fetch backup: ${response.status} ${response.statusText}`)
    }

    // Restore params to device
    loadingMessage.value = 'Restoring security credentials...'
    await bleStore.console.setDSParams(params)

    // Verify crypto status is now valid
    loadingMessage.value = 'Verifying restoration...'
    const status = await bleStore.console.getCryptoStatus()

    if (status === KDCryptoStatus.BAD_DS_PARAMS) {
      throw new Error('Parameters restored but verification failed.')
    }

    // Success - navigate to next step (do NOT re-backup)
    router.push('/setup/crypto')
  } catch (err) {
    console.error('Restore error:', err)
    handleError(
      err,
      'Restore Failed',
      'Failed to restore security credentials.',
      restoreFromBackup
    )
  }
}

function handleError(
  err: unknown,
  title: string,
  defaultMessage: string,
  retryAction?: () => void
) {
  // Check if it's a GATT error
  if (bleStore.isGattError(err)) {
    bleStore.setGattError(err)
    router.replace('/setup/new')
    return
  }

  isLoading.value = false
  error.value = {
    title,
    description: err instanceof Error ? err.message : defaultMessage,
    retryAction,
  }
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
