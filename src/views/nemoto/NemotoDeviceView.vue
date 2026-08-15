<template>
  <PageLayout :on-refresh="refresh">
    <PageState v-if="loading" loading />
    <PageState v-else-if="error" :error="error" @retry="load" />

    <div v-else class="flex flex-1 flex-col">
      <!-- Now showing -->
      <DeviceStage
        eyebrow="Now showing"
        :title="hasFrame ? undefined : 'Board is blank'"
        :meta="stageMeta"
        :lit="hasFrame"
        bloom="rgb(234 223 208 / 0.10)"
        width="min(92vw, 720px)"
      >
        <div class="k-bezel w-full">
          <NemotoFlapGrid
            v-if="state?.display?.valid && state.display.flaps"
            :flaps="state.display.flaps"
          />
          <div v-else class="k-screen empty-screen">
            <UIcon name="i-fa6-solid:table-cells" class="h-6 w-6 text-white/25" />
          </div>
        </div>

        <template #actions>
          <UButton
            color="primary"
            size="sm"
            icon="i-fa6-solid:pencil"
            @click="router.push(`/nemoto/${deviceId}/message`)"
          >
            Compose
          </UButton>
          <UButton
            color="neutral"
            variant="soft"
            size="sm"
            icon="i-fa6-solid:eraser"
            :loading="busy === 'clear'"
            :disabled="!hasFrame"
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
            aria-label="Re-read the board"
            @click="refreshDisplay"
          />
        </template>
      </DeviceStage>

      <section class="flex flex-col gap-4 px-4 py-5">
        <!-- Destinations as a list, not three identical blocks: each one says
             what it is for, so you pick by purpose rather than by icon. -->
        <nav class="destinations">
          <button
            v-for="d in destinations"
            :key="d.to"
            type="button"
            class="destination"
            @click="router.push(d.to)"
          >
            <span class="destination__icon"><UIcon :name="d.icon" class="h-4 w-4" /></span>
            <span class="min-w-0 flex-1">
              <span class="destination__title">{{ d.title }}</span>
              <span class="destination__hint">{{ d.hint }}</span>
            </span>
            <UIcon name="i-fa6-solid:chevron-right" class="h-3 w-3 shrink-0 text-dimmed" />
          </button>
        </nav>
      </section>
    </div>
  </PageLayout>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import PageLayout from '@/layouts/PageLayout.vue'
import NemotoFlapGrid from '@/components/nemoto/NemotoFlapGrid.vue'
import DeviceStage from '@/components/devices/DeviceStage.vue'
import PageState from '@/components/PageState.vue'
import { usePageHeader } from '@/composables/usePageHeader'
import { useCommandToast } from '@/composables/useCommandToast'
import { devicesApi } from '@/lib/api/devices'
import { nemotoApi, type NemotoLiveState } from '@/lib/api/nemoto'
import { getErrorMessage } from '@/lib/api/errors'
import { isNemotoDevice, type NemotoDevice } from '@/lib/api/mappers/deviceMapper'

const route = useRoute()
const router = useRouter()
const { setHeader } = usePageHeader()
const command = useCommandToast()
const deviceId = computed(() => route.params.id as string)

const device = ref<NemotoDevice | null>(null)
const state = ref<NemotoLiveState | null>(null)
const loading = ref(true)
const error = ref<string>()
const busy = ref<'clear' | 'refresh-display' | null>(null)

const hasFrame = computed(() => !!state.value?.display?.valid)

const stageMeta = computed(() => {
  if (!hasFrame.value) return 'Compose a message to put something on it'
  const w = state.value?.display?.width ?? state.value?.setup?.gridWidth
  const h = state.value?.display?.height ?? state.value?.setup?.gridHeight
  return w && h ? `${w} × ${h} flaps` : undefined
})

const destinations = computed(() => [
  {
    to: `/nemoto/${deviceId.value}/presets`,
    icon: 'i-fa6-solid:table-cells',
    title: 'Presets',
    hint: 'Saved boards you can send again',
  },
  {
    to: `/nemoto/${deviceId.value}/schedules`,
    icon: 'i-fa6-solid:calendar',
    title: 'Schedules',
    hint: 'Show a board at a set time',
  },
  {
    to: `/nemoto/${deviceId.value}/inspiration`,
    icon: 'i-fa6-solid:lightbulb',
    title: 'Inspiration',
    hint: 'Ideas worth putting on the wall',
  },
])

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

async function refreshDisplay() {
  busy.value = 'refresh-display'
  try {
    const res = await nemotoApi.refreshDisplayState(deviceId.value)
    if (!res.delivered) {
      command.warn('Device offline — showing last known frame')
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
    command.fail(err, 'Failed to refresh display')
  } finally {
    busy.value = null
  }
}

async function clearDisplay() {
  busy.value = 'clear'
  try {
    const res = await nemotoApi.displayClear(deviceId.value)
    command.delivered(res.delivered, 'Display cleared')
  } catch (err) {
    command.fail(err, 'Failed to clear display')
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
        label: 'Settings',
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
.empty-screen {
  width: 100%;
  aspect-ratio: 22 / 6;
  display: flex;
  align-items: center;
  justify-content: center;
}

.destinations {
  display: flex;
  flex-direction: column;
  border: 1px solid var(--k-line);
  border-radius: 14px;
  background: var(--k-panel);
  box-shadow: var(--k-bezel);
  overflow: hidden;
}

.destination {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  padding: 13px 14px;
  text-align: left;
  border-bottom: 1px solid var(--k-line-soft);
  transition: background 0.15s var(--k-ease);
}
.destination:last-child {
  border-bottom: 0;
}
.destination:active {
  background: rgb(255 255 255 / 0.04);
}

.destination__icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  flex: none;
  border-radius: 9px;
  color: var(--k-ember-hi);
  background: rgb(231 145 20 / 0.12);
  box-shadow: inset 0 0 0 1px rgb(231 145 20 / 0.2);
}

.destination__title {
  display: block;
  font-size: 14px;
  font-weight: 500;
  color: var(--ui-text-highlighted);
}

.destination__hint {
  display: block;
  margin-top: 1px;
  font-size: 12px;
  color: var(--ui-text-muted);
}
</style>
