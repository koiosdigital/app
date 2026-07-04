<template>
  <PageLayout :on-refresh="refresh">
    <div v-if="loading" class="flex flex-1 items-center justify-center py-20">
      <UIcon name="i-fa6-solid:spinner" class="h-8 w-8 animate-spin text-white/50" />
    </div>

    <div v-else-if="error" class="flex flex-1 items-center justify-center p-5">
      <UCard class="w-full max-w-md border border-red-500/20 bg-red-500/10">
        <div class="space-y-4 text-center">
          <UIcon name="i-fa6-solid:circle-exclamation" class="mx-auto h-12 w-12 text-red-400" />
          <p class="text-red-400">{{ error }}</p>
          <UButton color="neutral" variant="soft" @click="load">Retry</UButton>
        </div>
      </UCard>
    </div>

    <div v-else class="flex flex-col gap-5 px-5 py-6">
      <!-- Quick navigation -->
      <div class="grid grid-cols-2 gap-3">
        <UButton
          color="neutral"
          variant="soft"
          size="lg"
          icon="i-fa6-solid:table-cells"
          block
          @click="router.push(`/nemoto/${deviceId}/presets`)"
        >
          Presets
        </UButton>
        <UButton
          color="neutral"
          variant="soft"
          size="lg"
          icon="i-fa6-solid:calendar"
          block
          @click="router.push(`/nemoto/${deviceId}/schedules`)"
        >
          Schedules
        </UButton>
      </div>

      <!-- Command feedback -->
      <UAlert
        v-if="commandMsg"
        :color="commandMsg.color"
        :icon="commandMsg.icon"
        :title="commandMsg.text"
      />

      <!-- Live status -->
      <UCard class="bg-white/5">
        <template #header>
          <div class="flex items-center justify-between">
            <h3 class="font-semibold">Status</h3>
            <UBadge :color="device?.online ? 'success' : 'neutral'" variant="soft">
              {{ device?.online ? 'Online' : 'Offline' }}
            </UBadge>
          </div>
        </template>

        <div v-if="state?.setup" class="mb-4 flex items-center gap-2 text-sm">
          <UIcon name="i-fa6-solid:circle-nodes" class="h-4 w-4 text-white/50" />
          <span class="text-white/70">Setup phase</span>
          <UBadge color="primary" variant="soft">{{ formatPhase(state.setup.phase) }}</UBadge>
        </div>

        <dl v-if="state?.system" class="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
          <div>
            <dt class="text-white/50">Firmware</dt>
            <dd>{{ state.system.firmwareVersion }}</dd>
          </div>
          <div>
            <dt class="text-white/50">Variant</dt>
            <dd>{{ state.system.hwVariant }}</dd>
          </div>
          <div>
            <dt class="text-white/50">IP</dt>
            <dd>{{ state.system.ip }}</dd>
          </div>
          <div>
            <dt class="text-white/50">Wi-Fi</dt>
            <dd>{{ state.system.wifiSsid }} ({{ state.system.wifiRssi }} dBm)</dd>
          </div>
          <div>
            <dt class="text-white/50">Uptime</dt>
            <dd>{{ formatUptime(state.system.uptimeS) }}</dd>
          </div>
          <div>
            <dt class="text-white/50">Free heap</dt>
            <dd>{{ formatBytes(state.system.freeHeap) }}</dd>
          </div>
        </dl>

        <p v-else class="text-sm text-white/50">No live telemetry reported yet.</p>
      </UCard>

      <!-- Fleet health -->
      <UCard v-if="state?.fleet" class="bg-white/5">
        <template #header>
          <div class="flex items-center justify-between">
            <h3 class="font-semibold">Modules</h3>
            <UBadge :color="state.fleet.inError > 0 ? 'error' : 'success'" variant="soft">
              {{ state.fleet.inError > 0 ? `${state.fleet.inError} faulted` : 'Healthy' }}
            </UBadge>
          </div>
        </template>

        <div class="grid grid-cols-3 gap-3 text-center">
          <div>
            <p class="text-2xl font-semibold">{{ state.fleet.alive }}/{{ state.fleet.total }}</p>
            <p class="text-xs text-white/50">Alive</p>
          </div>
          <div>
            <p class="text-2xl font-semibold">{{ state.fleet.homed }}</p>
            <p class="text-xs text-white/50">Homed</p>
          </div>
          <div>
            <p class="text-2xl font-semibold">{{ state.fleet.gridMapped }}</p>
            <p class="text-xs text-white/50">Mapped</p>
          </div>
        </div>

        <div v-if="state.fleet.faults.length" class="mt-4 space-y-2 border-t border-white/10 pt-4">
          <div
            v-for="fault in state.fleet.faults"
            :key="fault.uuid"
            class="flex items-center justify-between rounded-md bg-red-500/10 px-3 py-2 text-sm"
          >
            <span class="font-mono text-white/70">#{{ fault.shortId || '—' }}</span>
            <UBadge color="error" variant="soft">{{ formatPhase(fault.kind) }}</UBadge>
          </div>
        </div>
      </UCard>

      <!-- Commands -->
      <UCard class="bg-white/5">
        <template #header><h3 class="font-semibold">Display</h3></template>
        <div class="flex flex-wrap gap-3">
          <UButton
            color="neutral"
            variant="soft"
            icon="i-fa6-solid:eraser"
            :loading="busy === 'clear'"
            @click="clearDisplay"
          >
            Clear
          </UButton>
          <UButton
            v-if="isOwner"
            color="warning"
            variant="soft"
            icon="i-fa6-solid:power-off"
            :loading="busy === 'reboot'"
            @click="reboot"
          >
            Reboot
          </UButton>
        </div>
      </UCard>
    </div>
  </PageLayout>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import PageLayout from '@/layouts/PageLayout.vue'
