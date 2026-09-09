<template>
  <PageLayout :on-refresh="sched.load">
    <DangerConfirmModal
      v-model="showDelete"
      title="Delete schedule"
      :message="`Delete “${pendingDelete ? itemTitle(pendingDelete) : ''}”?`"
      confirm-text="Delete"
      :loading="deleting"
      :error="deleteError"
      @confirm="confirmDelete"
    />

    <TranquilSessionGate :state="session.state.value" @retry="session.retry">
      <div class="flex flex-col gap-4 px-5 py-6">
        <UAlert
          v-if="sched.error.value"
          color="error"
          icon="i-fa6-solid:circle-exclamation"
          :title="sched.error.value"
        />

        <!-- Quiet hours -->
        <UCard class="bg-white/5">
          <template #header>
            <div class="flex items-center justify-between">
              <div class="flex items-center gap-2">
                <h3 class="font-semibold">Quiet hours</h3>
                <UBadge v-if="sched.quietNow.value" color="warning" variant="soft">Quiet now</UBadge>
              </div>
              <UButton
                size="xs"
                color="neutral"
                variant="soft"
                icon="i-fa6-solid:plus"
                :disabled="quietForm.windows.length >= 4"
                @click="addWindow"
              >
                Add
              </UButton>
            </div>
          </template>

          <p v-if="!quietForm.windows.length" class="text-sm text-white/50">
            No quiet hours. Add a window to keep the table still and dark at night; schedules
            that honor quiet hours are skipped while one is active.
          </p>

          <div
            v-for="(w, i) in quietForm.windows"
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
                  :class="
                    hasDay(w.day_mask, bit) ? 'bg-primary-500 text-white' : 'bg-white/10 text-white/60'
                  "
                  :aria-label="dayFull[bit]"
                  @click="w.day_mask ^= 1 << bit"
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
                aria-label="Remove window"
                @click="quietForm.windows.splice(i, 1)"
              />
            </div>
            <div class="flex items-center gap-2 text-sm">
              <UInput
                type="time"
                :model-value="minutesToTimeStr(w.start_min)"
                class="w-28"
                aria-label="Start"
                @update:model-value="w.start_min = timeStrToMinutes(String($event))"
              />
              <span class="text-white/50">to</span>
              <UInput
                type="time"
                :model-value="minutesToTimeStr(w.end_min)"
                class="w-28"
                aria-label="End"
                @update:model-value="w.end_min = timeStrToMinutes(String($event))"
              />
              <div class="flex-1" />
              <USwitch v-model="w.enabled" />
            </div>
            <p v-if="w.end_min <= w.start_min" class="text-xs text-white/40">
              Runs past midnight into the next day.
            </p>
          </div>

          <div class="mt-4 space-y-3 border-t border-white/10 pt-4">
            <div class="flex items-center justify-between gap-3">
              <div>
                <p class="text-sm font-medium">Stop the table</p>
                <p class="text-xs text-white/50">Stops playback when a window starts.</p>
              </div>
              <USwitch v-model="quietForm.stop_playback" />
            </div>
            <div class="flex items-center justify-between gap-3">
              <div>
                <p class="text-sm font-medium">Turn the lights off</p>
                <p class="text-xs text-white/50">Lights come back on when the window ends.</p>
              </div>
              <USwitch v-model="quietForm.lights_off" />
            </div>
          </div>

          <div v-if="quietDirty" class="mt-4 flex justify-end gap-2">
            <UButton color="neutral" variant="ghost" size="sm" @click="resetQuietForm">
              Discard
            </UButton>
            <UButton color="primary" size="sm" :loading="savingQuiet" @click="saveQuiet">
              Save quiet hours
            </UButton>
          </div>
        </UCard>

        <!-- Schedules -->
        <div class="flex items-center justify-between">
          <h3 class="font-semibold">Schedules</h3>
          <span v-if="sched.timezone.value" class="text-xs text-white/40">
            Times in {{ sched.timezone.value }}
          </span>
        </div>

        <SkeletonList v-if="sched.loading.value && !items.length" :count="3" />

        <div
          v-else-if="!items.length"
          class="flex flex-col items-center gap-3 rounded-lg border border-dashed border-white/20 p-8 text-center text-white/60"
        >
          <span>No schedules yet. Play a playlist in the morning, dim the lights at night.</span>
          <UButton color="primary" variant="soft" icon="i-fa6-solid:plus" @click="openCreate">
            New schedule
          </UButton>
        </div>

        <UCard
          v-for="s in items"
          v-else
          :key="s.id"
          class="bg-white/5"
          :class="{ 'opacity-60': !s.enabled }"
        >
          <div class="flex items-start justify-between gap-3">
            <div class="min-w-0">
              <p class="truncate font-semibold">{{ itemTitle(s) }}</p>
              <p class="text-xs text-white/60">
                {{ daysLabel(s.days_of_week) }} · {{ timeLabel(s.time_of_day) }}
              </p>
              <p v-if="s.name" class="mt-1 text-xs text-white/60">{{ actionLabel(s.action) }}</p>
              <p v-if="nextRunLabel(s)" class="mt-0.5 text-xs text-white/40">
                Next: {{ nextRunLabel(s) }}
              </p>
              <p v-if="!s.obey_quiet_hours" class="mt-0.5 text-xs text-white/40">
                Ignores quiet hours
              </p>
            </div>
            <USwitch :model-value="s.enabled" @update:model-value="toggleEnabled(s, $event)" />
          </div>
          <div class="mt-3 flex items-center gap-1 border-t border-white/10 pt-3">
            <UButton
              color="primary"
              variant="soft"
              size="sm"
              icon="i-fa6-solid:play"
              :loading="running === s.id"
              @click="runNow(s)"
            >
              Run now
            </UButton>
            <div class="flex-1" />
            <UButton
              color="neutral"
              variant="ghost"
              size="sm"
              square
              icon="i-fa6-solid:pen"
              aria-label="Edit"
              @click="openEdit(s)"
            />
            <UButton
              color="error"
              variant="ghost"
              size="sm"
              square
              icon="i-fa6-solid:trash"
              aria-label="Delete"
              @click="askDelete(s)"
            />
          </div>
        </UCard>
      </div>
    </TranquilSessionGate>

    <!-- Editor modal -->
    <UModal v-model:open="showEditor">
      <template #content>
        <UCard>
          <template #header>
            <h3 class="text-lg font-semibold">{{ editing ? 'Edit schedule' : 'New schedule' }}</h3>
          </template>

          <div class="max-h-[65vh] space-y-5 overflow-y-auto">
            <UFormField label="Name (optional)">
              <UInput
                v-model="form.name"
                placeholder="Morning playlist"
                maxlength="32"
                size="lg"
                class="w-full"
              />
            </UFormField>

            <!-- When -->
            <div class="space-y-2">
              <p class="text-sm font-medium text-white/80">When</p>
              <div class="flex flex-wrap gap-1">
                <UButton
                  v-for="preset in dayPresets"
                  :key="preset.label"
                  size="xs"
                  :color="form.days === preset.mask ? 'primary' : 'neutral'"
                  :variant="form.days === preset.mask ? 'solid' : 'soft'"
                  @click="form.days = preset.mask"
                >
                  {{ preset.label }}
                </UButton>
              </div>
              <div class="flex flex-wrap gap-1">
                <button
                  v-for="(label, bit) in dayLabels"
                  :key="bit"
                  type="button"
                  class="h-8 w-8 rounded-full text-xs font-semibold transition-colors"
                  :class="
                    hasDay(form.days, bit) ? 'bg-primary-500 text-white' : 'bg-white/10 text-white/60'
                  "
                  :aria-label="dayFull[bit]"
                  @click="form.days ^= 1 << bit"
                >
                  {{ label }}
                </button>
              </div>
              <div class="flex items-center gap-2 text-sm">
                <span>at</span>
                <UInput v-model="form.time" type="time" class="w-28" />
                <span v-if="sched.timezone.value" class="text-xs text-white/40">
                  {{ sched.timezone.value }}
                </span>
              </div>
            </div>

            <!-- What -->
            <div class="space-y-3">
              <p class="text-sm font-medium text-white/80">What</p>
              <div class="flex flex-wrap gap-1 rounded-lg border border-white/10 bg-white/5 p-1">
                <button
                  v-for="k in kinds"
                  :key="k.id"
                  type="button"
                  class="min-w-16 flex-1 rounded-md px-2 py-1.5 text-xs font-medium transition-colors"
                  :class="
                    form.kind === k.id ? 'bg-primary-500 text-white' : 'text-white/60 hover:text-white'
                  "
                  @click="form.kind = k.id"
                >
                  {{ k.label }}
                </button>
              </div>

              <!-- Playlist -->
              <template v-if="form.kind === 'playlist'">
                <USelectMenu
                  v-model="form.playlistUuid"
                  :items="playlistItems"
                  value-key="value"
                  :search-input="{ placeholder: 'Search playlists…' }"
                  placeholder="Pick a playlist…"
                  class="w-full"
                />
                <p v-if="!playlists.length" class="text-xs text-white/50">
                  No playlists yet. Create one first.
                </p>
                <div class="flex items-center gap-6 text-sm">
                  <label class="flex items-center gap-2">
                    <USwitch v-model="form.shuffle" />
                    <span>Shuffle</span>
                  </label>
                  <label class="flex items-center gap-2">
                    <USwitch v-model="form.loop" />
                    <span>Loop</span>
                  </label>
                </div>
              </template>

              <!-- Pattern -->
              <template v-else-if="form.kind === 'pattern'">
                <USelectMenu
                  v-model="form.patternUuid"
                  :items="patternItems"
                  value-key="value"
                  :search-input="{ placeholder: 'Search patterns…' }"
                  placeholder="Pick a pattern…"
                  class="w-full"
                />
                <div v-if="form.patternUuid" class="flex items-center gap-3">
                  <div class="w-16">
                    <TranquilPatternThumb
                      :src="thumbUrl(form.patternUuid)"
                      :alt="patternName(form.patternUuid)"
                    />
                  </div>
                  <span class="text-sm text-white/70">{{ patternName(form.patternUuid) }}</span>
                </div>
                <p v-if="!patterns.length" class="text-xs text-white/50">
                  No patterns on the table yet.
                </p>
              </template>

              <template v-else-if="form.kind === 'random'">
                <div class="flex items-center justify-between gap-3 text-sm">
                  <div>
                    <p>Keep going</p>
                    <p class="text-xs text-white/50">
                      Another random pattern after each one, until stopped.
                    </p>
                  </div>
                  <USwitch v-model="form.randomLoop" />
                </div>
                <p v-if="!form.randomLoop" class="text-xs text-white/50">
                  Plays one pattern picked at random from the table's library.
                </p>
              </template>

              <!-- Lights -->
              <template v-else-if="form.kind === 'lights'">
                <div class="flex items-center justify-between text-sm">
                  <span>Lights</span>
                  <div class="flex items-center gap-2">
                    <span class="text-white/60">{{ form.lightsOn ? 'On' : 'Off' }}</span>
                    <USwitch v-model="form.lightsOn" />
                  </div>
                </div>
                <div v-if="form.lightsOn" class="space-y-3 rounded-lg border border-white/10 p-3">
                  <div class="flex items-center justify-between text-sm">
                    <div>
                      <p>Also set effect, brightness and color</p>
                      <p class="text-xs text-white/50">Off = keep whatever is set now.</p>
                    </div>
                    <USwitch v-model="form.customize" />
                  </div>
                  <template v-if="form.customize">
                    <UFormField label="Effect">
                      <USelect
                        v-model="form.effectId"
                        :items="effectItems"
                        value-key="value"
                        class="w-full"
                      />
                    </UFormField>
                    <div class="space-y-1">
                      <div class="flex items-center justify-between text-sm">
                        <span>Brightness</span>
                        <span class="text-white/60">{{ Math.round((form.brightness / 255) * 100) }}%</span>
                      </div>
                      <USlider v-model="form.brightness" :min="0" :max="255" :step="5" />
                    </div>
                    <div class="flex items-center justify-between text-sm">
                      <span>Color</span>
                      <TranquilColorPicker v-model="form.color" />
                    </div>
                  </template>
                </div>
              </template>

              <!-- Speed -->
              <template v-else-if="form.kind === 'speed'">
                <div class="space-y-1">
                  <div class="flex items-center justify-between text-sm">
                    <span>Ball speed</span>
                    <span class="text-white/60">{{ form.feedRate.toFixed(2) }}×</span>
                  </div>
                  <USlider v-model="form.feedRate" :min="1" :max="5" :step="0.25" />
                </div>
              </template>

              <p v-else class="text-xs text-white/50">Stops whatever is playing.</p>
            </div>

            <!-- Toggles -->
            <div class="space-y-3 rounded-lg border border-white/10 bg-white/5 p-3">
              <div class="flex items-center justify-between gap-3">
                <div>
                  <p class="text-sm font-medium">Enabled</p>
                  <p class="text-xs text-white/50">Off = won't run automatically.</p>
                </div>
                <USwitch v-model="form.enabled" />
              </div>
              <div class="flex items-center justify-between gap-3">
                <div>
                  <p class="text-sm font-medium">Honor quiet hours</p>
                  <p class="text-xs text-white/50">Skip this schedule during quiet hours.</p>
                </div>
                <USwitch v-model="form.obeyQuietHours" />
              </div>
            </div>

            <UAlert
              v-if="formError"
              color="error"
              icon="i-fa6-solid:circle-exclamation"
              :title="formError"
            />
          </div>

          <template #footer>
            <div class="flex items-center gap-3">
              <UButton
                color="neutral"
                variant="soft"
                icon="i-fa6-solid:play"
                :loading="testing"
                :disabled="!formValid"
                @click="testAction"
              >
                Test
              </UButton>
              <div class="flex-1" />
              <UButton
                color="neutral"
                variant="ghost"
                :disabled="savingForm"
                @click="showEditor = false"
              >
                Cancel
              </UButton>
              <UButton
                color="primary"
                :loading="savingForm"
                :disabled="!formValid"
                @click="saveForm"
              >
                Save
              </UButton>
            </div>
          </template>
        </UCard>
      </template>
    </UModal>
  </PageLayout>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import PageLayout from '@/layouts/PageLayout.vue'
