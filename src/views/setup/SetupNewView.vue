<template>
  <div class="flex flex-1 min-h-0 flex-col bg-zinc-950">
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
          @click="router.push('/')"
        />
        <h1 class="text-xl font-semibold">Add Device</h1>
      </div>
    </header>

    <!-- BLE Availability Error -->
    <div v-if="bleError" class="flex flex-1 items-center justify-center p-5">
      <UCard class="w-full max-w-md border border-red-500/20 bg-red-500/10">
        <div class="space-y-4">
          <div class="flex items-start gap-3">
            <UIcon
              name="i-fa6-solid:circle-exclamation"
              class="h-6 w-6 flex-shrink-0 text-red-400"
            />
            <div class="flex-1">
              <h2 class="text-lg font-semibold text-red-400">{{ bleError.errorTitle }}</h2>
              <p class="mt-1 text-sm text-white/70">{{ bleError.errorMessage }}</p>
            </div>
          </div>

          <div v-if="bleError.instructions" class="space-y-2">
            <p class="text-sm font-medium text-white/90">How to fix:</p>
            <ol class="list-decimal space-y-1 pl-5 text-sm text-white/70">
              <li v-for="(instruction, i) in bleError.instructions" :key="i">
                {{ instruction }}
              </li>
            </ol>
          </div>

          <UButton color="neutral" variant="soft" block @click="checkBle"> Try Again </UButton>
        </div>
      </UCard>
    </div>

    <!-- Device Selection -->
    <div v-else class="flex flex-1 flex-col items-center p-5">
      <div class="w-full max-w-md space-y-6">
        <!-- Error Alert -->
        <UAlert
          v-if="error"
          icon="i-fa6-solid:circle-exclamation"
          color="error"
          :title="error.title"
          :description="error.description"
        />

        <div class="space-y-2">
          <h2 class="text-lg font-medium text-white/90">Select Device</h2>
          <p class="text-sm text-white/60">
            Make sure your device is powered on and in pairing mode.
          </p>
        </div>

        <!-- Connecting State -->
        <div v-if="isConnecting" class="space-y-4">
          <div class="flex items-center justify-center py-8">
            <div class="space-y-3 text-center">
              <UIcon
                name="i-fa6-solid:spinner"
                class="h-12 w-12 animate-spin text-primary-400 mx-auto"
              />
              <p class="text-sm text-white/70">Connecting to device...</p>
            </div>
          </div>
        </div>

        <!-- Native: Show discovered devices with scanning indicator -->
        <div v-else-if="!isWebPlatform" class="space-y-4">
          <!-- Scanning indicator -->
          <div
            v-if="bleStore.connection.isScanning"
            class="flex items-center justify-center gap-2 py-2"
          >
            <UIcon name="i-fa6-solid:spinner" class="h-4 w-4 animate-spin text-primary-400" />
            <p class="text-sm text-white/70">Scanning for devices...</p>
          </div>

          <!-- Discovered devices list -->
          <div v-if="bleStore.connection.discoveredDevices.length" class="space-y-3">
            <button
              v-for="device in bleStore.connection.discoveredDevices"
              :key="device.deviceId"
              class="flex w-full items-center justify-between rounded-lg border border-white/10 bg-white/5 p-4 transition hover:bg-white/10"
              :disabled="isConnecting"
              @click="selectDevice(device)"
            >
              <div class="flex items-center gap-3">
                <UIcon name="i-fa6-solid:microchip" class="h-5 w-5 text-primary-400" />
                <span class="font-medium">{{ device.name || device.deviceId }}</span>
              </div>
              <UIcon name="i-fa6-solid:chevron-right" class="h-5 w-5 text-white/40" />
            </button>
          </div>

          <!-- Empty state while scanning -->
          <div
            v-else
            class="flex flex-col items-center justify-center rounded-lg border border-dashed border-white/20 py-12 text-center"
          >
            <UIcon name="i-fa6-brands:bluetooth-b" class="h-12 w-12 text-primary-400" />
            <p class="mt-4 text-sm text-white/70">Looking for nearby devices...</p>
            <p class="mt-1 text-xs text-white/50">
              Make sure your device is powered on and in pairing mode
            </p>
          </div>
        </div>

        <!-- Web: Show button to trigger browser picker -->
        <div v-else class="space-y-4">
          <!-- Scanning state (browser picker open) -->
          <div v-if="bleStore.connection.isScanning" class="flex items-center justify-center py-8">
            <div class="space-y-3 text-center">
              <UIcon
                name="i-fa6-solid:spinner"
                class="h-12 w-12 animate-spin text-primary-400 mx-auto"
              />
              <p class="text-sm text-white/70">Select a device from the browser picker...</p>
            </div>
          </div>

          <!-- Initial/retry state -->
          <div v-else>
            <div
              class="flex flex-col items-center justify-center rounded-lg border border-dashed border-white/20 py-12 text-center"
            >
              <UIcon name="i-fa6-brands:bluetooth-b" class="h-12 w-12 text-primary-400" />
              <p class="mt-4 text-sm text-white/70">Click to select a device</p>
            </div>

            <UButton color="primary" block class="mt-4" @click="startScanning">
              {{ hasScanned ? 'Try Again' : 'Select Device' }}
            </UButton>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useHead } from '@unhead/vue'
