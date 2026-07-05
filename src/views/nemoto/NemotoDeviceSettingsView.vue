<template>
  <PageLayout>
    <DangerConfirmModal
      v-model="showDelete"
      title="Delete Device"
      message="Remove this device from your account? This cannot be undone."
      confirm-text="Delete Device"
      :loading="deleting"
      :error="deleteError"
      @confirm="deleteDevice"
    />

    <div v-if="loading" class="flex flex-1 items-center justify-center py-20">
      <UIcon name="i-fa6-solid:spinner" class="h-8 w-8 animate-spin text-white/50" />
    </div>

    <div v-else class="flex flex-col gap-6 px-5 py-6 pb-28">
      <UAlert v-if="error" color="error" icon="i-fa6-solid:circle-exclamation" :title="error" />

      <!-- General -->
      <UCard class="bg-white/5">
        <template #header><h3 class="font-semibold">General</h3></template>
        <div class="space-y-4">
          <UFormField label="Device name">
            <UInput v-model="form.deviceName" size="lg" :maxlength="100" />
          </UFormField>
          <UFormField label="Boot preset">
            <USelectMenu
              v-model="form.bootPresetId"
              :items="presetItems"
              value-key="value"
              :search-input="false"
              class="w-full"
            />
          </UFormField>
          <UFormField label="Flap cycle">
            <USelect v-model="form.cycleType" :items="cycleTypes" class="w-full" />
          </UFormField>
        </div>
      </UCard>

      <!-- Motion -->
      <UCard class="bg-white/5">
        <template #header><h3 class="font-semibold">Motion &amp; display</h3></template>
        <div class="grid grid-cols-2 gap-4">
          <UFormField label="Default speed (flaps/s)"
            ><UInputNumber v-model="form.defaultSpeed" :min="0"
          /></UFormField>
          <UFormField label="Default accel (steps/s²)"
            ><UInputNumber v-model="form.defaultAccel" :min="0"
          /></UFormField>
          <UFormField label="Auto-discover (s)"
            ><UInputNumber v-model="form.autoDiscoverSec" :min="0"
          /></UFormField>
          <UFormField label="Step delay (ms)"
            ><UInputNumber v-model="form.displayDelayMs" :min="0"
          /></UFormField>
          <UFormField label="Display effect" class="col-span-2">
            <USelectMenu
              v-model="form.displayEffectId"
              :items="effectItems"
              value-key="value"
              :search-input="false"
              placeholder="Device default"
              class="w-full"
            />
          </UFormField>
        </div>
      </UCard>

      <!-- Quiet hours -->
      <UCard class="bg-white/5">
        <template #header>
          <div class="flex items-center justify-between">
            <h3 class="font-semibold">Quiet hours</h3>
            <UButton
              size="xs"
              color="neutral"
              variant="soft"
              icon="i-fa6-solid:plus"
              :disabled="form.quietWindows.length >= 7"
              @click="addWindow"
            >
              Add
            </UButton>
          </div>
        </template>

        <p v-if="!form.quietWindows.length" class="text-sm text-white/50">
          No quiet hours configured.
        </p>

        <div
          v-for="(w, i) in form.quietWindows"
          :key="i"
          class="space-y-3 border-t border-white/10 py-4 first:border-t-0 first:pt-0"
        >
          <div class="flex items-center justify-between">
            <div class="flex flex-wrap gap-1">
              <button
                v-for="(label, bit) in dayLabels"
                :key="bit"
                type="button"
                class="h-7 w-7 rounded-full text-xs font-semibold transition-colors"
                :class="isDay(w, bit) ? 'bg-primary-500 text-white' : 'bg-white/10 text-white/60'"
                :aria-label="dayFull[bit]"
                @click="toggleDay(w, bit)"
              >
                {{ label }}
              </button>
            </div>
            <UButton
              color="error"
              variant="ghost"
              size="xs"
              square
              icon="i-fa6-solid:trash"
              @click="form.quietWindows.splice(i, 1)"
            />
          </div>

          <div class="flex items-center gap-2 text-sm">
            <UInput
              type="time"
              :model-value="fmtTime(w.startHour, w.startMin)"
              class="w-28"
              aria-label="Start"
              @update:model-value="setStart(w, String($event))"
            />
            <span class="text-white/50">→</span>
            <UInput
              type="time"
              :model-value="fmtTime(w.endHour, w.endMin)"
              class="w-28"
              aria-label="End"
              @update:model-value="setEnd(w, String($event))"
            />
            <div class="flex-1" />
            <USwitch v-model="w.enabled" />
          </div>
        </div>
      </UCard>

      <!-- Device info (live telemetry + status) -->
      <UCard class="bg-white/5">
        <template #header>
          <div class="flex items-center justify-between">
            <h3 class="font-semibold">Device info</h3>
            <UBadge :color="deviceOnline ? 'success' : 'neutral'" variant="soft">
              {{ deviceOnline ? 'Online' : 'Offline' }}
            </UBadge>
          </div>
        </template>

        <dl class="space-y-2 text-sm">
          <div class="flex items-center justify-between gap-3">
            <dt class="text-white/50">Device ID</dt>
            <dd class="truncate font-mono text-xs text-white/70">{{ deviceId }}</dd>
          </div>
          <div v-if="state?.setup" class="flex items-center justify-between gap-3">
            <dt class="text-white/50">Setup phase</dt>
            <dd>
              <UBadge color="primary" variant="soft">{{ formatPhase(state.setup.phase) }}</UBadge>
            </dd>
          </div>
          <template v-if="state?.system">
            <div class="flex items-center justify-between gap-3">
              <dt class="text-white/50">Firmware</dt>
              <dd class="text-white/70">{{ state.system.firmwareVersion }}</dd>
            </div>
            <div class="flex items-center justify-between gap-3">
              <dt class="text-white/50">Variant</dt>
              <dd class="text-white/70">{{ state.system.hwVariant }}</dd>
            </div>
            <div class="flex items-center justify-between gap-3">
              <dt class="text-white/50">IP address</dt>
              <dd class="font-mono text-xs text-white/70">{{ state.system.ip }}</dd>
            </div>
            <div class="flex items-center justify-between gap-3">
              <dt class="text-white/50">Wi-Fi</dt>
              <dd class="text-white/70">
                {{ state.system.wifiSsid }} ({{ state.system.wifiRssi }} dBm)
              </dd>
            </div>
            <div class="flex items-center justify-between gap-3">
              <dt class="text-white/50">Uptime</dt>
              <dd class="text-white/70">{{ formatUptime(state.system.uptimeS) }}</dd>
            </div>
            <div class="flex items-center justify-between gap-3">
              <dt class="text-white/50">Free heap</dt>
              <dd class="text-white/70">{{ formatBytes(state.system.freeHeap) }}</dd>
            </div>
          </template>
          <p v-else class="text-white/50">No live telemetry reported yet.</p>
        </dl>
      </UCard>

      <UButton
        color="error"
        variant="soft"
        icon="i-fa6-solid:trash"
        block
        @click="showDelete = true"
      >
        Delete Device
      </UButton>
    </div>

    <Teleport to="#app-footer">
      <footer class="border-t border-white/10 bg-zinc-950/95 px-6 py-4 backdrop-blur">
        <UAlert
          v-if="saveError"
          class="mb-3"
          color="error"
          icon="i-fa6-solid:circle-exclamation"
          :title="saveError"
        />
        <UButton color="primary" size="lg" block :loading="saving" :disabled="saving" @click="save">
          Save Changes
        </UButton>
      </footer>
    </Teleport>
  </PageLayout>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import PageLayout from '@/layouts/PageLayout.vue'