import DangerConfirmModal from '@/components/DangerConfirmModal.vue'
import SkeletonList from '@/components/SkeletonList.vue'
import TranquilSessionGate from '@/components/tranquil/TranquilSessionGate.vue'
import TranquilColorPicker from '@/components/tranquil/TranquilColorPicker.vue'
import TranquilPatternThumb from '@/components/tranquil/TranquilPatternThumb.vue'
import { usePageHeader } from '@/composables/usePageHeader'
import { useCommandToast } from '@/composables/useCommandToast'
import { useTranquilSession } from '@/composables/useTranquilSession'
import { newScheduleId, useTranquilSchedule } from '@/composables/useTranquilSchedule'
import { nextFires, parseCron } from '@/lib/nemoto/cron'
import { formatTranquilError } from '@/lib/tranquil/local/errors'
import {
  ScheduleActionType,
  type LEDEffect,
  type Pattern,
  type Playlist,
  type QuietHours,
  type ScheduleAction,
  type ScheduleItem,
} from '@/lib/tranquil/local/types'

type Kind = 'playlist' | 'pattern' | 'random' | 'lights' | 'speed' | 'stop'

const { setHeader } = usePageHeader()
const toast = useCommandToast()
const session = useTranquilSession()
const { store, base, isActive, isCloud } = session
const sched = useTranquilSchedule(session)
const items = sched.items

