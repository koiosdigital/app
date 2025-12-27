<template>
  <div class="flex min-h-screen flex-col bg-zinc-950">
    <!-- Header -->
    <header
      class="sticky top-0 z-10 border-b border-white/10 bg-zinc-950/95 backdrop-blur px-5 py-4"
    >
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-4">
          <UButton
            color="neutral"
            variant="ghost"
            icon="i-lucide-arrow-left"
            square
            @click="router.push('/')"
          />
          <h1 class="text-xl font-semibold">{{ deviceName }}</h1>
        </div>
        <UButton
          color="neutral"
          variant="ghost"
          icon="i-lucide-settings"
          square
          @click="router.push(`/matrx/${deviceId}/settings`)"
        />
      </div>
    </header>

    <!-- Loading State -->
    <div v-if="loading" class="flex flex-1 items-center justify-center">
      <UIcon name="i-lucide-loader-2" class="h-8 w-8 animate-spin text-white/50" />
    </div>

    <!-- Error State -->
    <div v-else-if="error" class="flex flex-1 items-center justify-center p-5">
      <UCard class="w-full max-w-md border border-red-500/20 bg-red-500/10">
        <div class="space-y-4 text-center">
          <UIcon name="i-lucide-alert-circle" class="h-12 w-12 text-red-400 mx-auto" />
          <p class="text-red-400">{{ error }}</p>
          <UButton color="neutral" variant="soft" @click="loadDevice">Retry</UButton>
        </div>
      </UCard>
    </div>

    <!-- Main Content -->
    <div v-else-if="device" class="flex flex-1 flex-col">
      <!-- Current Display Preview -->
      <section class="flex flex-col items-center gap-4 px-5 py-8 border-b border-white/10">
        <p class="text-xs uppercase tracking-widest text-white/50">Now Playing</p>
        <div v-if="currentInstallation" class="flex flex-col items-center gap-3">
          <InstallationPreview
            :device-id="deviceId"
            :installation-id="currentInstallation.id"
            :app-id="currentInstallation.appId"
            :app-name="currentInstallation.appName"
            :width="deviceWidth"
            :height="deviceHeight"
            :dot-size="4"
            :dot-gap="1"
            :show-frame="true"
            class="no-label"
          />
          <p class="text-sm text-white/70">{{ currentAppName }}</p>
        </div>
        <div v-else class="flex flex-col items-center gap-3">
          <!-- Empty state with frame -->
          <div class="inline-flex items-center justify-center p-3 bg-zinc-800 rounded-lg">
            <div
              class="flex items-center justify-center bg-black rounded-sm"
              :style="emptyPreviewStyle"
            >
              <UIcon name="i-lucide-image-off" class="h-6 w-6 text-white" />
            </div>
          </div>
          <p class="text-sm text-white/50">No app displaying</p>
        </div>
      </section>

      <!-- Installations Section -->
      <section class="flex-1 px-5 py-6">
        <div class="flex items-center justify-between mb-4">
          <h2 class="text-lg font-medium text-white/90">Apps</h2>
          <UButton
            v-if="installations.length > 1"
            size="sm"
            color="neutral"
            variant="ghost"
            :icon="isReordering ? 'i-lucide-check' : 'i-lucide-grip-vertical'"
            @click="toggleReorder"
          >
            {{ isReordering ? 'Done' : 'Reorder' }}
          </UButton>
        </div>

        <!-- Installations Grid -->
        <div
          ref="installationsContainer"
          class="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4"
        >
          <div
            v-for="(installation, index) in installations"
            :key="installation.id"
            class="relative"
            :draggable="isReordering"
            @dragstart="handleDragStart($event, index)"
            @dragover="handleDragOver($event, index)"
            @dragend="handleDragEnd"
            @drop="handleDrop($event, index)"
          >
            <button
              type="button"
              class="w-full rounded-lg border border-white/10 bg-white/5 p-3 transition hover:bg-white/10"
              :class="{
                'ring-2 ring-primary-500':
                  device.currentlyDisplayingInstallation === installation.id,
                'cursor-grab': isReordering,
                'opacity-50': dragIndex === index,
                'opacity-40': installation.skippedByServer,
              }"
              @click="!isReordering && openInstallation(installation.id)"
            >
              <InstallationPreview
                :device-id="deviceId"
                :installation-id="installation.id"
                :app-id="installation.appId"
                :app-name="installation.appName"
                :width="deviceWidth"
                :height="deviceHeight"
                :dot-size="2"
                :dot-gap="1"
                :show-frame="false"
              />
            </button>

            <!-- Context menu overlay -->
            <div v-if="!isReordering" class="absolute top-1 right-1">
              <UDropdownMenu :items="getInstallationMenuItems(installation)">
                <UButton
                  color="neutral"
                  variant="ghost"
                  icon="i-lucide-more-vertical"
                  size="xs"
                  class="bg-zinc-800/80 border border-white/10 hover:bg-zinc-700"
                  @click.stop
                />
              </UDropdownMenu>
            </div>

            <!-- Reorder handle -->
            <div
              v-if="isReordering"
              class="absolute -top-2 -right-2 flex h-6 w-6 items-center justify-center rounded-full bg-zinc-800 border border-white/20"
            >
              <UIcon name="i-lucide-grip-vertical" class="h-3 w-3 text-white/70" />
            </div>
          </div>

          <!-- Add New Installation Button -->
          <button
            type="button"
            class="flex aspect-[2/1] w-full flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-white/20 p-3 transition hover:border-white/40 hover:bg-white/5"
            @click="addInstallation"
          >
            <UIcon name="i-lucide-plus" class="h-8 w-8 text-white/40" />
            <span class="text-xs text-white/50">Add App</span>
          </button>
        </div>

        <!-- Empty State -->
        <div v-if="installations.length === 0" class="mt-4 text-center text-sm text-white/50">
          No apps installed yet. Add an app to get started.
        </div>
      </section>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useHead } from '@unhead/vue'
