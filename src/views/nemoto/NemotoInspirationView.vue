<template>
  <PageLayout :on-refresh="isLinked ? reload : undefined">
    <!-- Sign in to Vestaboard -->
    <div v-if="!isLinked" class="flex flex-col gap-5 px-5 py-6">
      <div class="rounded-lg border border-white/10 bg-white/5 p-5">
        <h2 class="font-semibold">Connect Vestaboard</h2>
        <p class="mt-2 text-sm text-white/60">
          Sign in with the email on your Vestaboard account to browse their daily inspiration, then
          send any message to this board. Vestaboard emails you a 6-digit code — there is no
          password.
        </p>
      </div>

      <UAlert
        v-if="authError"
        color="error"
        icon="i-fa6-solid:circle-exclamation"
        :title="authError"
      />

      <UFormField label="Email">
        <UInput
          v-model="emailInput"
          type="email"
          autocomplete="email"
          placeholder="you@example.com"
          size="lg"
          :disabled="codeSent"
          class="w-full"
        />
      </UFormField>

      <UFormField v-if="codeSent" label="Code" help="Check your email for a 6-digit code.">
        <UInput
          v-model="codeInput"
          inputmode="numeric"
          autocomplete="one-time-code"
          placeholder="000000"
          size="lg"
          class="w-full"
        />
      </UFormField>

      <UButton
        v-if="!codeSent"
        color="primary"
        size="lg"
        block
        :loading="authBusy"
        :disabled="!emailInput.trim()"
        @click="sendCode"
      >
        Email me a code
      </UButton>
      <div v-else class="flex flex-col gap-2">
        <UButton
          color="primary"
          size="lg"
          block
          :loading="authBusy"
          :disabled="!codeInput.trim()"
          @click="submitCode"
        >
          Sign in
        </UButton>
        <UButton color="neutral" variant="ghost" block :disabled="authBusy" @click="resetAuth">
          Use a different email
        </UButton>
      </div>
    </div>

    <!-- Browse -->
    <div v-else class="flex flex-col gap-4 px-5 py-6 pb-10">
      <UAlert v-if="sentMsg" :color="sentMsg.color" :icon="sentMsg.icon" :title="sentMsg.text" />

      <UTabs v-model="tab" :items="tabItems" class="w-full" />

      <UAlert v-if="error" color="error" icon="i-fa6-solid:circle-exclamation" :title="error" />

      <div v-if="loading" class="flex items-center justify-center py-16">
        <UIcon name="i-fa6-solid:spinner" class="h-7 w-7 animate-spin text-white/50" />
      </div>

      <div
        v-else-if="!entries.length"
        class="rounded-lg border border-dashed border-white/20 p-8 text-center text-white/60"
      >
        Nothing to show right now.
      </div>

      <template v-else>
        <UCard v-for="entry in entries" :key="entry.key" class="bg-white/5">
          <button
            type="button"
            class="block w-full text-left"
            :aria-label="`Send: ${entry.text || 'message'}`"
            @click="askSend(entry)"
          >
            <div class="board-frame">
              <NemotoFlapGrid :flaps="entry.flaps" />
            </div>
            <div class="mt-3 flex items-center justify-between gap-3">
              <p class="min-w-0 truncate text-sm text-white/60">
                {{ entry.attribution || 'Vestaboard' }}
              </p>
              <span
                v-if="entry.likeCount"
                class="flex shrink-0 items-center gap-1 text-sm text-white/50"
              >
                <UIcon name="i-fa6-solid:heart" class="h-3 w-3" />
                {{ entry.likeCount }}
              </span>
            </div>
          </button>
        </UCard>

        <UButton
          v-if="tab === 'inspiration' && nextCursor"
          color="neutral"
          variant="soft"
          size="lg"
          block
          :loading="loadingMore"
          @click="loadMore"
        >
          Load more
        </UButton>
      </template>
    </div>

    <!-- Confirm push -->
    <UModal v-model:open="showConfirm" title="Send to board">
      <template #body>
        <div class="flex flex-col gap-4">
          <div v-if="pending" class="board-frame">
            <NemotoFlapGrid :flaps="pending.flaps" />
          </div>
          <p v-if="sizeNote" class="text-sm text-amber-400">{{ sizeNote }}</p>
          <USwitch v-model="forceQuiet" label="Bypass quiet hours" />
          <UAlert
            v-if="sendError"
            color="error"
            icon="i-fa6-solid:circle-exclamation"
            :title="sendError"
          />
        </div>
      </template>
      <template #footer>
        <div class="flex w-full gap-2">
          <UButton color="neutral" variant="soft" class="flex-1" @click="showConfirm = false">
            Cancel
          </UButton>
          <UButton
            color="primary"
            class="flex-1"
            icon="i-fa6-solid:paper-plane"
            :loading="sending"
            @click="confirmSend"
          >
            Display Now
          </UButton>
        </div>
      </template>
    </UModal>
  </PageLayout>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import PageLayout from '@/layouts/PageLayout.vue'