// ---- Reference data (names for labels, pickers in the editor) ---------------
const patterns = ref<Pattern[]>([])
const playlists = ref<Playlist[]>([])
const effects = ref<LEDEffect[]>([])

async function loadLibrary() {
  if (!isActive.value) return
  const api = store.api()
  const [p, pl, fx] = await Promise.all([
    api.patterns.list(0, 200).catch(() => null),
    api.playlists.list(0, 100).catch(() => null),
    api.led.getEffects().catch(() => [] as LEDEffect[]),
  ])
  if (p) patterns.value = p.patterns
  if (pl) playlists.value = pl.playlists
  effects.value = fx
}

const patternItems = computed(() => patterns.value.map((p) => ({ label: p.name, value: p.uuid })))
const playlistItems = computed(() =>
  playlists.value.map((p) => ({
    label: `${p.name} (${p.pattern_uuids.length})`,
    value: p.uuid,
  })),
)
const effectItems = computed(() =>
  effects.value.length
    ? effects.value.map((e) => ({ label: e.name, value: e.id }))
    : [{ label: 'Solid', value: 'SOLID' }],
)

function patternName(uuid: string): string {
  return patterns.value.find((p) => p.uuid === uuid)?.name ?? 'Pattern'
}
function playlistName(uuid: string): string {
  return playlists.value.find((p) => p.uuid === uuid)?.name ?? 'Playlist'
}
function thumbUrl(uuid: string): string {
  const b = store.baseUrl()
  return b ? `${b}/api/pattern_thumbs/${uuid}.png` : ''
}