import InstallationPreview from '@/components/installations/InstallationPreview.vue'
import { devicesApi } from '@/lib/api/devices'
import { getErrorMessage } from '@/lib/api/errors'
import type { MatrxDevice } from '@/lib/api/mappers/deviceMapper'
import type { components } from '@/types/api'

type InstallationListItem = components['schemas']['InstallationListItemDto']

const router = useRouter()
const route = useRoute()

const deviceId = computed(() => route.params.id as string)

const device = ref<MatrxDevice | null>(null)
const installations = ref<InstallationListItem[]>([])
const loading = ref(true)
const error = ref<string>()

// Drag and drop state
const isReordering = ref(false)
const dragIndex = ref<number | null>(null)
const dropIndex = ref<number | null>(null)

// Polling interval
let pollInterval: ReturnType<typeof setInterval> | null = null

const deviceName = computed(
  () => device.value?.settings?.displayName || device.value?.id || 'Device'
)
const deviceWidth = computed(() => device.value?.settings?.width ?? 64)
const deviceHeight = computed(() => device.value?.settings?.height ?? 32)

const currentInstallation = computed(() => {
  if (!device.value?.currentlyDisplayingInstallation) return null
  return installations.value.find((i) => i.id === device.value?.currentlyDisplayingInstallation)
})

const currentAppName = computed(() => currentInstallation.value?.appName || 'Unknown App')

const emptyPreviewStyle = computed(() => {
  const dotSize = 4
  const dotGap = 1
  const displayWidth = deviceWidth.value * (dotSize + dotGap) - dotGap
  const displayHeight = deviceHeight.value * (dotSize + dotGap) - dotGap
  return {
    width: `${displayWidth}px`,
    height: `${displayHeight}px`,
  }
})

useHead({
  title: computed(() => `${deviceName.value} | Koios`),
  meta: [{ name: 'description', content: 'Manage your Matrx device' }],
})

async function loadDevice() {
  loading.value = true
  error.value = undefined

  try {
    const [deviceData, installationsData] = await Promise.all([
      devicesApi.getDevice(deviceId.value),
      devicesApi.getInstallations(deviceId.value),
    ])

    if (!deviceData) {
      error.value = 'Device not found'
      return
    }

    if (deviceData.type !== 'MATRX') {
      error.value = 'This is not a Matrix device'
      return
    }

    device.value = deviceData as MatrxDevice
    installations.value = (installationsData ?? []).sort((a, b) => a.sortOrder - b.sortOrder)
  } catch (err) {
    error.value = getErrorMessage(err, 'Failed to load device')
    console.error('Failed to load device:', err)
  } finally {
    loading.value = false
  }
}