import NemotoFlapGrid from '@/components/nemoto/NemotoFlapGrid.vue'
import { usePageHeader } from '@/composables/usePageHeader'
import { useNemotoFlaps } from '@/composables/useNemotoFlaps'
import { useVestaboardStore } from '@/stores/vestaboard'
import { nemotoApi } from '@/lib/api/nemoto'
import { getErrorMessage } from '@/lib/api/errors'
import {
  fitFlapGrid,
  vestaboardToFlaps,
  vestaboardToText,
  VESTABOARD_COLS,
  VESTABOARD_ROWS,
} from '@/lib/vestaboard/charmap'
import {
  inspirationEntry,
  LIST_INSPIRATION,
  LIST_TODAYS_PICKS,
  type ListInspirationResult,
  type ListTodaysPicksResult,
  type VestaboardPick,
} from '@/lib/vestaboard/queries'

const props = defineProps<{ deviceId: string }>()

const { setHeader } = usePageHeader()
const { blankId, ensureLoaded } = useNemotoFlaps()
const vestaboard = useVestaboardStore()

interface Entry {
  key: string
  flaps: number[][]
  text: string
  attribution: string | null
  likeCount: number
}

const tabItems = [
  { label: 'Inspiration', value: 'inspiration' },
  { label: "Today's Picks", value: 'picks' },
]

const tab = ref<'inspiration' | 'picks'>('inspiration')
const entries = ref<Entry[]>([])
const nextCursor = ref<string | null>(null)
const loading = ref(false)
const loadingMore = ref(false)
const error = ref<string>()

// Auth form
const emailInput = ref('')
const codeInput = ref('')
const codeSent = ref(false)
const authBusy = ref(false)
const authError = ref<string>()

// Board geometry, read from the device — the firmware rejects a frame whose
// dimensions don't match its grid.
const width = ref(VESTABOARD_COLS)
const height = ref(VESTABOARD_ROWS)

// Send flow
const showConfirm = ref(false)
const pending = ref<Entry | null>(null)
const forceQuiet = ref(false)
const sending = ref(false)
const sendError = ref<string>()
const sentMsg = ref<{ text: string; color: 'success' | 'warning'; icon: string } | null>(null)

const isLinked = computed(() => vestaboard.isLinked)

const sizeNote = computed(() => {
  if (width.value === VESTABOARD_COLS && height.value === VESTABOARD_ROWS) return ''
  return `Vestaboard messages are ${VESTABOARD_COLS}x${VESTABOARD_ROWS}; this board is ${width.value}x${height.value}, so the message is centred and cropped to fit.`
})

/**
 * Vestaboard art often relies on their black flap, which we don't have — it
 * translates to a blank, so a design that was black-on-colour still reads.
 */
function toEntry(pick: VestaboardPick, keyPrefix: string): Entry {
  const chars = pick.message.characters
  return {
    key: `${keyPrefix}:${pick.id}`,
    flaps: fitFlapGrid(vestaboardToFlaps(chars), width.value, height.value, blankId.value),
    text: vestaboardToText(chars),
    attribution: pick.attribution,
    likeCount: pick.likeCount,
  }
}

async function loadInspiration(cursor: string | null) {
  const res = await vestaboard.query<ListInspirationResult>('ListInspiration', LIST_INSPIRATION, {
    input: { limit: 12, cursor, boardStyle: 'black' },
  })
  const page = res.listInspirationV2
  const mapped = page.items
    .map((item) => {
      const entry = inspirationEntry(item)
      return entry ? toEntry(entry, item.id) : null
    })
    .filter((e): e is Entry => e !== null)
  nextCursor.value = page.nextCursor
  return mapped
}