// ---- Labels -------------------------------------------------------------------
const dayLabels = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']
const dayFull = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const dayShort = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const EVERY_DAY = 0x7f
const WEEKDAYS = 0x3e
const WEEKENDS = 0x41
const dayPresets = [
  { label: 'Every day', mask: EVERY_DAY },
  { label: 'Weekdays', mask: WEEKDAYS },
  { label: 'Weekends', mask: WEEKENDS },
]

const hasDay = (mask: number, bit: number) => (mask & (1 << bit)) !== 0

function daysLabel(mask: number): string {
  if (mask === EVERY_DAY) return 'Every day'
  if (mask === WEEKDAYS) return 'Weekdays'
  if (mask === WEEKENDS) return 'Weekends'
  if (mask === 0) return 'Never'
  return dayShort.filter((_, bit) => hasDay(mask, bit)).join(', ')
}

function timeLabel(seconds: number): string {
  const d = new Date(2000, 0, 1, Math.floor(seconds / 3600), Math.floor((seconds % 3600) / 60))
  return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
}

const pad = (n: number) => n.toString().padStart(2, '0')
function secondsToTimeStr(seconds: number): string {
  return `${pad(Math.floor(seconds / 3600))}:${pad(Math.floor((seconds % 3600) / 60))}`
}
function timeStrToSeconds(s: string): number {
  const [h, m] = s.split(':').map((n) => parseInt(n, 10))
  return ((h || 0) % 24) * 3600 + ((m || 0) % 60) * 60
}
function minutesToTimeStr(min: number): string {
  return `${pad(Math.floor(min / 60))}:${pad(min % 60)}`
}
function timeStrToMinutes(s: string): number {
  return Math.floor(timeStrToSeconds(s) / 60)
}