function toggleReorder() {
  isReordering.value = !isReordering.value
  if (!isReordering.value) {
    // Save new order when done
    saveInstallationOrder()
  }
}

function handleDragStart(event: DragEvent, index: number) {
  if (!isReordering.value) return
  dragIndex.value = index
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = 'move'
  }
}

function handleDragOver(event: DragEvent, index: number) {
  if (!isReordering.value || dragIndex.value === null) return
  event.preventDefault()
  dropIndex.value = index
}

function handleDrop(event: DragEvent, index: number) {
  if (!isReordering.value || dragIndex.value === null) return
  event.preventDefault()

  const draggedItem = installations.value[dragIndex.value]
  const newInstallations = [...installations.value]
  newInstallations.splice(dragIndex.value, 1)
  newInstallations.splice(index, 0, draggedItem)

  // Update sortOrder on each item to match new positions
  newInstallations.forEach((inst, i) => {
    inst.sortOrder = i
  })

  installations.value = newInstallations
}

function handleDragEnd() {
  dragIndex.value = null
  dropIndex.value = null
}

async function saveInstallationOrder() {
  try {
    const updates = installations.value.map((inst, index) => ({
      id: inst.id,
      sortOrder: index,
      skippedByUser: inst.skippedByUser,
      pinnedByUser: inst.pinnedByUser,
    }))
    await devicesApi.bulkUpdateInstallations(deviceId.value, updates)
  } catch (err) {
    console.error('Failed to save installation order:', err)
  }
}

async function togglePin(installation: InstallationListItem) {
  const newPinState = !installation.pinnedByUser
  try {
    await devicesApi.setPinState(deviceId.value, installation.id, newPinState)
    // If pinning, unpin all others locally
    if (newPinState) {
      installations.value.forEach((inst) => {
        inst.pinnedByUser = inst.id === installation.id
      })
    } else {
      installation.pinnedByUser = false
    }
  } catch (err) {
    console.error('Failed to toggle pin:', err)
  }
}

async function toggleSkip(installation: InstallationListItem) {
  const newSkipState = !installation.skippedByUser
  try {
    await devicesApi.setSkipState(deviceId.value, installation.id, newSkipState)
    installation.skippedByUser = newSkipState
  } catch (err) {
    console.error('Failed to toggle skip:', err)
  }
}

function getInstallationMenuItems(installation: InstallationListItem) {
  return [
    [
      {
        label: installation.pinnedByUser ? 'Unpin' : 'Pin',
        icon: 'i-lucide-pin',
        onSelect: () => togglePin(installation),
      },
      {
        label: installation.skippedByUser ? 'Show in rotation' : 'Skip in rotation',
        icon: installation.skippedByUser ? 'i-lucide-eye' : 'i-lucide-eye-off',
        onSelect: () => toggleSkip(installation),
      },
    ],
  ]
}

function openInstallation(installationId: string) {
  router.push(`/matrx/${deviceId.value}/installations/${installationId}`)
}

function addInstallation() {
  router.push(`/matrx/${deviceId.value}/apps`)
}

// Poll device state every 5 seconds to update currently playing
async function pollDeviceState() {
  if (isReordering.value) return // Don't poll while reordering

  try {
    const deviceData = await devicesApi.getDevice(deviceId.value)
    if (deviceData?.type === 'MATRX') {
      device.value = deviceData as MatrxDevice
    }
  } catch (err) {
    console.error('Failed to poll device state:', err)
  }
}

onMounted(() => {
  loadDevice()
  // Start polling every 5 seconds
  pollInterval = setInterval(pollDeviceState, 5000)
})

onUnmounted(() => {
  // Clean up polling interval
  if (pollInterval) {
    clearInterval(pollInterval)
    pollInterval = null
  }
})
</script>

<style scoped>
.no-label :deep(span) {
  display: none;
}
</style>