async function loadPicks() {
  const res = await vestaboard.query<ListTodaysPicksResult>('ListTodaysPicks', LIST_TODAYS_PICKS, {
    input: { boardStyle: 'black' },
  })
  nextCursor.value = null
  return res.listTodaysPicks.picks.map((pick) => toEntry(pick, 'pick'))
}

async function load() {
  if (!vestaboard.isLinked) return
  loading.value = true
  error.value = undefined
  entries.value = []
  nextCursor.value = null
  try {
    entries.value = tab.value === 'inspiration' ? await loadInspiration(null) : await loadPicks()
  } catch (err) {
    error.value = getErrorMessage(err, 'Failed to load from Vestaboard')
  } finally {
    loading.value = false
  }
}

// PageLayout's pull-to-refresh handler.
async function reload() {
  await load()
}

async function loadMore() {
  if (!nextCursor.value || loadingMore.value) return
  loadingMore.value = true
  try {
    entries.value = [...entries.value, ...(await loadInspiration(nextCursor.value))]
  } catch (err) {
    error.value = getErrorMessage(err, 'Failed to load more')
  } finally {
    loadingMore.value = false
  }
}

async function sendCode() {
  authBusy.value = true
  authError.value = undefined
  try {
    await vestaboard.sendCode(emailInput.value)
    codeSent.value = true
  } catch (err) {
    authError.value = getErrorMessage(err, 'Could not send the code')
  } finally {
    authBusy.value = false
  }
}

async function submitCode() {
  authBusy.value = true
  authError.value = undefined
  try {
    await vestaboard.submitCode(emailInput.value, codeInput.value)
    codeInput.value = ''
    codeSent.value = false
    syncHeader()
    await load()
  } catch (err) {
    authError.value = getErrorMessage(err, 'That code was not accepted')
  } finally {
    authBusy.value = false
  }
}

function resetAuth() {
  codeSent.value = false
  codeInput.value = ''
  authError.value = undefined
}

async function unlink() {
  await vestaboard.unlink()
  entries.value = []
  nextCursor.value = null
  resetAuth()
  syncHeader()
}

function askSend(entry: Entry) {
  pending.value = entry
  sendError.value = undefined
  sentMsg.value = null
  showConfirm.value = true
}

async function confirmSend() {
  if (!pending.value) return
  sending.value = true
  sendError.value = undefined
  try {
    const res = await nemotoApi.displayFrame(props.deviceId, {
      flaps: pending.value.flaps,
      forceQuiet: forceQuiet.value,
    })
    showConfirm.value = false
    sentMsg.value = res.delivered
      ? { text: 'Sent to the board', color: 'success', icon: 'i-fa6-solid:circle-check' }
      : {
          text: 'Device offline — message not delivered',
          color: 'warning',
          icon: 'i-fa6-solid:triangle-exclamation',
        }
    window.setTimeout(() => (sentMsg.value = null), 5000)
  } catch (err) {
    sendError.value = getErrorMessage(err, 'Failed to send message')
  } finally {
    sending.value = false
  }
}

function syncHeader() {
  setHeader({
    title: 'Inspiration',
    backRoute: `/nemoto/${props.deviceId}`,
    actions: vestaboard.isLinked
      ? [{ icon: 'i-fa6-solid:link-slash', label: 'Disconnect Vestaboard', onClick: unlink }]
      : [],
  })
}

watch(tab, load)

onMounted(async () => {
  syncHeader()
  await Promise.all([ensureLoaded(), vestaboard.initialize()])
  syncHeader()
  try {
    // Setup carries the CURRENT grid dimensions; the display state only
    // describes the last accepted frame, which goes stale after a re-map.
    const state = await nemotoApi.getState(props.deviceId)
    if (state.setup && state.setup.gridWidth > 0) {
      width.value = state.setup.gridWidth
      height.value = state.setup.gridHeight
    } else if (state.display?.valid && state.display.width > 0) {
      width.value = state.display.width
      height.value = state.display.height
    }
  } catch {
    // Fall back to Vestaboard's own geometry, which is what our board uses.
  }
  await load()
})
</script>

<style scoped>
.board-frame {
  width: 100%;
  padding: 8px;
  background: #18181b;
  border-radius: 0.5rem;
}
</style>