function actionLabel(a: ScheduleAction): string {
  switch (a.type) {
    case ScheduleActionType.LedOff:
      return 'Lights off'
    case ScheduleActionType.LedOn:
      return 'Lights on'
    case ScheduleActionType.PlayRandomPattern:
      return a.loop ? 'Random patterns, on repeat' : 'Play a random pattern'
    case ScheduleActionType.PlayPlaylist: {
      const flags = [a.shuffle && 'shuffle', a.loop && 'loop'].filter(Boolean).join(', ')
      return `Play playlist: ${playlistName(a.uuid ?? '')}${flags ? ` (${flags})` : ''}`
    }
    case ScheduleActionType.PlayPattern:
      return `Play pattern: ${patternName(a.uuid ?? '')}`
    case ScheduleActionType.SetLedState: {
      if (a.led?.on === false) return 'Lights off'
      const bits: string[] = []
      if (a.led?.effect_id) bits.push(a.led.effect_id.toLowerCase())
      if (a.led?.brightness != null) bits.push(`${Math.round((a.led.brightness / 255) * 100)}%`)
      if (a.led?.color) bits.push(a.led.color)
      return `Lights on${bits.length ? `: ${bits.join(' · ')}` : ''}`
    }
    case ScheduleActionType.SetSpeed:
      return `Ball speed ${(a.feed_rate ?? 0).toFixed(2)}×`
    case ScheduleActionType.Stop:
      return 'Stop playback'
    default:
      return 'Unknown action'
  }
}

function itemTitle(s: ScheduleItem): string {
  return s.name || actionLabel(s.action)
}

// Next fire in the table's timezone when it reports one; the phone's otherwise.
function nextRunLabel(s: ScheduleItem): string | null {
  if (!s.enabled || s.days_of_week === 0) return null
  try {
    const days = dayShort.map((_, bit) => bit).filter((bit) => hasDay(s.days_of_week, bit))
    const cron = `${Math.floor((s.time_of_day % 3600) / 60)} ${Math.floor(s.time_of_day / 3600)} * * ${days.join(',')}`
    const next = nextFires(parseCron(cron), 1, new Date(), sched.timezone.value)[0]
    if (!next) return null
    return next.toLocaleString([], {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      timeZone: sched.timezone.value,
    })
  } catch {
    return null
  }
}

// ---- Quiet hours form -----------------------------------------------------------
const cloneQuiet = (q: QuietHours): QuietHours => ({
  windows: q.windows.map((w) => ({ ...w })),
  stop_playback: q.stop_playback,
  lights_off: q.lights_off,
})
const quietForm = reactive<QuietHours>(cloneQuiet(sched.quiet.value))
const savingQuiet = ref(false)
const quietDirty = computed(() => JSON.stringify(quietForm) !== JSON.stringify(sched.quiet.value))

