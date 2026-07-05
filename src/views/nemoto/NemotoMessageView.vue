<template>
  <PageLayout>
    <div v-if="loading" class="flex flex-1 items-center justify-center py-20">
      <UIcon name="i-fa6-solid:spinner" class="h-8 w-8 animate-spin text-white/50" />
    </div>

    <div v-else class="flex flex-col gap-5 px-5 py-6 pb-28">
      <UAlert v-if="error" color="error" icon="i-fa6-solid:circle-exclamation" :title="error" />
      <UAlert v-if="sentMsg" :color="sentMsg.color" :icon="sentMsg.icon" :title="sentMsg.text" />

      <!-- Message text — laid out onto the grid as you type -->
      <UFormField label="Message" help="Typed text is laid out onto the board; tweak cells below.">
        <UInput
          v-model="text"
          placeholder="BACK IN 5 MINUTES"
          size="lg"
          @update:model-value="layoutText"
        />
      </UFormField>

      <!-- Board editor (type / paint / erase, same as the on-device UI) -->
      <NemotoGridEditor v-model="grid" />

      <!-- Transition effect override for this push -->
      <UCard class="bg-white/5">
        <template #header>
          <div class="flex items-center justify-between">
            <h3 class="text-sm font-semibold text-white/70">Transition effect</h3>
            <USwitch v-model="overrideEnabled" />
          </div>
        </template>
        <p v-if="!overrideEnabled" class="text-sm text-white/50">
          Uses the device's default effect. Turn on to override for this push.
        </p>
        <div v-else class="flex flex-col gap-4">
          <UFormField label="Effect">
            <USelectMenu
              v-model="overrideEffect"
              :items="effectItems"
              value-key="value"
              :search-input="false"
              class="w-full"
            />
          </UFormField>
          <UFormField label="Step delay (ms, 0 = device default)">
            <UInputNumber v-model="overrideDelay" :min="0" :max="500" />
          </UFormField>
        </div>
      </UCard>

      <USwitch v-model="forceQuiet" label="Bypass quiet hours" />
    </div>

    <Teleport to="#app-footer">
      <footer class="border-t border-white/10 bg-zinc-950/95 px-6 py-4 backdrop-blur">
        <UButton
          color="primary"
          size="lg"
          block
          icon="i-fa6-solid:paper-plane"
          :loading="sending"
          :disabled="sending"
          @click="send"
        >
          Display Now
        </UButton>
      </footer>
    </Teleport>
  </PageLayout>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import PageLayout from '@/layouts/PageLayout.vue'
import NemotoGridEditor from '@/components/nemoto/NemotoGridEditor.vue'
import { usePageHeader } from '@/composables/usePageHeader'
import { useNemotoFlaps } from '@/composables/useNemotoFlaps'
import { NEMOTO_EFFECT_ITEMS } from '@/lib/nemoto/effects'
import { nemotoApi } from '@/lib/api/nemoto'
import { getErrorMessage } from '@/lib/api/errors'

const props = defineProps<{ deviceId: string }>()

const { setHeader } = usePageHeader()
const { byGlyph, blankId, ensureLoaded } = useNemotoFlaps()

const text = ref('')
// Sized from the device's reported grid on mount; the frame must match the
// device's dimensions or the firmware rejects it.
const width = ref(22)
const height = ref(6)
const grid = ref<number[][]>([])
const forceQuiet = ref(false)

const effectItems = NEMOTO_EFFECT_ITEMS
const overrideEnabled = ref(false)
const overrideEffect = ref('none')
const overrideDelay = ref(0)

const loading = ref(true)
const sending = ref(false)
const error = ref<string>()
const sentMsg = ref<{ text: string; color: 'success' | 'warning'; icon: string } | null>(null)

function blankGrid(w: number, h: number): number[][] {
  const bl = blankId.value
  return Array.from({ length: h }, () => Array.from({ length: w }, () => bl))
}

// Word-wrap the message onto the board, centered horizontally and vertically.
// Unknown characters map to blank; overflow is dropped.
function layoutText() {
  const words = text.value.toUpperCase().split(/\s+/).filter(Boolean)
  const lines: string[] = []
  let line = ''
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word
    if (candidate.length <= width.value) {
      line = candidate
    } else if (line) {
      lines.push(line)
      line = word.slice(0, width.value)
    } else {
      lines.push(word.slice(0, width.value))
    }
  }
  if (line) lines.push(line)

  const next = blankGrid(width.value, height.value)
  const rowOffset = Math.max(0, Math.floor((height.value - lines.length) / 2))
  for (let i = 0; i < lines.length && rowOffset + i < height.value; i++) {
    const chars = lines[i]
    const colOffset = Math.max(0, Math.floor((width.value - chars.length) / 2))
    for (let j = 0; j < chars.length && colOffset + j < width.value; j++) {
      next[rowOffset + i][colOffset + j] = byGlyph.value.get(chars[j]) ?? blankId.value
    }
  }
  grid.value = next
}

function framesMatch(a: number[][], b: number[][]): boolean {
  if (a.length !== b.length) return false
  return a.every((row, y) => row.length === b[y].length && row.every((v, x) => v === b[y][x]))
}

async function send() {
  sending.value = true
  error.value = undefined
  sentMsg.value = null
  try {
    const res = await nemotoApi.displayFrame(props.deviceId, {
      flaps: grid.value,
      effectId: overrideEnabled.value ? overrideEffect.value : undefined,
      delayMs: overrideEnabled.value && overrideDelay.value > 0 ? overrideDelay.value : undefined,
      forceQuiet: forceQuiet.value,
    })
    if (!res.delivered) {
      sentMsg.value = {
        text: 'Device offline — message not delivered',
        color: 'warning',
        icon: 'i-fa6-solid:triangle-exclamation',
      }
      return
    }
    // The device never acks commands; verify by watching its display-state
    // report (debounced ~1s device-side) for the frame we just sent. A
    // mismatch usually means quiet hours or a grid-dimension mismatch.
    const sent = grid.value.map((row) => [...row])
    await new Promise((r) => window.setTimeout(r, 2500))
    const state = await nemotoApi.getState(props.deviceId)
    if (state.display?.flaps && framesMatch(state.display.flaps, sent)) {
      sentMsg.value = {
        text: 'Message is on the board',
        color: 'success',
        icon: 'i-fa6-solid:circle-check',
      }
    } else {
      sentMsg.value = {
        text: 'Sent, but the board has not confirmed it (quiet hours or grid mismatch?)',
        color: 'warning',
        icon: 'i-fa6-solid:triangle-exclamation',
      }
    }
  } catch (err) {
    error.value = getErrorMessage(err, 'Failed to send message')
  } finally {
    sending.value = false
  }
}

onMounted(async () => {
  setHeader({ title: 'Send Message', backRoute: `/nemoto/${props.deviceId}` })
  await ensureLoaded()
  try {
    // Size the canvas from the device's reported grid so the pushed frame
    // matches what the firmware will accept. Setup carries the CURRENT grid
    // dimensions; the display state only describes the last accepted frame,
    // which goes stale after a grid re-map.
    const state = await nemotoApi.getState(props.deviceId)
    if (state.setup && state.setup.gridWidth > 0) {
      width.value = state.setup.gridWidth
      height.value = state.setup.gridHeight
    } else if (state.display?.valid && state.display.width > 0) {
      width.value = state.display.width
      height.value = state.display.height
    }
  } catch {
    // Fall back to the defaults; the device will reject a mismatched frame.
  } finally {
    grid.value = blankGrid(width.value, height.value)
    loading.value = false
  }
})
</script>
