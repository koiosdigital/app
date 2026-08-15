<template>
  <PageLayout :on-refresh="loadDevice">
    <!-- Delete Confirmation Modal -->
    <DangerConfirmModal
      v-model="showDeleteModal"
      title="Delete Installation"
      :message="`Are you sure you want to remove '${deleteTarget?.appName}' from this device? This action cannot be undone.`"
      confirm-text="Delete"
      :loading="deleting"
      :error="deleteError"
      @confirm="handleDelete"
    />

    <PageState v-if="loading" loading />
    <PageState v-else-if="error" :error="error" @retry="loadDevice" />

    <!-- Main Content -->
    <div v-else-if="device" class="flex flex-1 flex-col">
      <!-- One hero for both states: pinning changes the label and the action,
           not the whole layout. -->
      <DeviceStage
        :eyebrow="pinnedInstallation ? 'Pinned' : 'Now playing'"
        :title="heroInstallation ? heroAppName : 'Nothing displaying'"
        :meta="heroMeta"
        :lit="!!heroInstallation"
      >
        <template #badge>
          <span v-if="pinnedInstallation" class="k-chip k-chip--ember">
            <UIcon name="i-fa6-solid:thumbtack" class="h-2.5 w-2.5" />
            Held
          </span>
        </template>

        <InstallationPreview
          v-if="heroInstallation"
          :device-id="deviceId"
          :installation-id="heroInstallation.id"
          :app-id="heroInstallation.appId"
          :width="deviceWidth"
          :height="deviceHeight"
          show-frame
          :show-label="false"
        />
        <div v-else class="k-bezel">
          <div
            class="k-screen empty-screen"
            :style="{ aspectRatio: `${deviceWidth} / ${deviceHeight}` }"
          >
            <UIcon name="i-fa6-regular:image" class="h-6 w-6 text-white/25" />
          </div>
        </div>

        <template #actions>
          <UButton
            v-if="pinnedInstallation"
            size="sm"
            color="neutral"
            variant="soft"
            icon="i-fa6-solid:thumbtack"
            :loading="unpinning"
            @click="unpinPinnedInstallation"
          >
            Resume rotation
          </UButton>
          <UButton
            v-else-if="installations.length"
            size="sm"
            color="neutral"
            variant="ghost"
            icon="i-fa6-solid:plus"
            @click="addInstallation"
          >
            Add an app
          </UButton>
        </template>
      </DeviceStage>

      <!-- Apps -->
      <section class="flex-1 px-4 py-5">
        <div class="mb-3 flex items-center justify-between gap-3">
          <div>
            <h2 class="text-[15px] font-semibold tracking-tight">Apps</h2>
            <p class="k-num text-[11.5px] text-muted">
              {{ rotationSummary }}
            </p>
          </div>
          <UButton
            v-if="installations.length > 1 && !pinnedInstallation"
            size="sm"
            :color="isReordering ? 'primary' : 'neutral'"
            :variant="isReordering ? 'solid' : 'ghost'"
            :icon="isReordering ? 'i-fa6-solid:check' : 'i-fa6-solid:grip-vertical'"
            @click="toggleReorder"
          >
            {{ isReordering ? 'Done' : 'Reorder' }}
          </UButton>
        </div>

        <div
          ref="installationsContainer"
          class="apps-grid"
          :class="{ 'is-reordering': isReordering }"
        >
          <div
            v-for="(installation, index) in installations"
            :key="installation.id"
            :draggable="isReordering"
            @dragstart="handleDragStart($event, index)"
            @dragover="handleDragOver($event, index)"
            @dragend="handleDragEnd"
            @drop="handleDrop($event, index)"
          >
            <button
              type="button"
              class="app-tile"
              :class="{
                'app-tile--live': device.currentlyDisplayingInstallation === installation.id,
                'app-tile--muted': installation.skippedByUser || installation.skippedByServer,
                'app-tile--dragging': dragIndex === index,
              }"
              @click="!isReordering && openInstallation(installation.id)"
            >
              <div class="app-tile__screen">
                <InstallationPreview
                  :device-id="deviceId"
                  :installation-id="installation.id"
                  :app-id="installation.appId"
                  :app-name="installation.appName"
                  :width="deviceWidth"
                  :height="deviceHeight"
                  show-frame
                  :show-label="false"
                />
                <span v-if="isReordering" class="app-tile__grip" aria-hidden="true">
                  <UIcon name="i-fa6-solid:grip-vertical" class="h-3 w-3" />
                </span>
              </div>

              <div class="app-tile__foot">
                <span class="app-tile__name">{{ installation.appName }}</span>
                <!-- State is stated, not implied by opacity: a skipped app used
                     to look identical to a slow-loading one. -->
                <span
                  v-if="device.currentlyDisplayingInstallation === installation.id"
                  class="k-lamp k-lamp--ember"
                  aria-label="On screen now"
                />
                <span v-else-if="installation.pinnedByUser" class="k-chip k-chip--ember">Held</span>
                <span v-else-if="installation.skippedByUser" class="k-chip">Skipped</span>
                <span v-else-if="installation.skippedByServer" class="k-chip">No data</span>
              </div>
            </button>
          </div>

          <button type="button" class="app-tile app-tile--add" @click="addInstallation">
            <div class="app-tile__screen">
              <div class="add-screen" :style="{ aspectRatio: `${deviceWidth} / ${deviceHeight}` }">
                <UIcon name="i-fa6-solid:plus" class="h-5 w-5" />
              </div>
            </div>
            <div class="app-tile__foot">
              <span class="app-tile__name">Add app</span>
            </div>
          </button>
        </div>

        <p v-if="installations.length === 0" class="mt-4 text-center text-sm text-muted">
          No apps yet. Add one and it starts showing on the panel straight away.
        </p>
      </section>
    </div>
  </PageLayout>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useHead } from '@unhead/vue'
