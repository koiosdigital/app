<template>
  <div class="flex flex-1 min-h-0 flex-col bg-zinc-950">
    <!-- Header -->
    <header
      class="sticky top-0 z-10 border-b border-white/10 bg-zinc-950/95 backdrop-blur px-5 py-4"
    >
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-4">
          <UButton
            color="neutral"
            variant="ghost"
            icon="i-fa6-solid:arrow-left"
            square
            @click="router.push('/')"
          />
          <h1 class="text-xl font-semibold">{{ deviceName }}</h1>
        </div>
        <UButton
          color="neutral"
          variant="ghost"
          icon="i-fa6-solid:gear"
          square
          @click="router.push(`/matrx/${deviceId}/settings`)"
        />
      </div>
    </header>

    <!-- Delete Confirmation Modal -->
    <DangerConfirmModal
      v-model="showDeleteModal"
      title="Delete Installation"
      :message="`Are you sure you want to remove '${deleteTarget?.appName}' from this device? This action cannot be undone.`"
      confirm-text="Delete"
      :loading="deleting"
      @confirm="handleDelete"
    />

    <!-- Loading State -->
    <div v-if="loading" class="flex flex-1 items-center justify-center">
      <UIcon name="i-fa6-solid:spinner" class="h-8 w-8 animate-spin text-white/50" />
    </div>

    <!-- Error State -->
    <div v-else-if="error" class="flex flex-1 items-center justify-center p-5">
      <UCard class="w-full max-w-md border border-red-500/20 bg-red-500/10">
        <div class="space-y-4 text-center">
          <UIcon name="i-fa6-solid:circle-exclamation" class="h-12 w-12 text-red-400 mx-auto" />
          <p class="text-red-400">{{ error }}</p>
          <UButton color="neutral" variant="soft" @click="loadDevice">Retry</UButton>
        </div>
      </UCard>
    </div>

    <!-- Main Content -->
    <div v-else-if="device" class="flex flex-1 flex-col">
      <!-- Current Display Preview / Pinned App -->
      <section class="flex flex-col items-center gap-4 px-5 py-8 border-b border-white/10">
        <!-- Pinned App State -->
        <template v-if="pinnedInstallation">
          <div class="flex items-center gap-2">
            <UIcon name="i-fa6-solid:thumbtack" class="h-3 w-3 text-primary-400" />
            <p class="text-xs uppercase tracking-widest text-primary-400">Pinned App</p>
          </div>
          <div class="flex flex-col items-center gap-3">
            <div
              class="now-playing-container"
              :style="{ aspectRatio: `${deviceWidth} / ${deviceHeight}` }"
            >
              <InstallationPreview
                :device-id="deviceId"
                :installation-id="pinnedInstallation.id"
                :app-id="pinnedInstallation.appId"
                :width="deviceWidth"
                :height="deviceHeight"
                show-frame
                :show-label="false"
              />
            </div>
            <p class="text-sm text-white/70">{{ pinnedInstallation.appName }}</p>
          </div>
          <UButton
            size="sm"
            color="neutral"
            variant="soft"
            icon="i-fa6-solid:thumbtack"
            :loading="unpinning"
            @click="unpinPinnedInstallation"
          >
            Unpin
          </UButton>
        </template>

        <!-- Normal Now Playing State -->
        <template v-else>
          <p class="text-xs uppercase tracking-widest text-white/50">Now Playing</p>
          <div v-if="currentInstallation" class="flex flex-col items-center gap-3">
            <div
              class="now-playing-container"
              :style="{ aspectRatio: `${deviceWidth} / ${deviceHeight}` }"
            >
              <InstallationPreview
                :device-id="deviceId"
                :installation-id="currentInstallation.id"
                :app-id="currentInstallation.appId"
                :width="deviceWidth"
                :height="deviceHeight"
                show-frame
                :show-label="false"
              />
            </div>
            <p class="text-sm text-white/70">{{ currentAppName }}</p>
          </div>
          <div v-else class="flex flex-col items-center gap-3">
            <!-- Empty state with frame -->
            <div class="empty-preview-frame">
              <div
                class="empty-preview-screen"
                :style="{ aspectRatio: `${deviceWidth} / ${deviceHeight}` }"
              >
                <UIcon name="i-fa6-regular:image" class="h-6 w-6 text-white/30" />
              </div>
            </div>
            <p class="text-sm text-white/50">No app displaying</p>
          </div>
        </template>
      </section>

      <!-- Installations Section -->
      <section class="relative flex-1 px-5 py-6">
        <div class="flex items-center justify-between mb-4">
          <h2 class="text-lg font-medium text-white/90">Apps</h2>
          <UButton
            v-if="installations.length > 1 && !pinnedInstallation"
            size="sm"
            color="neutral"
            variant="ghost"
            :icon="isReordering ? 'i-fa6-solid:check' : 'i-fa6-solid:grip-vertical'"
            @click="toggleReorder"
          >
            {{ isReordering ? 'Done' : 'Reorder' }}
          </UButton>
        </div>

        <!-- Installations Grid -->
        <div ref="installationsContainer" class="installations-grid">
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
                'opacity-50': dragIndex === index || installation.skippedByUser,
                'opacity-40': installation.skippedByServer,
              }"
              @click="!isReordering && openInstallation(installation.id)"
            >
              <!-- Skipped state placeholder -->
              <div v-if="installation.skippedByUser" class="flex flex-col items-center gap-2">
                <div
                  class="skipped-preview"
                  :style="{ aspectRatio: `${deviceWidth} / ${deviceHeight}` }"
                >
                  <UIcon name="i-fa6-regular:eye-slash" class="h-5 w-5 text-white/30" />
                </div>
                <span class="text-sm text-white/50 text-center truncate max-w-full">{{
                  installation.appName
                }}</span>
              </div>

              <!-- Normal preview -->
              <InstallationPreview
                v-else
                :device-id="deviceId"
                :installation-id="installation.id"
                :app-id="installation.appId"
                :app-name="installation.appName"
                :width="deviceWidth"
                :height="deviceHeight"
                :show-frame="true"
              />
            </button>

            <!-- Reorder handle -->
            <div
              v-if="isReordering"
              class="absolute -top-2 -right-2 flex h-6 w-6 items-center justify-center rounded-full bg-zinc-800 border border-white/20"
            >
              <UIcon name="i-fa6-solid:grip-vertical" class="h-3 w-3 text-white/70" />
            </div>
          </div>

          <!-- Add New Installation Button -->
          <button
            type="button"
            class="w-full rounded-lg border-2 border-dashed border-white/20 p-3 transition hover:border-white/40 hover:bg-white/5"
            @click="addInstallation"
          >
            <div class="flex flex-col items-center gap-2">
              <div
                class="add-button-preview"
                :style="{ aspectRatio: `${deviceWidth} / ${deviceHeight}` }"
              >
                <UIcon name="i-fa6-solid:plus" class="h-6 w-6 text-white/40" />
              </div>
              <span class="text-sm text-white/50">Add App</span>
            </div>
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
import DangerConfirmModal from '@/components/DangerConfirmModal.vue'
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