function resetQuietForm() {
  Object.assign(quietForm, cloneQuiet(sched.quiet.value))
}
// A push from the table (or another client) replaces the form unless the user
// is mid-edit.
watch(sched.quiet, (q, old) => {
  if (JSON.stringify(quietForm) === JSON.stringify(old)) Object.assign(quietForm, cloneQuiet(q))
})

function addWindow() {
  quietForm.windows.push({ day_mask: EVERY_DAY, start_min: 22 * 60, end_min: 7 * 60, enabled: true })
}

async function saveQuiet() {
  savingQuiet.value = true
  try {
    await sched.saveQuietHours(cloneQuiet(quietForm))
    toast.ok(isCloud ? 'Quiet hours sent to the table' : 'Quiet hours saved')
  } catch (e) {
    toast.fail(e, 'Failed to save quiet hours')
    resetQuietForm()
  } finally {
    savingQuiet.value = false
  }
}

// ---- Editor ---------------------------------------------------------------------
const kinds: Array<{ id: Kind; label: string }> = [
  { id: 'playlist', label: 'Playlist' },
  { id: 'pattern', label: 'Pattern' },
  { id: 'random', label: 'Random' },
  { id: 'lights', label: 'Lights' },
  { id: 'speed', label: 'Speed' },
  { id: 'stop', label: 'Stop' },
]

const showEditor = ref(false)
const editing = ref<ScheduleItem | null>(null)
const savingForm = ref(false)
const testing = ref(false)
const formError = ref<string>()
const form = reactive({
  name: '',
  days: EVERY_DAY,
  time: '08:00',
  kind: 'playlist' as Kind,
  playlistUuid: '',
  shuffle: false,
  loop: true,
  patternUuid: '',
  randomLoop: true,
  lightsOn: true,
  customize: false,
  effectId: 'SOLID',
  brightness: 255,
  color: '#ffffff',
  feedRate: 3,
  enabled: true,
  obeyQuietHours: true,
})

const formValid = computed(() => {
  if (form.days === 0) return false
  if (form.kind === 'playlist') return !!form.playlistUuid
  if (form.kind === 'pattern') return !!form.patternUuid
  return true
})

function buildAction(): ScheduleAction {
  switch (form.kind) {
    case 'playlist':
      return {
        type: ScheduleActionType.PlayPlaylist,
        uuid: form.playlistUuid,
        shuffle: form.shuffle,
        loop: form.loop,
      }
    case 'pattern':
      return { type: ScheduleActionType.PlayPattern, uuid: form.patternUuid }
    case 'random':
      return { type: ScheduleActionType.PlayRandomPattern, loop: form.randomLoop }
    case 'lights':
      if (!form.lightsOn) return { type: ScheduleActionType.SetLedState, led: { on: false } }
      return {
        type: ScheduleActionType.SetLedState,
        led: form.customize
          ? { on: true, effect_id: form.effectId, brightness: form.brightness, color: form.color }
          : { on: true },
      }
    case 'speed':
      return { type: ScheduleActionType.SetSpeed, feed_rate: form.feedRate }
    case 'stop':
      return { type: ScheduleActionType.Stop }
  }
}

function fillFormFromAction(a: ScheduleAction) {
  switch (a.type) {
    case ScheduleActionType.PlayPlaylist:
      form.kind = 'playlist'
      form.playlistUuid = a.uuid ?? ''
      form.shuffle = !!a.shuffle
      form.loop = !!a.loop
      break
    case ScheduleActionType.PlayPattern:
      form.kind = 'pattern'
      form.patternUuid = a.uuid ?? ''
      break
    case ScheduleActionType.PlayRandomPattern:
      form.kind = 'random'
      form.randomLoop = !!a.loop
      break
    case ScheduleActionType.LedOff:
      form.kind = 'lights'
      form.lightsOn = false
      break
    case ScheduleActionType.LedOn:
      form.kind = 'lights'
      form.lightsOn = true
      form.customize = false
      break
    case ScheduleActionType.SetLedState:
      form.kind = 'lights'
      form.lightsOn = a.led?.on !== false
      form.customize = !!(a.led?.effect_id || a.led?.brightness != null || a.led?.color)
      if (a.led?.effect_id) form.effectId = a.led.effect_id
      if (a.led?.brightness != null) form.brightness = a.led.brightness
      if (a.led?.color) form.color = a.led.color
      break
    case ScheduleActionType.SetSpeed:
      form.kind = 'speed'
      form.feedRate = a.feed_rate || 3
      break
    case ScheduleActionType.Stop:
      form.kind = 'stop'
      break
  }
}

