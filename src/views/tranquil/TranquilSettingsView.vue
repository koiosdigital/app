<template>
  <PageLayout>
    <DangerConfirmModal
      v-model="showFactoryReset"
      title="Factory reset"
      message="Erase all patterns, playlists, and settings on this table and restore defaults? This cannot be undone."
      confirm-text="Factory reset"
      :loading="resetting"
      :error="resetError ?? undefined"
      @confirm="factoryReset"
    />

    <div v-if="!isActive" class="flex flex-col items-center gap-4 px-5 py-16 text-center">
      <UIcon name="i-fa6-solid:wifi" class="h-8 w-8 text-white/30" />
      <p class="text-white/70">This table isn't connected. Open it from your device list.</p>
      <UButton color="primary" variant="soft" @click="router.replace('/')">Go to devices</UButton>
    </div>

    <div v-else-if="loading" class="flex flex-1 items-center justify-center py-20">
      <UIcon name="i-fa6-solid:spinner" class="h-8 w-8 animate-spin text-white/50" />
    </div>

    <div v-else class="flex flex-col gap-6 px-5 py-6 pb-28">
      <UAlert v-if="error" color="error" icon="i-fa6-solid:circle-exclamation" :title="error" />
      <UAlert v-if="actionMsg" color="success" icon="i-fa6-solid:circle-check" :title="actionMsg" />

      <!-- Emergency stop — halt the table's motion immediately. -->
      <UButton
        color="error"
        size="xl"
        block
        icon="i-fa6-solid:hand"
        :loading="stopping"
        @click="emergencyStop"
      >
        Emergency stop
      </UButton>

      <!-- Network -->
      <UCard class="bg-white/5">
        <template #header><h3 class="font-semibold">Network</h3></template>
        <UFormField label="Hostname" help="Reachable on your network as <hostname>.local">
          <UInput v-model="form.wifi_hostname" size="lg" :maxlength="63" class="w-full" />
        </UFormField>
      </UCard>

      <!-- Time -->
      <UCard class="bg-white/5">
        <template #header><h3 class="font-semibold">Time</h3></template>
        <div class="space-y-4">
          <UFormField>
            <div class="flex items-center justify-between">
              <span class="text-sm">Set timezone automatically</span>
              <USwitch v-model="form.auto_timezone" />
            </div>
          </UFormField>
          <UFormField v-if="!form.auto_timezone" label="Timezone">
            <USelectMenu
              v-model="form.timezone"
              :items="timezoneNames"
              class="w-full"
              :search-input="{ placeholder: 'Search timezones…' }"
            />
          </UFormField>
          <UFormField label="NTP server">
            <UInput v-model="form.ntp_server" size="lg" class="w-full" />
          </UFormField>
        </div>
      </UCard>

      <!-- Calibration -->
      <UCard class="bg-white/5">
        <template #header
          ><div class="flex justify-between">
            <h3 class="font-semibold">Calibration</h3>
            <UBadge :color="info?.is_homed ? 'success' : 'warning'" variant="soft">
              {{ info?.is_homed ? 'Homed' : 'Not homed' }}
            </UBadge>
          </div>
        </template>
        <div class="flex flex-col gap-4">
          <div class="flex gap-3">
            <UButton
              color="primary"
              variant="soft"
              icon="i-fa6-solid:house"
              :loading="homing"
              @click="home"
            >
              Home table
            </UButton>
            <UButton color="neutral" variant="soft" icon="i-fa6-solid:eraser" @click="clearCal">
              Clear calibration
            </UButton>
          </div>
        </div>
      </UCard>

      <!-- Device info (read-only) -->
      <UCard class="bg-white/5">
        <template #header><h3 class="font-semibold">Device info</h3></template>
        <dl class="grid grid-cols-2 gap-y-2 text-sm">
          <dt class="text-white/50">Model</dt>
          <dd class="text-right">{{ about?.model ?? info?.hardware_model ?? '—' }}</dd>
          <dt class="text-white/50">Firmware</dt>
          <dd class="text-right">{{ about?.version ?? info?.firmware_version ?? '—' }}</dd>
          <dt class="text-white/50">Device ID</dt>
          <dd class="truncate text-right font-mono text-xs">{{ info?.device_id ?? '—' }}</dd>
          <dt class="text-white/50">Free memory</dt>
          <dd class="text-right">{{ freeHeapKb }}</dd>
        </dl>
      </UCard>

      <!-- Danger -->
      <UCard class="border-red-500/20 bg-red-500/5">
        <template #header><h3 class="font-semibold text-red-400">Danger zone</h3></template>
        <UButton
          color="error"
          variant="soft"
          icon="i-fa6-solid:triangle-exclamation"
          @click="showFactoryReset = true"
        >
          Factory reset
        </UButton>
      </UCard>
    </div>

    <Teleport v-if="isActive && !loading" to="#app-footer">
      <div class="border-t border-white/10 bg-black/80 p-3 backdrop-blur">
        <UButton color="primary" block size="lg" :loading="saving" @click="save"
          >Save changes</UButton
        >
      </div>
    </Teleport>
  </PageLayout>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import PageLayout from '@/layouts/PageLayout.vue'
