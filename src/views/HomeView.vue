<template>
  <PageLayout :on-refresh="loadDevices">
    <section class="mx-auto flex w-full max-w-[1180px] flex-col gap-5 px-4 py-4 lg:px-6 lg:py-6">
      <!-- Ownership transfers addressed to this account (accept from here or
           via the ?transfer= email deeplink). -->
      <PendingTransfersBanner @accepted="loadDevices" />

      <!-- From tablet up the page stops being a wall of tiles: a summary line
           carries the fleet's state, so the list below is only consulted when
           something in it needs you. Hidden on phones, where the header and the
           cards already say everything at a glance. -->
      <div
        v-if="!loading && !error && deviceCount"
        class="hidden items-center justify-between gap-4 md:flex"
      >
        <div class="roster-stats">
          <span class="roster-stat">
            <span class="k-lamp k-lamp--on" aria-hidden="true" />
            <span class="k-num">{{ reachableCount }}</span> of
            <span class="k-num">{{ deviceCount }}</span> reachable
          </span>
          <span v-if="attentionCount" class="roster-stat">
            <span class="k-lamp k-lamp--fault" aria-hidden="true" />
            <span class="k-num">{{ attentionCount }}</span>
            {{ attentionCount === 1 ? 'needs' : 'need' }} attention
          </span>
          <span v-if="visibleLocalDevices.length" class="k-chip k-chip--live">
            <UIcon name="i-fa6-solid:wifi" class="h-2.5 w-2.5" />
            {{ visibleLocalDevices.length }} on this network
          </span>
        </div>
        <UButton
          color="primary"
          size="sm"
          icon="i-fa6-solid:plus"
          @click="router.push('/setup/new')"
        >
          Add device
        </UButton>
      </div>

      <!-- One unified list: LAN-discovered devices (native-only, mDNS) alongside
           cloud account devices, deduped by device_id. Cards on phones and
           tablets; from lg up the same cards lay out as roster rows. -->
      <div
        v-if="loading || visibleLocalDevices.length || sortedDevices.length"
        class="device-roster k-stagger grid gap-3 sm:grid-cols-2 lg:grid-cols-1 lg:gap-2"
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
        <!-- Skeletons mirror the card's own anatomy — eyebrow, name, screen —
             so the layout doesn't jump when the real devices land. -->
        <template v-if="loading">
          <div
            v-for="i in 3"
            :key="i"
            class="skeleton-card flex h-full flex-col rounded-[14px] border border-default bg-muted p-3.5"
          >
            <USkeleton class="skeleton-screen mt-4 h-24 w-full rounded-lg lg:mt-0" />
            <div class="skeleton-identity">
              <USkeleton class="h-2.5 w-20 rounded-full" />
              <USkeleton class="mt-2.5 h-4 w-32 rounded" />
              <USkeleton class="mt-2 h-2.5 w-24 rounded-full" />
            </div>
          </div>
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
            <TranquilCloudDeviceCard
              v-else-if="isTranquilDevice(device)"
              :device="device"
              @open="openDevice"
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
        class="flex flex-col items-center gap-3 rounded-[14px] border border-error/25 bg-error/10 px-5 py-6 text-center"
      >
        <span class="k-lamp k-lamp--fault" aria-hidden="true" />
        <p class="text-sm text-default">{{ error }}</p>
        <UButton color="neutral" variant="soft" size="sm" @click="loadDevices">Try again</UButton>
      </div>

      <!-- Empty state earns its space: say what to do next, not just that
           there is nothing here. -->
      <div
        v-else-if="!loading && !visibleLocalDevices.length && !sortedDevices.length"
        class="flex flex-col items-center gap-3 rounded-[14px] border border-dashed border-default px-5 py-10 text-center"
      >
        <p class="k-eyebrow">No devices yet</p>
        <p class="max-w-[34ch] text-sm text-muted">
          Pair a Koios device to see it here. Anything already on this network shows up on its own.
        </p>
        <UButton
          color="primary"
          size="sm"
          icon="i-fa6-solid:plus"
          class="mt-1"
          @click="router.push('/setup/new')"
        >
          Add a device
        </UButton>
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
import { useNetworkStatus } from '@/composables/useNetworkStatus'
import MatrixDeviceCard from '@/components/devices/MatrixDeviceCard.vue'
import NemotoDeviceCard from '@/components/devices/NemotoDeviceCard.vue'
import LanternDeviceCard from '@/components/devices/LanternDeviceCard.vue'
import LocalDeviceCard from '@/components/devices/LocalDeviceCard.vue'
import TranquilDeviceCard from '@/components/devices/TranquilDeviceCard.vue'
import PendingTransfersBanner from '@/components/devices/PendingTransfersBanner.vue'
import { devicesApi } from '@/lib/api/devices'
import { getErrorMessage } from '@/lib/api/errors'
import {
  type ApiDevice,
  isMatrxDevice,
  isNemotoDevice,
  isTranquilDevice,
} from '@/lib/api/mappers/deviceMapper'
import { useLocalDevicesStore } from '@/stores/localDevices'
import { useTranquilLocalStore } from '@/stores/tranquilLocal'
import { useClockLocalStore } from '@/stores/clockLocal'
import {
  CLOCK_TYPES,
  isClockType,
  type LocalDevice,
  normalizeKoiosType,
} from '@/lib/mdns/discovery'