import DangerConfirmModal from '@/components/DangerConfirmModal.vue'
import { usePageHeader } from '@/composables/usePageHeader'
import { devicesApi } from '@/lib/api/devices'
import { nemotoApi, type NemotoQuietWindow, type NemotoLiveState } from '@/lib/api/nemoto'
import { NEMOTO_EFFECT_ITEMS } from '@/lib/nemoto/effects'
import { isNemotoDevice } from '@/lib/api/mappers/deviceMapper'
import { getErrorMessage } from '@/lib/api/errors'

const route = useRoute()
const router = useRouter()
const { setHeader } = usePageHeader()
const deviceId = computed(() => route.params.id as string)

const dayLabels = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']
const dayFull = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const cycleTypes: Array<'PARTIAL' | 'FULL'> = ['PARTIAL', 'FULL']
const effectItems = NEMOTO_EFFECT_ITEMS

const loading = ref(true)
const error = ref<string>()
const saving = ref(false)
const saveError = ref<string>()

// Live telemetry for the read-only Device info section.
const state = ref<NemotoLiveState | null>(null)
const deviceOnline = ref(false)

const presetItems = ref<Array<{ label: string; value: number }>>([{ label: 'None', value: 0 }])

const form = reactive({
  deviceName: '',
  bootPresetId: 0,
  defaultSpeed: 0,
  defaultAccel: 0,
  autoDiscoverSec: 0,
  displayEffectId: '',
  displayDelayMs: 0,
  cycleType: 'PARTIAL' as 'PARTIAL' | 'FULL',
  quietWindows: [] as NemotoQuietWindow[],
})