import DangerConfirmModal from '@/components/DangerConfirmModal.vue'
import { usePageHeader } from '@/composables/usePageHeader'
import { useTranquilLocalStore } from '@/stores/tranquilLocal'
import { formatTranquilError } from '@/lib/tranquil/local/errors'
import type { AboutResponse, SystemConfig, SystemInfo } from '@/lib/tranquil/local/types'

const route = useRoute()
const router = useRouter()
const { setHeader } = usePageHeader()
const store = useTranquilLocalStore()

const routeId = computed(() => route.params.id as string)
const isActive = computed(() => store.activeDevice?.id === routeId.value)

const loading = ref(true)
const saving = ref(false)
const homing = ref(false)
const stopping = ref(false)
const resetting = ref(false)
const error = ref<string | null>(null)
const resetError = ref<string | null>(null)
const actionMsg = ref<string | null>(null)
const showFactoryReset = ref(false)

const info = ref<SystemInfo | null>(null)
const about = ref<AboutResponse | null>(null)
const timezoneNames = ref<string[]>([])

const form = reactive<SystemConfig>({
  auto_timezone: true,
  timezone: '',
  ntp_server: '',
  wifi_hostname: '',
})

const freeHeapKb = computed(() =>
  info.value ? `${Math.round(info.value.free_heap / 1024).toLocaleString()} KB` : '—',
)

async function load() {
  if (!isActive.value) {
    loading.value = false
    return
  }
  loading.value = true
  error.value = null
  try {
    const api = store.api()
    const [config, sysInfo, aboutRes] = await Promise.all([
      api.system.getConfig(),
      api.system.getInfo().catch(() => null),
      api.system.getAbout().catch(() => null),
    ])
    Object.assign(form, config)
    info.value = sysInfo
    about.value = aboutRes
    // Timezone list is only needed for the manual picker; best-effort.
    api.system
      .getTimezones()
      .then((tzs) => (timezoneNames.value = tzs.map((t) => t.name)))
      .catch(() => {})
  } catch (e) {
    error.value = formatTranquilError(e)
  } finally {
    loading.value = false
  }
}

async function save() {
  saving.value = true
  error.value = null
  actionMsg.value = null
  try {
    await store.api().system.setConfig({
      wifi_hostname: form.wifi_hostname,
      auto_timezone: form.auto_timezone,
      timezone: form.timezone,
      ntp_server: form.ntp_server,
    })
    actionMsg.value = 'Settings saved.'
  } catch (e) {
    error.value = formatTranquilError(e)
  } finally {
    saving.value = false
  }
}

async function emergencyStop() {
  stopping.value = true
  error.value = null
  try {
    await store.stop(true)
    actionMsg.value = 'Table stopped.'
  } catch (e) {
    error.value = formatTranquilError(e)
  } finally {
    stopping.value = false
  }
}

async function home() {
  homing.value = true
  error.value = null
  try {
    await store.api().system.home(false)
    const sysInfo = await store
      .api()
      .system.getInfo()
      .catch(() => null)
    if (sysInfo) info.value = sysInfo
    actionMsg.value = 'Homing started.'
  } catch (e) {
    error.value = formatTranquilError(e)
  } finally {
    homing.value = false
  }
}

async function clearCal() {
  error.value = null
  try {
    await store.api().deviceConfig.clearCalibration()
    actionMsg.value = 'Calibration cleared. Re-home the table.'
  } catch (e) {
    error.value = formatTranquilError(e)
  }
}

async function factoryReset() {
  resetting.value = true
  resetError.value = null
  try {
    await store.api().system.factoryReset()
    showFactoryReset.value = false
    router.replace('/')
  } catch (e) {
    resetError.value = formatTranquilError(e)
  } finally {
    resetting.value = false
  }
}

onMounted(() => {
  setHeader({
    title: 'Table settings',
    backRoute: `/tranquil/local/${encodeURIComponent(routeId.value)}`,
  })
  void load()
})
</script>
