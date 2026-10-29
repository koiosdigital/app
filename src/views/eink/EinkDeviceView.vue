<template>
  <PageLayout :on-refresh="refresh">
    <!-- Deep-linked / reloaded: discovery state is lost, so bounce back to the
         device list to reopen the frame. -->
    <div v-if="!isActive" class="flex flex-col items-center gap-4 px-5 py-16 text-center">
      <UIcon name="i-fa6-solid:image" class="h-8 w-8 text-white/30" />
      <p class="text-white/70">This frame isn't connected. Open it from your device list.</p>
      <UButton color="primary" variant="soft" @click="router.replace('/')">Go to devices</UButton>
    </div>

    <div v-else class="flex flex-col gap-4 px-5 py-6">
      <div
        v-if="!store.connected"
        class="flex items-center gap-2 rounded-lg border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-sm text-amber-300"
      >
        <UIcon name="i-fa6-solid:spinner" class="h-4 w-4 animate-spin" />
        Connecting to the frame…
      </div>

      <UAlert
        v-if="store.error"
        color="error"
        icon="i-fa6-solid:circle-exclamation"
        :title="store.error"
      />

      <!-- Status -->
      <UCard v-if="store.info" class="bg-white/5">
        <div class="grid grid-cols-2 gap-y-2 text-sm">
          <span class="text-white/60">Screen</span>
          <span class="text-right">{{ store.info.screen_model }}</span>
          <span class="text-white/60">Firmware</span>
          <span class="text-right">v{{ store.info.version }}</span>
          <template v-if="store.battery !== null">
            <span class="text-white/60">Battery</span>
            <span class="text-right">{{ store.battery }}%</span>
          </template>
        </div>
      </UCard>

      <!-- Display settings (processing preset -> POST /settings) -->
      <h2 class="k-eyebrow mt-2">Display</h2>
      <UCard class="bg-white/5">
        <div class="flex flex-col gap-5">
          <div class="flex flex-col gap-2">
            <span class="text-sm font-medium">Preset</span>
            <div class="flex flex-col gap-2">
              <UButton
                v-for="p in EINK_PRESETS"
                :key="p.value"
                :color="presetForm === p.value ? 'primary' : 'neutral'"
                :variant="presetForm === p.value ? 'solid' : 'soft'"
                size="sm"
                block
                class="justify-start"
                @click="presetForm = p.value"
              >
                <span class="flex flex-col items-start text-left">
                  <span class="font-medium">{{ p.label }}</span>
                  <span class="text-xs opacity-70">{{ p.hint }}</span>
                </span>
              </UButton>
            </div>
          </div>

          <div class="flex gap-2">
            <UButton
              color="primary"
              size="sm"
              block
              :loading="store.busy"
              :disabled="!store.connected || presetForm === store.preset"
              @click="applyPreset"
            >
              Apply preset
            </UButton>
            <UButton
              color="neutral"
              variant="soft"
              size="sm"
              :loading="store.busy"
              :disabled="!store.connected"
              @click="clearScreen"
            >
              Clear
            </UButton>
          </div>
          <p class="text-xs text-white/40">
            The preset is applied on the frame to the next photo you send and to
            scheduled server pulls.
          </p>
        </div>
      </UCard>

      <!-- Schedule & sync (wake cadence + scheduled-pull server -> POST /settings) -->
      <h2 class="k-eyebrow mt-2">Schedule &amp; sync</h2>
      <UCard class="bg-white/5">
        <div class="flex flex-col gap-5">
          <div class="flex items-center justify-between gap-4">
            <span class="text-sm font-medium">Wake every</span>
            <div class="flex items-center gap-2">
              <UInput v-model.number="scheduleForm.sleepMinutes" type="number" :min="1" class="w-24" />
              <span class="text-sm text-white/60">min</span>
            </div>
          </div>

          <div class="flex items-center justify-between">
            <div class="flex flex-col">
              <span class="text-sm font-medium">Pull from a server</span>
              <span class="text-xs text-white/40">Fetch a new image on each wake</span>
            </div>
            <USwitch v-model="scheduleForm.upstreamOn" />
          </div>

          <div v-if="scheduleForm.upstreamOn" class="flex flex-col gap-3">
            <UFormField label="Server URL">
              <UInput
                v-model="scheduleForm.upstreamUrl"
                placeholder="https://example.com/eink"
                autocapitalize="off"
                autocorrect="off"
                class="w-full"
              />
            </UFormField>
            <UFormField
              label="Access token"
              :hint="store.settings?.has_upstream_token ? 'Set — leave blank to keep' : 'Optional'"
            >
              <UInput
                v-model="scheduleForm.upstreamToken"
                type="password"
                :placeholder="store.settings?.has_upstream_token ? '••••••••' : ''"
                class="w-full"
              />
            </UFormField>
          </div>

          <UButton
            color="primary"
            size="sm"
            block
            :loading="store.busy"
            :disabled="!store.connected"
            @click="saveSchedule"
          >
            Save
          </UButton>
        </div>
      </UCard>

      <!-- Gallery (stored on this phone; the frame's own flash is tiny) -->
      <div class="mt-2 flex items-center justify-between">
        <h2 class="k-eyebrow">Gallery</h2>
        <UButton
          color="primary"
          variant="soft"
          size="xs"
          icon="i-fa6-solid:plus"
          :loading="adding"
          @click="pickPhoto"
        >
          Add photo
        </UButton>
      </div>
      <input
        ref="fileInput"
        type="file"
        accept="image/*"
        class="hidden"
        @change="onPickFile"
      />

      <p class="-mt-2 text-xs text-white/40">
        Photos are kept on your phone. Sending one pushes it to the frame.
      </p>

      <div
        v-if="!photos.length"
        class="flex flex-col items-center gap-2 rounded-[14px] border border-dashed border-default px-5 py-10 text-center"
      >
        <UIcon name="i-fa6-solid:images" class="h-7 w-7 text-white/25" />
        <p class="text-sm text-white/60">No photos yet. Add one to send it to the frame.</p>
      </div>

      <div v-else class="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <UCard
          v-for="photo in photos"
          :key="photo.id"
          class="overflow-hidden bg-white/5"
          :ui="{ body: 'p-0 sm:p-0' }"
        >
          <img :src="photo.thumbUrl" :alt="photo.name" class="aspect-[4/3] w-full object-cover" />
          <div class="flex flex-col gap-1.5 p-2">
            <span class="truncate text-xs text-white/70" :title="photo.name">{{ photo.name }}</span>
            <div class="flex gap-1.5">
              <UButton
                color="primary"
                size="xs"
                block
                :loading="sendingId === photo.id"
                :disabled="store.busy || !store.connected"
                @click="showPhoto(photo)"
              >
                Send
              </UButton>
              <UButton
                color="neutral"
                variant="soft"
                size="xs"
                icon="i-fa6-solid:trash"
                :disabled="sendingId === photo.id"
                @click="removePhoto(photo)"
              />
            </div>
          </div>
        </UCard>
      </div>
    </div>
  </PageLayout>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import PageLayout from '@/layouts/PageLayout.vue'
import { usePageHeader } from '@/composables/usePageHeader'
import { useEinkLocalStore } from '@/stores/einkLocal'
import { EINK_PRESETS, type EinkPreset, type EinkSettingsUpdate } from '@/lib/eink/local/types'
import {
  addPhoto,
  deletePhoto,
  getFullBlob,
  listPhotos,
  type EinkPhotoMeta,
} from '@/lib/eink/gallery'

const route = useRoute()
const router = useRouter()
const { setHeader } = usePageHeader()
const store = useEinkLocalStore()

const routeId = computed(() => route.params.id as string)
// Connection is established by HomeView.openLocalDevice before navigation.
const isActive = computed(() => store.activeDevice?.id === routeId.value)

const presetForm = ref<EinkPreset>(store.preset)
// refresh() seeds store.preset from the device's live /settings; keep the
// picker in sync when that lands.
watch(
  () => store.preset,
  (p) => {
    presetForm.value = p
  },
)

const scheduleForm = reactive({
  sleepMinutes: 60,
  upstreamOn: false,
  upstreamUrl: '',
  upstreamToken: '',
})
watch(
  () => store.settings,
  (s) => {
    if (!s) return
    scheduleForm.sleepMinutes = Math.max(1, Math.round(s.sleep_duration / 60))
    scheduleForm.upstreamOn = s.upstream_on
    scheduleForm.upstreamUrl = s.upstream_url
    scheduleForm.upstreamToken = '' // the device never echoes the token
  },
  { immediate: true, deep: true },
)

async function saveSchedule() {
  const patch: EinkSettingsUpdate = {
    sleep_duration: Math.max(1, Math.round(scheduleForm.sleepMinutes)) * 60,
    upstream_on: scheduleForm.upstreamOn,
    upstream_url: scheduleForm.upstreamUrl.trim(),
  }
  const token = scheduleForm.upstreamToken.trim()
  if (token) patch.upstream_token = token
  await store.updateSettings(patch).catch(() => {})
  scheduleForm.upstreamToken = ''
}

const photos = ref<EinkPhotoMeta[]>([])
const fileInput = ref<HTMLInputElement | null>(null)
const adding = ref(false)
const sendingId = ref<string | null>(null)

function revokeThumbs() {
  for (const p of photos.value) URL.revokeObjectURL(p.thumbUrl)
}

async function loadGallery() {
  if (!isActive.value) return
  revokeThumbs()
  photos.value = await listPhotos(routeId.value).catch(() => [])
}

function pickPhoto() {
  fileInput.value?.click()
}

async function onPickFile(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = '' // allow re-picking the same file
  if (!file) return
  adding.value = true
  try {
    await addPhoto(routeId.value, file, store.panel)
    await loadGallery()
  } finally {
    adding.value = false
  }
}

async function showPhoto(photo: EinkPhotoMeta) {
  const blob = await getFullBlob(photo.id)
  if (!blob) return
  sendingId.value = photo.id
  try {
    await store.showOnFrame(blob, photo.name)
  } catch {
    // store surfaces the error in store.error
  } finally {
    sendingId.value = null
  }
}

async function removePhoto(photo: EinkPhotoMeta) {
  await deletePhoto(photo.id)
  URL.revokeObjectURL(photo.thumbUrl)
  await loadGallery()
}

async function applyPreset() {
  await store.applyPreset(presetForm.value).catch(() => {})
}

async function clearScreen() {
  await store.clearScreen().catch(() => {})
}

async function refresh() {
  if (!isActive.value) return
  await store.refresh().catch(() => {})
  await loadGallery()
}

function syncHeader() {
  const d = store.activeDevice
  setHeader({ title: d?.model || d?.name || 'Frame', backRoute: '/' })
}

onMounted(() => {
  syncHeader()
  void refresh()
})
watch(() => store.activeDevice?.id, syncHeader)
onUnmounted(revokeThumbs)

// The connection is torn down by the router guard when leaving /eink/local/.
</script>
