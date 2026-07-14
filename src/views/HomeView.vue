<template>
  <PageLayout :on-refresh="loadDevices">
    <section class="flex flex-col gap-6 px-5 py-6">
      <!-- One unified grid: LAN-discovered devices (native-only, mDNS) alongside
           cloud account devices, deduped by device_id. -->
      <div
        v-if="loading || visibleLocalDevices.length || sortedDevices.length"
        class="grid gap-4 md:grid-cols-2 xl:grid-cols-3"
      >
        <template v-for="local in visibleLocalDevices" :key="local.id">
          <TranquilDeviceCard
            v-if="local.type === 'TRANQUIL'"
            :device="local"
            @open="openLocalDevice"
            @open-settings="openLocalSettings"
          />
          <LocalDeviceCard v-else :device="local" @open="openLocalDevice" />
        </template>
        <template v-if="loading">
          <UCard v-for="i in 3" :key="i" class="bg-white/5">
            <USkeleton class="h-32 w-full" />
          </UCard>
        </template>
        <template v-else-if="!error">
          <template v-for="device in sortedDevices" :key="device.id">
            <MatrixDeviceCard
              v-if="isMatrxDevice(device)"
              :device="device"
              @open="openDevice"
              @toggle-screen="toggleScreen"
              @open-settings="openSettings"
            />
            <NemotoDeviceCard
              v-else-if="isNemotoDevice(device)"
              :device="device"
              @open="openDevice"
              @send-message="openMessage"
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
        </template>
      </div>

      <div
        v-if="!loading && error"
        class="rounded-lg border border-red-500/20 bg-red-500/10 p-6 text-center"
      >
        <p class="text-red-400">{{ error }}</p>
        <UButton color="neutral" variant="soft" class="mt-4" @click="loadDevices"> Retry </UButton>
      </div>

      <div
        v-else-if="!loading && !visibleLocalDevices.length && !sortedDevices.length"
        class="rounded-lg border border-dashed border-white/20 p-6 text-center text-white/70"
      >
        No devices yet. Add your first Koios Digital product to get started.
      </div>
    </section>
  </PageLayout>
</template>

<script setup lang="ts">
import { computed, ref, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { useHead } from '@unhead/vue'
import PageLayout from '@/layouts/PageLayout.vue'
import { usePageHeader } from '@/composables/usePageHeader'
import MatrixDeviceCard from '@/components/devices/MatrixDeviceCard.vue'
import NemotoDeviceCard from '@/components/devices/NemotoDeviceCard.vue'
import LanternDeviceCard from '@/components/devices/LanternDeviceCard.vue'
import LocalDeviceCard from '@/components/devices/LocalDeviceCard.vue'
import TranquilDeviceCard from '@/components/devices/TranquilDeviceCard.vue'
import { devicesApi } from '@/lib/api/devices'
import { getErrorMessage } from '@/lib/api/errors'
import { type ApiDevice, isMatrxDevice, isNemotoDevice } from '@/lib/api/mappers/deviceMapper'
import { useLocalDevicesStore } from '@/stores/localDevices'
import { useTranquilLocalStore } from '@/stores/tranquilLocal'
import { type LocalDevice, normalizeKoiosType } from '@/lib/mdns/discovery'

useHead({
  title: 'Devices | Koios Digital',
  meta: [{ name: 'description', content: 'Manage your Koios Digital devices' }],
})

const router = useRouter()
const { setHeader } = usePageHeader()
const localDevicesStore = useLocalDevicesStore()
const tranquilLocal = useTranquilLocalStore()

const devices = ref<ApiDevice[]>([])
const loading = ref(false)
const error = ref<string>()

// Families whose primary control path is LAN-direct. When such a device is
// broadcasting on the network, the local card wins over any cloud twin; for
// everything else (matrx/nemoto — cloud-only so far) the cloud card wins.
const LOCAL_CONTROLLED = new Set<string>(['TRANQUIL'])

// mDNS broadcasts keyed by the cloud device id from the `device_id` TXT record.
const localByDeviceId = computed(() => {
  const map = new Map<string, LocalDevice>()
  for (const local of localDevicesStore.devices) {
    if (local.deviceId) map.set(local.deviceId, local)
  }
  return map
})

// Local cards: locally-controlled families always, others only when the device
// isn't already represented by a cloud card.
const visibleLocalDevices = computed(() => {
  const cloudIds = new Set(devices.value.map((d) => d.id))
  return localDevicesStore.devices.filter(
    (local) =>
      LOCAL_CONTROLLED.has(local.type) || !local.deviceId || !cloudIds.has(local.deviceId),
  )
})

const sortedDevices = computed(() => {
  return devices.value
    .filter((device) => {
      // Hide the cloud card when a locally-controlled twin is broadcasting.
      const local = localByDeviceId.value.get(device.id)
      return !(local && LOCAL_CONTROLLED.has(local.type))
    })
    .sort((a, b) => {
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

const deviceBasePath = (device: ApiDevice) => {
  if (device.type === 'MATRX') return '/matrx'
  if (device.type === 'NEMOTO') return '/nemoto'
  return '/lantern'
}

const openDevice = (id: string) => {
  const device = findDevice(id)
  if (!device) return
  router.push(`${deviceBasePath(device)}/${id}`)
}

const openSettings = (id: string) => {
  const device = findDevice(id)
  if (!device) return
  router.push(`${deviceBasePath(device)}/${id}/settings`)
}

const openMessage = (id: string) => {
  router.push(`/nemoto/${id}/message`)
}

const openLocalDevice = (device: LocalDevice) => {
  // Tranquil is LAN-direct controlled: establish the connection here (while the
  // mDNS list is still in memory) before navigating to the device page, which
  // then drives the already-active connection.
  if (normalizeKoiosType(device.typeRaw) === 'TRANQUIL') {
    tranquilLocal.connect(device)
    router.push(`/tranquil/local/${encodeURIComponent(device.id)}`)
    return
  }
  // TODO(fold-in): other device families' LAN pages not built yet.
  console.info('Open local device', device.type, device.name, device.baseUrl)
}

const openLocalSettings = (device: LocalDevice) => {
  // Same connect-then-navigate dance as openLocalDevice, straight to settings.
  tranquilLocal.connect(device)
  router.push(`/tranquil/local/${encodeURIComponent(device.id)}/settings`)
}

onMounted(() => {
  setHeader({
    title: 'Devices',
    actions: [
      { icon: 'i-fa6-solid:plus', onClick: () => router.push('/setup/new') },
      { icon: 'i-fa6-solid:gear', onClick: () => router.push('/settings') },
    ],
  })
  loadDevices()
  // Native-only; a no-op on web (store.supported === false).
  localDevicesStore.start()
})

onUnmounted(() => {
  localDevicesStore.stop()
})
</script>