// Pinned state
const unpinning = ref(false)

// Polling interval
let pollInterval: ReturnType<typeof setInterval> | null = null

const deviceName = computed(
  () => device.value?.settings?.displayName || device.value?.id || 'Device',
)
const deviceWidth = computed(() => device.value?.settings?.width ?? 64)
const deviceHeight = computed(() => device.value?.settings?.height ?? 32)

const currentInstallation = computed(() => {
  if (!device.value?.currentlyDisplayingInstallation) return null
  return installations.value.find((i) => i.id === device.value?.currentlyDisplayingInstallation)
})

const currentAppName = computed(() => currentInstallation.value?.appName || 'Unknown App')

const pinnedInstallation = computed(() => {
  return installations.value.find((i) => i.pinnedByUser)
})

useHead({
  title: computed(() => `${deviceName.value} | Koios Digital`),
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

async function unpinPinnedInstallation() {
  if (!pinnedInstallation.value) return
  unpinning.value = true
  try {
    await devicesApi.setPinState(deviceId.value, pinnedInstallation.value.id, false)
    const installation = installations.value.find((i) => i.id === pinnedInstallation.value?.id)
    if (installation) {
      installation.pinnedByUser = false
    }
  } catch (err) {
    console.error('Failed to unpin installation:', err)
  } finally {
    unpinning.value = false
  }
}

// Delete installation
const deleteTarget = ref<InstallationListItem | null>(null)
const showDeleteModal = ref(false)
const deleting = ref(false)

async function handleDelete() {
  if (!deleteTarget.value) return

  deleting.value = true
  try {
    await devicesApi.deleteInstallation(deviceId.value, deleteTarget.value.id)
    installations.value = installations.value.filter((i) => i.id !== deleteTarget.value?.id)
    showDeleteModal.value = false
    deleteTarget.value = null
  } catch (err) {
    console.error('Failed to delete installation:', err)
  } finally {
    deleting.value = false
  }
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
/* Now playing container - provides size constraints while child fills it */
.now-playing-container {
  width: min(80vw, 400px); /* Explicit width - uses 80vw or 400px, whichever is smaller */
  max-height: 40vh;
  max-width: 40vw;
}

/* Installations grid */
.installations-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 1rem;
}

@media (min-width: 768px) {
  .installations-grid {
    grid-template-columns: repeat(3, 1fr);
  }
}

@media (min-width: 1024px) {
  .installations-grid {
    grid-template-columns: repeat(4, 1fr);
  }
}

@media (min-width: 1280px) {
  .installations-grid {
    grid-template-columns: repeat(5, 1fr);
  }
}

/* Empty state preview frame - matches now-playing constraints */
.empty-preview-frame {
  width: min(80vw, 400px);
  max-height: 40vh;
  padding: 6px;
  background: #27272a;
  border-radius: 0.5rem;
}

.empty-preview-screen {
  width: 100%;
  background: black;
  border-radius: 2px;
  display: flex;
  align-items: center;
  justify-content: center;
}

/* Skipped installation preview */
.skipped-preview {
  width: 100%;
  background: black;
  border-radius: 2px;
  display: flex;
  align-items: center;
  justify-content: center;
}

/* Add button preview */
.add-button-preview {
  width: 100%;
  background: rgb(39 39 42 / 0.5);
  border-radius: 2px;
  display: flex;
  align-items: center;
  justify-content: center;
}
</style>