import PageLayout from '@/layouts/PageLayout.vue'
import { usePageHeader } from '@/composables/usePageHeader'
import { usePolling } from '@/composables/usePolling'
import InstallationPreview from '@/components/installations/InstallationPreview.vue'
import DeviceStage from '@/components/devices/DeviceStage.vue'
import PageState from '@/components/PageState.vue'
import DangerConfirmModal from '@/components/DangerConfirmModal.vue'
import { devicesApi } from '@/lib/api/devices'
import { getErrorMessage } from '@/lib/api/errors'
import type { MatrxDevice } from '@/lib/api/mappers/deviceMapper'
import type { components } from '@/types/api'

type InstallationListItem = components['schemas']['InstallationListItemDto']

const router = useRouter()
const route = useRoute()
const toast = useToast()

const deviceId = computed(() => route.params.id as string)

const device = ref<MatrxDevice | null>(null)
const installations = ref<InstallationListItem[]>([])
const loading = ref(true)
const error = ref<string>()

// Drag and drop state
const isReordering = ref(false)
const dragIndex = ref<number | null>(null)
const dropIndex = ref<number | null>(null)
// Per-item copy of the order captured when reorder mode is entered, so a failed
// save can be reverted (drag mutates sortOrder on the shared item objects).
const orderSnapshot = ref<InstallationListItem[] | null>(null)

// Pinned state
const unpinning = ref(false)

const deviceName = computed(
  () => device.value?.settings?.displayName || device.value?.id || 'Device',
)
const deviceWidth = computed(() => device.value?.settings?.width ?? 64)
const deviceHeight = computed(() => device.value?.settings?.height ?? 32)

const currentInstallation = computed(() => {
  if (!device.value?.currentlyDisplayingInstallation) return null
  return installations.value.find((i) => i.id === device.value?.currentlyDisplayingInstallation)
})

const pinnedInstallation = computed(() => {
  return installations.value.find((i) => i.pinnedByUser)
})

// Pinned wins over rotation — it is literally what the panel is showing.
const heroInstallation = computed(() => pinnedInstallation.value ?? currentInstallation.value)
const heroAppName = computed(() => heroInstallation.value?.appName ?? 'Unknown app')

const activeCount = computed(
  () => installations.value.filter((i) => !i.skippedByUser && !i.skippedByServer).length,
)

const heroMeta = computed(() => {
  if (pinnedInstallation.value) return 'Held until you resume the rotation'
  if (!heroInstallation.value) return 'The panel is idle'
  return `1 of ${activeCount.value} in rotation`
})