function resetForm() {
  Object.assign(form, {
    name: '',
    days: EVERY_DAY,
    time: '08:00',
    kind: 'playlist' as Kind,
    playlistUuid: playlists.value[0]?.uuid ?? '',
    shuffle: false,
    loop: true,
    patternUuid: '',
    randomLoop: true,
    lightsOn: true,
    customize: false,
    effectId: effects.value[0]?.id ?? 'SOLID',
    brightness: 255,
    color: '#ffffff',
    feedRate: 3,
    enabled: true,
    obeyQuietHours: true,
  })
}

function openCreate() {
  editing.value = null
  formError.value = undefined
  resetForm()
  showEditor.value = true
}

function openEdit(s: ScheduleItem) {
  editing.value = s
  formError.value = undefined
  resetForm()
  form.name = s.name
  form.days = s.days_of_week
  form.time = secondsToTimeStr(s.time_of_day)
  form.enabled = s.enabled
  form.obeyQuietHours = s.obey_quiet_hours
  fillFormFromAction(s.action)
  showEditor.value = true
}

async function saveForm() {
  savingForm.value = true
  formError.value = undefined
  try {
    await sched.upsert({
      id: editing.value?.id ?? newScheduleId(),
      name: form.name.trim(),
      days_of_week: form.days,
      time_of_day: timeStrToSeconds(form.time),
      enabled: form.enabled,
      obey_quiet_hours: form.obeyQuietHours,
      action: buildAction(),
    })
    showEditor.value = false
  } catch (e) {
    formError.value = formatTranquilError(e)
  } finally {
    savingForm.value = false
  }
}

function reportRun(res: { success: boolean; detail?: string }, what: string) {
  if (isCloud) toast.ok(`${what} sent to the table`)
  else if (res.success) toast.ok(`${what} started`)
  else toast.warn(`${what} did not run`, res.detail || undefined)
}

async function testAction() {
  testing.value = true
  try {
    reportRun(await sched.run(buildAction(), true), 'Test')
  } catch (e) {
    toast.fail(e, 'Failed to run the action')
  } finally {
    testing.value = false
  }
}

// ---- List actions --------------------------------------------------------------
const running = ref<number | null>(null)

async function toggleEnabled(s: ScheduleItem, enabled: boolean) {
  try {
    await sched.setEnabled(s.id, enabled)
  } catch (e) {
    toast.fail(e, 'Failed to update the schedule')
  }
}

async function runNow(s: ScheduleItem) {
  running.value = s.id
  try {
    reportRun(await sched.run(s.action, !s.obey_quiet_hours), itemTitle(s))
  } catch (e) {
    toast.fail(e, 'Failed to run the schedule')
  } finally {
    running.value = null
  }
}

const showDelete = ref(false)
const pendingDelete = ref<ScheduleItem | null>(null)
const deleting = ref(false)
const deleteError = ref<string>()

function askDelete(s: ScheduleItem) {
  pendingDelete.value = s
  deleteError.value = undefined
  showDelete.value = true
}

async function confirmDelete() {
  if (!pendingDelete.value) return
  deleting.value = true
  deleteError.value = undefined
  try {
    await sched.remove(pendingDelete.value.id)
    showDelete.value = false
  } catch (e) {
    deleteError.value = formatTranquilError(e)
  } finally {
    deleting.value = false
  }
}

// ---- Lifecycle -----------------------------------------------------------------
watch(isActive, (active) => {
  if (active) void loadLibrary()
})
watch(
  () => [store.libraryVersion.patterns, store.libraryVersion.playlists],
  () => {
    if (isActive.value) void loadLibrary()
  },
)

onMounted(() => {
  setHeader({
    title: 'Schedules',
    backRoute: `${base}`,
    actions: [{ icon: 'i-fa6-solid:plus', label: 'New schedule', onClick: openCreate }],
  })
  void sched.load()
  void loadLibrary()
})
</script>
