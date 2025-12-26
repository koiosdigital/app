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
            <UIcon name="i-lucide-alert-circle" class="h-6 w-6 flex-shrink-0 text-red-400" />
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
          icon="i-lucide-alert-circle"
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

        <!-- Scanning State -->
        <div v-if="bleStore.connection.isScanning" class="space-y-4">
          <div class="flex items-center justify-center py-8">
            <div class="space-y-3 text-center">
              <UIcon
                name="i-lucide-loader-2"
                class="h-12 w-12 animate-spin text-primary-400 mx-auto"
              />
              <p class="text-md text-white/70">Scanning for devices...</p>
            </div>
          </div>
        </div>

        <!-- Discovered Devices -->
        <div v-else-if="bleStore.connection.discoveredDevices.length" class="space-y-3">
          <button
            v-for="device in bleStore.connection.discoveredDevices"
            :key="device.deviceId"
            class="flex w-full items-center justify-between rounded-lg border border-white/10 bg-white/5 p-4 transition hover:bg-white/10"
            @click="selectDevice(device)"
          >
            <div class="flex items-center gap-3">
              <UIcon name="i-lucide-cpu" class="h-5 w-5 text-primary-400" />
              <span class="font-medium">{{ device.name || device.deviceId }}</span>
            </div>
            <UIcon name="i-lucide-chevron-right" class="h-5 w-5 text-white/40" />
          </button>

          <UButton color="neutral" variant="soft" block @click="startScanning"> Scan Again </UButton>
        </div>

        <!-- Initial Prompt (before scanning) -->
        <div v-else-if="!hasScanned" class="space-y-4">
          <div
            class="flex flex-col items-center justify-center rounded-lg border border-dashed border-white/20 py-12 text-center"
          >
            <UIcon name="i-lucide-bluetooth" class="h-12 w-12 text-primary-400" />
            <p class="mt-4 text-sm text-white/70">Press Start Scanning to find nearby devices</p>
          </div>

          <UButton color="primary" block @click="startScanning"> Start Scanning </UButton>
        </div>

        <!-- No Devices Found (after scanning) -->
        <div v-else class="space-y-4">
          <div
            class="flex flex-col items-center justify-center rounded-lg border border-dashed border-white/20 py-12 text-center"
          >
            <UIcon name="i-lucide-bluetooth-off" class="h-12 w-12 text-white/40" />
            <p class="mt-4 text-sm text-white/70">No devices found</p>
            <p class="mt-1 text-xs text-white/50">Make sure your device is powered on and nearby</p>
          </div>

          <UButton color="primary" block @click="startScanning"> Scan Again </UButton>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch } from 'vue'
import { useRouter } from 'vue-router'
import type { BleDevice } from '@capacitor-community/bluetooth-le'
import { Capacitor } from '@capacitor/core'
import { useBleProvStore } from '@/stores/ble_prov'
import { checkBleAvailability, type BleAvailabilityResult } from '@/utils/ble'

const router = useRouter()
const bleStore = useBleProvStore()

const bleError = ref<BleAvailabilityResult | undefined>(undefined)
const isCheckingBle = ref(false)
const hasScanned = ref(false)
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
  // Clear previous error
  error.value = undefined

  try {
    await bleStore.connection.stopScan()
    await bleStore.connection.connectToDevice(device)

    router.push('/setup/bind_dpop')
  } catch (err) {
    console.error('Failed to connect to device:', err)
    error.value = {
      title: 'Connection Error',
      description:
        'Failed to connect to the selected device. Please ensure it is in pairing mode and try again.',
    }
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
  { deep: true }
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
})

onUnmounted(async () => {
  // Stop scanning when leaving the page
  if (bleStore.connection.isScanning) {
    await bleStore.connection.stopScan()
  }
})
</script>
