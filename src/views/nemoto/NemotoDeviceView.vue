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

    <div v-else class="flex flex-1 flex-col">
      <!-- Now showing (hero preview) -->
      <section class="flex flex-col items-center gap-5 border-b border-white/10 px-5 py-8">
        <p class="text-xs uppercase tracking-widest text-white/50">Now showing</p>

        <div class="now-showing-container relative">
          <!-- Edit current display -->
          <UButton
            class="absolute right-2 top-2 z-10"
            color="neutral"
            variant="soft"
            size="sm"
            square
            icon="i-fa6-solid:pencil"
            aria-label="Edit display"
            @click="router.push(`/nemoto/${deviceId}/message`)"
          />
          <div class="now-showing-frame">
            <NemotoFlapGrid
              v-if="state?.display?.valid && state.display.flaps"
              :flaps="state.display.flaps"
            />
            <div v-else class="empty-preview-screen">
              <UIcon name="i-fa6-solid:table-cells" class="h-6 w-6 text-white/30" />
            </div>
          </div>
        </div>
        <p v-if="!state?.display?.valid" class="text-sm text-white/50">Nothing displayed yet.</p>

        <!-- Clear (centered below preview) -->
        <div class="flex items-center justify-center gap-2">
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
            color="neutral"
            variant="ghost"
            size="sm"
            square
            icon="i-fa6-solid:rotate"
            :loading="busy === 'refresh-display'"
            aria-label="Refresh display"
            @click="refreshDisplay"
          />
        </div>
      </section>

      <section class="flex flex-col gap-5 px-5 py-6">
        <!-- Command feedback -->
        <UAlert
          v-if="commandMsg"
          :color="commandMsg.color"
          :icon="commandMsg.icon"
          :title="commandMsg.text"
        />

        <!-- Navigation -->
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
      </section>
    </div>
  </PageLayout>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import PageLayout from '@/layouts/PageLayout.vue'
import NemotoFlapGrid from '@/components/nemoto/NemotoFlapGrid.vue'
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
const busy = ref<'clear' | 'refresh-display' | null>(null)
const commandMsg = ref<{
  text: string
  color: 'success' | 'warning' | 'error'
  icon: string
} | null>(null)

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

async function refreshDisplay() {
  busy.value = 'refresh-display'
  try {
    const res = await nemotoApi.refreshDisplayState(deviceId.value)
    if (!res.delivered) {
      flash(
        'Device offline — showing last known frame',
        'warning',
        'i-fa6-solid:triangle-exclamation',
      )
      return
    }
    // The device debounces its report ~1s and the round-trip adds more; poll
    // until the live-state timestamp moves (bounded).
    const before = state.value?.at
    for (let attempt = 0; attempt < 3; attempt++) {
      await new Promise((r) => window.setTimeout(r, 1500))
      const next = await nemotoApi.getState(deviceId.value)
      state.value = next
      if (next.at && next.at !== before) break
    }
  } catch (err) {
    flash(
      getErrorMessage(err, 'Failed to refresh display'),
      'error',
      'i-fa6-solid:circle-exclamation',
    )
  } finally {
    busy.value = null
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

<style scoped>
.now-showing-container {
  width: min(92vw, 560px);
  max-width: 100%;
}

.now-showing-frame {
  width: 100%;
  padding: 10px;
  background: #18181b;
  border-radius: 0.75rem;
}

.empty-preview-screen {
  width: 100%;
  aspect-ratio: 22 / 6;
  background: black;
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
}
</style>
