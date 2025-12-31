<template>
  <div class="home-view flex flex-col bg-zinc-950">
    <header
      class="sticky top-0 z-10 border-b border-white/10 bg-zinc-950/95 backdrop-blur px-5 py-4"
    >
      <div class="flex items-center justify-between">
        <h1 class="text-xl font-semibold">Devices</h1>
        <UButton
          color="neutral"
          variant="ghost"
          icon="i-fa6-solid:gear"
          square
          @click="router.push('/settings')"
        />
      </div>
    </header>

    <main class="flex-1 min-h-0 overflow-y-auto">
      <section class="flex flex-col gap-6 px-5 py-6">
        <div class="flex flex-wrap items-center justify-end gap-4">
          <UButton
            color="primary"
            icon="i-fa6-solid:plus"
            size="sm"
            @click="router.push('/setup/new')"
          >
            Add device
          </UButton>
        </div>

        <div v-if="loading" class="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <UCard v-for="i in 3" :key="i" class="bg-white/5">
            <USkeleton class="h-32 w-full" />
          </UCard>
        </div>

        <div
          v-else-if="error"
          class="rounded-lg border border-red-500/20 bg-red-500/10 p-6 text-center"
        >
          <p class="text-red-400">{{ error }}</p>
          <UButton color="neutral" variant="soft" class="mt-4" @click="loadDevices"> Retry </UButton>
        </div>

        <div v-else-if="sortedDevices.length" class="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <template v-for="device in sortedDevices" :key="device.id">
            <MatrixDeviceCard
              v-if="isMatrxDevice(device)"
              :device="device"
              @open="openDevice"
              @toggle-screen="toggleScreen"
              @open-settings="openSettings"
            />
            <LanternDeviceCard
              v-else
              :device="device"
              @open="openDevice"
              @toggle-power="togglePower"
              @send-touch="handleSendTouch"
              @open-settings="openSettings"
            />
          </template>
        </div>

        <div
          v-else
          class="rounded-lg border border-dashed border-white/20 p-6 text-center text-white/70"
        >
          No devices yet. Add your first Koios Digital product to get started.
        </div>
      </section>
    </main>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useHead } from '@unhead/vue'
import MatrixDeviceCard from '@/components/devices/MatrixDeviceCard.vue'
import LanternDeviceCard from '@/components/devices/LanternDeviceCard.vue'
import { devicesApi } from '@/lib/api/devices'
import { getErrorMessage } from '@/lib/api/errors'
import { type ApiDevice, isMatrxDevice } from '@/lib/api/mappers/deviceMapper'

useHead({
  title: 'Devices | Koios Digital',
  meta: [{ name: 'description', content: 'Manage your Koios Digital devices' }],
})

const router = useRouter()

const devices = ref<ApiDevice[]>([])
const loading = ref(false)
const error = ref<string>()

const sortedDevices = computed(() => {
  return [...devices.value].sort((a, b) => {
    const nameA = a.settings?.displayName || a.id
    const nameB = b.settings?.displayName || b.id
    return nameA.localeCompare(nameB, undefined, { sensitivity: 'base' })
  })
})

const loadDevices = async () => {
  loading.value = true
  error.value = undefined

  try {
    const apiDevices = await devicesApi.getDevices()
    devices.value = apiDevices
  } catch (err) {
    error.value = getErrorMessage(err, 'Failed to load devices')
    console.error('Failed to load devices:', err)
  } finally {
    loading.value = false
  }
}

const findDevice = (id: string) => devices.value.find((device) => device.id === id)

const togglePower = async (id: string) => {
  const device = findDevice(id)
  if (!device) return

  // TODO: Implement power toggle for Lantern devices when API supports it
  console.info('Toggle power for lantern', id)
}

const toggleScreen = async (id: string) => {
  const device = findDevice(id)
  if (!device || !isMatrxDevice(device)) return

  const currentEnabled = device.settings?.typeSettings?.screenEnabled ?? true
  const nextEnabled = !currentEnabled

  // Optimistic update
  const index = devices.value.findIndex((d) => d.id === id)
  if (index !== -1 && isMatrxDevice(devices.value[index])) {
    const matrxDevice = devices.value[index] as typeof device
    devices.value[index] = {
      ...matrxDevice,
      settings: {
        ...matrxDevice.settings,
        displayName: matrxDevice.settings?.displayName ?? '',
        typeSettings: {
          ...matrxDevice.settings?.typeSettings,
          screenEnabled: nextEnabled,
          screenBrightness: matrxDevice.settings?.typeSettings?.screenBrightness ?? 200,
          autoBrightnessEnabled: matrxDevice.settings?.typeSettings?.autoBrightnessEnabled ?? false,
          screenOffLux: matrxDevice.settings?.typeSettings?.screenOffLux ?? 3,
        },
      },
    }
  }

  try {
    await devicesApi.updateMatrxSettings(id, { typeSettings: { screenEnabled: nextEnabled } })
  } catch (err) {
    // Revert on error
    if (index !== -1 && isMatrxDevice(devices.value[index])) {
      const matrxDevice = devices.value[index] as typeof device
      devices.value[index] = {
        ...matrxDevice,
        settings: {
          ...matrxDevice.settings,
          displayName: matrxDevice.settings?.displayName ?? '',
          typeSettings: {
            ...matrxDevice.settings?.typeSettings,
            screenEnabled: currentEnabled,
            screenBrightness: matrxDevice.settings?.typeSettings?.screenBrightness ?? 200,
            autoBrightnessEnabled:
              matrxDevice.settings?.typeSettings?.autoBrightnessEnabled ?? false,
            screenOffLux: matrxDevice.settings?.typeSettings?.screenOffLux ?? 3,
          },
        },
      }
    }
    console.error('Failed to toggle screen:', err)
  }
}

const handleSendTouch = async (id: string) => {
  try {
    // TODO: Implement send touch API call
    console.info('Send touch to', id)
  } catch (err) {
    console.error('Failed to send touch:', err)
  }
}

const openDevice = (id: string) => {
  const device = findDevice(id)
  if (!device) return

  const basePath = device.type === 'MATRX' ? '/matrx' : '/lantern'
  router.push(`${basePath}/${id}`)
}

const openSettings = (id: string) => {
  const device = findDevice(id)
  if (!device) return

  const basePath = device.type === 'MATRX' ? '/matrx' : '/lantern'
  router.push(`${basePath}/${id}/settings`)
}

onMounted(() => {
  loadDevices()
})
</script>

<style scoped>
.home-view {
  height: 100vh;
  height: 100dvh;
}
</style>
