<template>
  <div class="flex min-h-screen flex-col bg-zinc-950">
    <!-- Top Header -->
    <header class="sticky top-0 z-10 border-b border-white/10 bg-zinc-950/95 backdrop-blur px-5 py-4">
      <div class="flex items-center justify-between">
        <h1 class="text-xl font-semibold">Koios Digital</h1>
        <UButton
          color="neutral"
          variant="ghost"
          icon="i-lucide-settings"
          square
          @click="router.push('/settings')"
        />
      </div>
    </header>

    <!-- Main Content -->
    <section class="flex flex-col gap-6 px-5 py-6">
      <div class="flex flex-wrap items-center justify-between gap-4">
        <h2 class="text-lg font-medium text-white/90">Devices</h2>
        <UButton color="primary" icon="i-lucide-plus" size="sm" @click="router.push('/setup/new')">
          Add device
        </UButton>
      </div>

      <div v-if="loading" class="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <UCard v-for="i in 3" :key="i" class="bg-white/5">
          <USkeleton class="h-32 w-full" />
        </UCard>
      </div>

      <div v-else-if="error" class="rounded-lg border border-red-500/20 bg-red-500/10 p-6 text-center">
        <p class="text-red-400">{{ error }}</p>
        <UButton color="neutral" variant="soft" class="mt-4" @click="loadDevices">
          Retry
        </UButton>
      </div>

      <div v-else-if="sortedDevices.length" class="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <component
          :is="componentRegistry[device.type]"
          v-for="device in sortedDevices"
          :key="device.mac"
          :device="device"
          @open="openDevice"
          @toggle-power="togglePower"
          @open-settings="openSettings"
          v-on="device.type === 'matrix' ? { skip: handleSkip } : { 'send-touch': handleSendTouch }"
        />
      </div>

      <div
        v-else
        class="rounded-lg border border-dashed border-white/20 p-6 text-center text-white/70"
      >
        No devices yet. Add your first Koios screen or lantern to get started.
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import type { Component } from 'vue'
import { computed, ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import MatrixDeviceCard from '@/components/devices/MatrixDeviceCard.vue'
import LanternDeviceCard from '@/components/devices/LanternDeviceCard.vue'
import { devicesApi } from '@/lib/api/devices'
import { mapApiDevices, type Device } from '@/lib/api/mappers/deviceMapper'

const router = useRouter()

const componentRegistry: Record<'matrix' | 'lantern', Component> = {
  matrix: MatrixDeviceCard,
  lantern: LanternDeviceCard,
}

const devices = ref<Device[]>([])
const loading = ref(false)
const error = ref<string>()

const sortedDevices = computed(() =>
  [...devices.value].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }))
)

const loadDevices = async () => {
  loading.value = true
  error.value = undefined

  try {
    const apiDevices = await devicesApi.getDevices()
    devices.value = mapApiDevices(apiDevices)
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Failed to load devices'
    console.error('Failed to load devices:', err)
  } finally {
    loading.value = false
  }
}

const findDevice = (mac: string) => devices.value.find((device: Device) => device.mac === mac)

const patchDevice = (mac: string, patch: Partial<Device>) => {
  const index = devices.value.findIndex((device: Device) => device.mac === mac)
  if (index === -1) return

  devices.value[index] = { ...devices.value[index], ...patch } as Device
}

const togglePower = async (mac: string) => {
  const device = findDevice(mac)
  if (!device) return

  const nextIsOn = !device.isOn

  // Optimistic update
  patchDevice(mac, { isOn: nextIsOn, status: nextIsOn ? 'online' : 'offline' })

  try {
    await devicesApi.updateDevice(mac, { online: nextIsOn } as any)
  } catch (err) {
    // Revert on error
    patchDevice(mac, { isOn: device.isOn, status: device.status })
    console.error('Failed to toggle power:', err)
  }
}

const handleSkip = async (mac: string) => {
  try {
    // TODO: Implement skip installation API call
    console.info('Skip installation for', mac)
  } catch (err) {
    console.error('Failed to skip installation:', err)
  }
}

const handleSendTouch = async (mac: string) => {
  try {
    // TODO: Implement send touch API call
    console.info('Send touch to', mac)
  } catch (err) {
    console.error('Failed to send touch:', err)
  }
}

const openDevice = (mac: string) => {
  const device = findDevice(mac)
  if (!device) return

  const basePath = device.type === 'matrix' ? '/matrx' : '/lantern'
  router.push(`${basePath}/${mac}`)
}

const openSettings = (mac: string) => {
  const device = findDevice(mac)
  if (!device) return

  const basePath = device.type === 'matrix' ? '/matrx' : '/lantern'
  router.push(`${basePath}/${mac}/settings`)
}

onMounted(() => {
  loadDevices()
})
</script>