const rotationSummary = computed(() => {
  const total = installations.value.length
  if (!total) return 'Nothing installed'
  const skipped = total - activeCount.value
  const base = `${activeCount.value} in rotation`
  return skipped ? `${base} · ${skipped} skipped` : base
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
  if (!isReordering.value) {
    // Entering reorder mode — snapshot the current order (per-item copy) so a
    // failed save can be rolled back to exactly this state.
    orderSnapshot.value = installations.value.map((i) => ({ ...i }))
    isReordering.value = true
  } else {
    isReordering.value = false
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
    orderSnapshot.value = null
  } catch (err) {
    // Restore the pre-reorder order so the UI reflects what's actually saved.
    if (orderSnapshot.value) {
      installations.value = orderSnapshot.value.sort((a, b) => a.sortOrder - b.sortOrder)
      orderSnapshot.value = null
    }
    toast.add({ title: getErrorMessage(err, 'Failed to save order'), color: 'error' })
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
    toast.add({ title: getErrorMessage(err, 'Failed to unpin installation'), color: 'error' })
    console.error('Failed to unpin installation:', err)
  } finally {
    unpinning.value = false
  }
}

// Delete installation
const deleteTarget = ref<InstallationListItem | null>(null)
const showDeleteModal = ref(false)
const deleting = ref(false)
const deleteError = ref<string>()

// Clear any stale delete error whenever the confirmation modal is opened.
watch(showDeleteModal, (open) => {
  if (open) deleteError.value = undefined
})

async function handleDelete() {
  if (!deleteTarget.value) return

  deleting.value = true
  deleteError.value = undefined
  try {
    await devicesApi.deleteInstallation(deviceId.value, deleteTarget.value.id)
    installations.value = installations.value.filter((i) => i.id !== deleteTarget.value?.id)
    showDeleteModal.value = false
    deleteTarget.value = null
  } catch (err) {
    deleteError.value = getErrorMessage(err, 'Failed to delete installation')
    toast.add({ title: deleteError.value, color: 'error' })
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

const { setHeader } = usePageHeader()

function syncHeader() {
  setHeader({
    title: deviceName.value,
    backRoute: '/',
    actions: [
      {
        icon: 'i-fa6-solid:gear',
        label: 'Settings',
        onClick: () => router.push(`/matrx/${deviceId.value}/settings`),
      },
    ],
  })
}

watch(deviceName, syncHeader)

// Which app is on screen changes without us asking, so keep it live — but
// only while the user is actually looking at this page.
usePolling(pollDeviceState, 5000)

onMounted(() => {
  syncHeader()
  loadDevice()
})
</script>

<style scoped>
.empty-screen {
  width: min(88vw, 520px);
  max-width: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
}

.apps-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

@media (min-width: 640px) {
  .apps-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}
@media (min-width: 1024px) {
  .apps-grid {
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }
}
@media (min-width: 1280px) {
  .apps-grid {
    grid-template-columns: repeat(5, minmax(0, 1fr));
  }
}

.app-tile {
  display: flex;
  width: 100%;
  flex-direction: column;
  gap: 8px;
  padding: 8px 8px 6px;
  text-align: left;
  border: 1px solid var(--k-line);
  border-radius: 12px;
  background: linear-gradient(180deg, var(--k-panel-2), var(--k-panel));
  box-shadow: var(--k-bezel);
  transition:
    border-color 0.18s var(--k-ease),
    transform 0.14s var(--k-ease),
    opacity 0.18s var(--k-ease);
}
.app-tile:active {
  transform: scale(0.985);
}

/* The app on screen right now is the only one wearing the ember. */
.app-tile--live {
  border-color: rgb(231 145 20 / 0.45);
  box-shadow:
    var(--k-bezel),
    0 0 0 1px rgb(231 145 20 / 0.18),
    0 10px 26px -18px rgb(231 145 20 / 0.9);
}

.app-tile--muted {
  opacity: 0.55;
}
.app-tile--dragging {
  opacity: 0.35;
}

.app-tile__screen {
  position: relative;
}

.app-tile__grip {
  position: absolute;
  top: -5px;
  right: -5px;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border-radius: 999px;
  color: var(--ui-text-muted);
  background: var(--k-raised);
  box-shadow: inset 0 0 0 1px var(--k-line);
}

.app-tile__foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
  min-height: 20px;
}

.app-tile__name {
  min-width: 0;
  overflow: hidden;
  font-size: 12.5px;
  font-weight: 500;
  color: var(--ui-text);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.app-tile--add {
  border-style: dashed;
  background: none;
  box-shadow: none;
  color: var(--ui-text-dimmed);
}
.app-tile--add .app-tile__name {
  color: var(--ui-text-dimmed);
}

.add-screen {
  display: flex;
  width: 100%;
  align-items: center;
  justify-content: center;
  border-radius: 6px;
  background: rgb(255 255 255 / 0.03);
  color: var(--ui-text-dimmed);
}

.is-reordering .app-tile {
  cursor: grab;
}
</style>