import { usePageHeader } from '@/composables/usePageHeader'
import { devicesApi } from '@/lib/api/devices'
import { nemotoApi, type NemotoLiveState } from '@/lib/api/nemoto'
import { getErrorMessage } from '@/lib/api/errors'
import { isNemotoDevice, type NemotoDevice } from '@/lib/api/mappers/deviceMapper'

const route = useRoute()
const router = useRouter()
const { setHeader } = usePageHeader()
const deviceId = computed(() => route.params.id as string)

const device = ref<NemotoDevice | null>(null)
const state = ref<NemotoLiveState | null>(null)
const loading = ref(true)
const error = ref<string>()
const busy = ref<'clear' | 'reboot' | null>(null)
const commandMsg = ref<{
  text: string
  color: 'success' | 'warning' | 'error'
  icon: string
} | null>(null)

const isOwner = computed(() => device.value?.accessLevel === 'OWNER')

async function load() {
  loading.value = true
  error.value = undefined
  try {
    const d = await devicesApi.getDevice(deviceId.value)
    if (!d || !isNemotoDevice(d)) {
      error.value = 'This is not a Nemoto device'
      return
    }
    device.value = d
    state.value = await nemotoApi.getState(deviceId.value)
  } catch (err) {
    error.value = getErrorMessage(err, 'Failed to load device')
  } finally {
    loading.value = false
  }
}

async function refresh() {
  try {
    state.value = await nemotoApi.getState(deviceId.value)
  } catch (err) {
    console.error('Failed to refresh state', err)
  }
}

function flash(text: string, color: 'success' | 'warning' | 'error', icon: string) {
  commandMsg.value = { text, color, icon }
  window.setTimeout(() => (commandMsg.value = null), 4000)
}

function flashDelivered(delivered: boolean, successText: string) {
  if (delivered) {
    flash(successText, 'success', 'i-fa6-solid:circle-check')
  } else {
    flash('Device offline — command not delivered', 'warning', 'i-fa6-solid:triangle-exclamation')
  }
}

async function clearDisplay() {
  busy.value = 'clear'
  try {
    const res = await nemotoApi.displayClear(deviceId.value)
    flashDelivered(res.delivered, 'Display cleared')
  } catch (err) {
    flash(
      getErrorMessage(err, 'Failed to clear display'),
      'error',
      'i-fa6-solid:circle-exclamation',
    )
  } finally {
    busy.value = null
  }
}

async function reboot() {
  busy.value = 'reboot'
  try {
    const res = await nemotoApi.reboot(deviceId.value)
    flashDelivered(res.delivered, 'Reboot requested')
  } catch (err) {
    flash(getErrorMessage(err, 'Failed to reboot'), 'error', 'i-fa6-solid:circle-exclamation')
  } finally {
    busy.value = null
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

function syncHeader() {
  setHeader({
    title: device.value?.settings?.displayName || device.value?.id || 'Nemoto',
    backRoute: '/',
    actions: [
      {
        icon: 'i-fa6-solid:gear',
        onClick: () => router.push(`/nemoto/${deviceId.value}/settings`),
      },
    ],
  })
}

watch(() => device.value?.settings?.displayName, syncHeader)

onMounted(() => {
  syncHeader()
  load()
})
</script>