useHead({
  title: 'Devices | Koios Digital',
  meta: [{ name: 'description', content: 'Manage your Koios Digital devices' }],
})

const router = useRouter()
const toast = useToast()
const { setHeader } = usePageHeader()
const { onReconnect } = useNetworkStatus()
const localDevicesStore = useLocalDevicesStore()
const tranquilLocal = useTranquilLocalStore()
const clockLocal = useClockLocalStore()

let stopReconnectWatch: (() => void) | undefined

const devices = ref<ApiDevice[]>([])
const loading = ref(false)
const error = ref<string>()

// Families whose primary control path is LAN-direct. When such a device is
// broadcasting on the network, the local card wins over any cloud twin; for
// everything else (matrx/nemoto — cloud-only so far) the cloud card wins.
const LOCAL_CONTROLLED = new Set<string>(['TRANQUIL', ...CLOCK_TYPES])

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
    (local) => LOCAL_CONTROLLED.has(local.type) || !local.deviceId || !cloudIds.has(local.deviceId),
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

// Fleet-level readouts for the wide layout's summary line.
const deviceCount = computed(() => visibleLocalDevices.value.length + sortedDevices.value.length)

// An mDNS broadcast is proof of reachability, so local devices always count.
const reachableCount = computed(
  () => visibleLocalDevices.value.length + sortedDevices.value.filter((d) => d.online).length,
)

const attentionCount = computed(() => sortedDevices.value.filter((d) => !d.online).length)

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

  // TODO: Implement power toggle for Lantern devices when API supports it.
  // Until the endpoint lands, say so — a control that silently does nothing
  // reads as a broken app, not an unfinished feature.
  toast.add({
    title: 'Lantern power is not available yet',
    description: 'The control arrives with the next lantern firmware.',
    color: 'neutral',
  })
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
    toast.add({ title: getErrorMessage(err, 'Failed to toggle screen'), color: 'error' })
    console.error('Failed to toggle screen:', err)
  }
}

const handleSendTouch = async (id: string) => {
  // TODO: Implement send touch API call.
  void id
  toast.add({
    title: 'Touch is not available yet',
    description: 'Sending a touch needs the next lantern firmware.',
    color: 'neutral',
  })
}

const deviceBasePath = (device: ApiDevice) => {
  if (device.type === 'MATRX') return '/matrx'
  if (device.type === 'NEMOTO') return '/nemoto'
  // Tranquil has no cloud pages — it's LAN-controlled; when broadcasting, the
  // local card (which routes to /tranquil/local/) replaces this one.
  if (device.type === 'TRANQUIL') return null
  return '/lantern'
}

const openDevice = (id: string) => {
  const device = findDevice(id)
  if (!device) return
  const base = deviceBasePath(device)
  if (!base) return
  router.push(`${base}/${id}`)
}

const openSettings = (id: string) => {
  const device = findDevice(id)
  if (!device) return
  const base = deviceBasePath(device)
  if (!base) return
  router.push(`${base}/${id}/settings`)
}

const openMessage = (id: string) => {
  router.push(`/nemoto/${id}/message`)
}