const showDelete = ref(false)
const deleting = ref(false)
const deleteError = ref<string>()

function isDay(w: NemotoQuietWindow, bit: number): boolean {
  return (w.dayMask & (1 << bit)) !== 0
}
function toggleDay(w: NemotoQuietWindow, bit: number) {
  w.dayMask ^= 1 << bit
}

function fmtTime(hour: number, min: number): string {
  return `${String(hour).padStart(2, '0')}:${String(min).padStart(2, '0')}`
}
function parseTime(v: string): { hour: number; min: number } | null {
  const [h, m] = v.split(':').map(Number)
  if (!Number.isInteger(h) || !Number.isInteger(m)) return null
  return { hour: h, min: m }
}
function setStart(w: NemotoQuietWindow, v: string) {
  const t = parseTime(v)
  if (t) {
    w.startHour = t.hour
    w.startMin = t.min
  }
}
function setEnd(w: NemotoQuietWindow, v: string) {
  const t = parseTime(v)
  if (t) {
    w.endHour = t.hour
    w.endMin = t.min
  }
}

function addWindow() {
  form.quietWindows.push({
    dayMask: 0b0111110, // Mon-Fri, same default as the on-device UI
    startHour: 22,
    startMin: 0,
    endHour: 7,
    endMin: 0,
    enabled: true,
  })
}

async function load() {
  loading.value = true
  error.value = undefined
  try {
    const [config, presets, device, live] = await Promise.all([
      nemotoApi.getConfig(deviceId.value),
      nemotoApi.listPresets(deviceId.value),
      // Device + live state power the read-only Device info section. They're
      // best-effort — a failure here shouldn't block editing config.
      devicesApi.getDevice(deviceId.value).catch(() => null),
      nemotoApi.getState(deviceId.value).catch(() => null),
    ])
    if (device && isNemotoDevice(device)) deviceOnline.value = device.online
    state.value = live
    Object.assign(form, {
      deviceName: config.deviceName,
      bootPresetId: config.bootPresetId,
      defaultSpeed: config.defaultSpeed,
      defaultAccel: config.defaultAccel,
      autoDiscoverSec: config.autoDiscoverSec,
      displayEffectId: config.displayEffectId,
      displayDelayMs: config.displayDelayMs,
      cycleType: config.cycleType,
      quietWindows: config.quietWindows.map((w) => ({ ...w })),
    })
    presetItems.value = [
      { label: 'None', value: 0 },
      ...presets.map((p) => ({ label: p.name, value: p.presetId })),
    ]
  } catch (err) {
    error.value = getErrorMessage(err, 'Failed to load settings')
  } finally {
    loading.value = false
  }
}

function formatPhase(raw: string): string {
  return raw
    .replace(/^NEMOTO_[A-Z]+_(KIND_|PHASE_)?/, '')
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase())
}

function formatUptime(seconds: number): string {
  const d = Math.floor(seconds / 86400)
  const h = Math.floor((seconds % 86400) / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  if (d) return `${d}d ${h}h`
  if (h) return `${h}h ${m}m`
  return `${m}m`
}

function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`
  return `${bytes} B`
}

async function save() {
  saving.value = true
  saveError.value = undefined
  try {
    await nemotoApi.updateConfig(deviceId.value, {
      deviceName: form.deviceName,
      bootPresetId: form.bootPresetId,
      defaultSpeed: form.defaultSpeed,
      defaultAccel: form.defaultAccel,
      autoDiscoverSec: form.autoDiscoverSec,
      displayEffectId: form.displayEffectId,
      displayDelayMs: form.displayDelayMs,
      cycleType: form.cycleType,
      quietWindows: form.quietWindows,
    })
    setHeader({ title: form.deviceName || 'Settings', backRoute: `/nemoto/${deviceId.value}` })
  } catch (err) {
    saveError.value = getErrorMessage(err, 'Failed to save settings')
  } finally {
    saving.value = false
  }
}

async function deleteDevice() {
  deleting.value = true
  deleteError.value = undefined
  try {
    await devicesApi.deleteDevice(deviceId.value)
    router.replace('/')
  } catch (err) {
    deleteError.value = getErrorMessage(err, 'Failed to delete device')
  } finally {
    deleting.value = false
  }
}

onMounted(() => {
  setHeader({ title: 'Settings', backRoute: `/nemoto/${deviceId.value}` })
  load()
})
</script>