import type { BleDevice } from '@capacitor-community/bluetooth-le'
import { Capacitor } from '@capacitor/core'
import { useBleProvStore } from '@/stores/ble_prov'
import { checkBleAvailability, type BleAvailabilityResult } from '@/utils/ble'

useHead({
  title: 'Add Device | Koios Digital',
  meta: [{ name: 'description', content: 'Add a new Koios Digital device' }],
})

const router = useRouter()
const bleStore = useBleProvStore()

const bleError = ref<BleAvailabilityResult | undefined>(undefined)
const isCheckingBle = ref(false)
const hasScanned = ref(false)
const isConnecting = ref(false)
const isWebPlatform = Capacitor.getPlatform() === 'web'
const error = ref<{ title: string; description: string } | undefined>(undefined)

async function checkBle() {
  isCheckingBle.value = true
  bleError.value = undefined

  const result = await checkBleAvailability()

  if (!result.available) {
    bleError.value = result
  } else {
    await bleStore.connection.initializeBluetooth()
  }

  isCheckingBle.value = false
}

async function startScanning() {
  // Clear previous error
  error.value = undefined

  try {
    hasScanned.value = true
    await bleStore.connection.startScan()
  } catch (err) {
    console.error('Failed to start scanning:', err)
    error.value = {
      title: 'Scan Error',
      description:
        err instanceof Error ? err.message : 'Failed to start scanning. Please try again.',
    }
  }
}

async function selectDevice(device: BleDevice) {
  // Prevent double-clicks
  if (isConnecting.value) return

  // Clear previous error
  error.value = undefined
  isConnecting.value = true

  try {
    await bleStore.connection.stopScan()
    await bleStore.connection.connectToDevice(device)

    router.push('/setup/bind_dpop')
  } catch (err) {
    console.error('Failed to connect to device:', err)
    error.value = {
      title: 'Connection Error',
      description:
        err instanceof Error
          ? err.message
          : 'Failed to connect to the selected device. Please ensure it is in pairing mode and try again.',
    }
  } finally {
    isConnecting.value = false
  }
}

// On web, auto-connect when device is selected
watch(
  () => bleStore.connection.discoveredDevices,
  async (devices) => {
    if (isWebPlatform && devices.length > 0 && !bleStore.connection.connectedDevice) {
      // Auto-select the first (only) device on web
      await selectDevice(devices[0])
    }
  },
  { deep: true },
)

onMounted(async () => {
  await checkBle()

  // Check if there's a GATT error from previous page
  if (bleStore.gattError) {
    error.value = bleStore.gattError
    bleStore.clearGattError()

    // Disconnect from device to clean up
    try {
      await bleStore.connection.disconnectDevice()
    } catch (err) {
      console.debug('Failed to disconnect device:', err)
    }
  }

  // On native, auto-start scanning when entering the page
  if (!isWebPlatform && !bleError.value) {
    await startScanning()
  }
})

onUnmounted(async () => {
  // Stop scanning when leaving the page
  if (bleStore.connection.isScanning) {
    await bleStore.connection.stopScan()
  }
})
</script>