const openLocalDevice = (device: LocalDevice) => {
  // LAN-direct families: establish the connection here (while the mDNS list is
  // still in memory) before navigating to the device page, which then drives
  // the already-active connection.
  const type = normalizeKoiosType(device.typeRaw)
  if (type === 'TRANQUIL') {
    tranquilLocal.connect(device)
    router.push(`/tranquil/local/${encodeURIComponent(device.id)}`)
    return
  }
  if (isClockType(type)) {
    clockLocal.connect(device)
    router.push(`/clock/local/${encodeURIComponent(device.id)}`)
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
      { icon: 'i-fa6-solid:plus', label: 'Add device', onClick: () => router.push('/setup/new') },
      { icon: 'i-fa6-solid:gear', label: 'Settings', onClick: () => router.push('/settings') },
    ],
  })
  loadDevices()
  // Anything that failed while the phone was dark is worth fetching again the
  // moment it isn't.
  stopReconnectWatch = onReconnect(loadDevices)
  // Native-only; a no-op on web (store.supported === false).
  localDevicesStore.start()
})

onUnmounted(() => {
  stopReconnectWatch?.()
  localDevicesStore.stop()
})
</script>

<style scoped>
.roster-stats {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 16px;
  font-size: 13px;
  color: var(--ui-text-muted);
}

.roster-stat {
  display: inline-flex;
  align-items: center;
  gap: 7px;
}
.roster-stat .k-num {
  color: var(--ui-text-highlighted);
}

/* ------------------------------------------------------------------
   Roster rows (lg and up)
   The same device cards, relaid as rows: preview, identity, status,
   actions — each in a fixed column so the eye runs straight down one
   axis instead of hunting across a ragged grid. Owned here rather than
   in BaseDeviceCard because it is a page-layout decision; the cards
   themselves stay layout-agnostic.
   ------------------------------------------------------------------ */
@media (min-width: 1024px) {
  .device-roster :deep(.k-device-card) {
    display: grid;
    /* A fixed action track is what keeps the right-hand edge honest: when it
       was auto-sized, each family's differently-sized buttons moved it, and
       the two card types with no actions collapsed it entirely. */
    grid-template-columns: 180px minmax(0, 1fr) 196px;
    align-items: center;
    gap: 20px;
    padding: 12px 14px;
    border-radius: 12px;
  }

  /* A row is a horizontal object — light spills from the left, off the
     device's own display, rather than up from the bottom edge. */
  .device-roster :deep(.k-device-card)::after {
    background: radial-gradient(40% 120% at 10% 50%, var(--bloom), transparent 70%);
  }

  .device-roster :deep(.k-device-card:active) {
    transform: none;
    background: linear-gradient(180deg, var(--k-raised), var(--k-panel-2));
  }

  .device-roster :deep(.k-device-card__stage) {
    grid-column: 1;
    grid-row: 1;
    justify-content: flex-start;
    padding: 0;
  }
  .device-roster :deep(.k-device-card__stage > *) {
    max-width: 180px;
  }

  .device-roster :deep(.k-device-card__head) {
    grid-column: 2;
    grid-row: 1;
    align-items: center;
    min-width: 0;
    padding: 0;
  }

  .device-roster :deep(.k-device-card__identity) {
    flex: 1;
  }
  .device-roster :deep(.k-device-card__title) {
    margin-top: 2px;
    font-size: 16px;
  }

  /* Status keeps the corner it holds in card mode — pinned to the card's own
     top-right, so it is anchored to an edge instead of drifting with whatever
     is beside it. */
  .device-roster :deep(.k-device-card__status) {
    position: absolute;
    top: 12px;
    right: 14px;
    flex-direction: row;
    align-items: center;
    gap: 8px;
  }

  /* Actions sit in their own column with no divider — the row's own edge
     already separates it from the next device. */
  .device-roster :deep(.k-device-card__foot) {
    grid-column: 3;
    grid-row: 1;
    padding: 0;
    border-top: 0;
    background: none;
    justify-content: flex-end;
    gap: 8px;
  }
  /* Card footers spread their actions apart; in a row they cluster on the
     right rail instead. */
  .device-roster :deep(.k-device-card__foot > .flex) {
    width: 100%;
    justify-content: flex-end;
    gap: 8px;
  }

  /* Skeletons take the row shape too, so nothing shifts on load. */
  .skeleton-card {
    display: grid;
    grid-template-columns: 180px minmax(0, 1fr);
    align-items: center;
    gap: 20px;
    padding: 12px 14px;
  }
  .skeleton-screen {
    height: 72px;
  }
}
</style>
