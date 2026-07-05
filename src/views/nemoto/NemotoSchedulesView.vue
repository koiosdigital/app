<template>
  <PageLayout :on-refresh="load">
    <DangerConfirmModal
      v-model="showDelete"
      title="Delete Schedule"
      :message="`Delete schedule “${pendingDelete?.name ?? ''}”?`"
      confirm-text="Delete"
      :loading="deleting"
      :error="deleteError"
      @confirm="confirmDelete"
    />

    <div class="flex flex-col gap-4 px-5 py-6">
      <UButton color="primary" size="lg" icon="i-fa6-solid:plus" block @click="openCreate">
        New Schedule
      </UButton>

      <UAlert
        v-if="commandMsg"
        :color="commandMsg.color"
        :icon="commandMsg.icon"
        :title="commandMsg.text"
      />

      <div v-if="loading" class="flex items-center justify-center py-16">
        <UIcon name="i-fa6-solid:spinner" class="h-7 w-7 animate-spin text-white/50" />
      </div>

      <UAlert
        v-else-if="error"
        color="error"
        icon="i-fa6-solid:circle-exclamation"
        :title="error"
      />

      <div
        v-else-if="!schedules.length"
        class="rounded-lg border border-dashed border-white/20 p-8 text-center text-white/60"
      >
        No schedules yet.
      </div>

      <UCard v-for="s in schedules" v-else :key="s.scheduleId" class="bg-white/5">
        <div class="flex items-start justify-between gap-3">
          <div class="min-w-0">
            <p class="truncate font-semibold">{{ s.name }}</p>
            <p class="text-xs text-white/60">{{ cronSummary(s.cron) }}</p>
            <p class="mt-1 text-xs text-white/60">{{ actionLabel(s.action) }}</p>
            <p v-if="nextRunLabel(s)" class="mt-0.5 text-xs text-white/40">
              Next: {{ nextRunLabel(s) }}
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
            :loading="running === s.scheduleId"
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
            @click="openEdit(s)"
          />
          <UButton
            color="error"
            variant="ghost"
            size="sm"
            square
            icon="i-fa6-solid:trash"
            @click="askDelete(s)"
          />
        </div>
      </UCard>
    </div>

    <!-- Editor modal -->
    <UModal v-model:open="showEditor">
      <template #content>
        <UCard>
          <template #header>
            <h3 class="text-lg font-semibold">{{ editing ? 'Edit Schedule' : 'New Schedule' }}</h3>
          </template>

          <div class="max-h-[65vh] space-y-5 overflow-y-auto">
            <UFormField label="Name">
              <UInput v-model="form.name" placeholder="Morning greeting" size="lg" />
            </UFormField>

            <!-- When -->
            <div class="space-y-2">
              <p class="text-sm font-medium text-white/80">When</p>
              <div class="flex flex-wrap gap-1 rounded-lg border border-white/10 bg-white/5 p-1">
                <button
                  v-for="m in whenModes"
                  :key="m.id"
                  type="button"
                  class="min-w-18 flex-1 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors"
                  :class="
                    form.whenMode === m.id
                      ? 'bg-primary-500 text-white'
                      : 'text-white/60 hover:text-white'
                  "
                  @click="form.whenMode = m.id"
                >
                  {{ m.label }}
                </button>
              </div>

              <div class="rounded-lg border border-white/10 bg-white/5 p-3">
                <div v-if="form.whenMode === 'repeating'" class="flex items-center gap-2 text-sm">
                  <span>Every</span>
                  <UInputNumber
                    v-model="form.repeatN"
                    :min="1"
                    :max="form.repeatUnit === 'minutes' ? 59 : 23"
                    class="w-24"
                  />
                  <USelect v-model="form.repeatUnit" :items="repeatUnits" class="w-28" />
                </div>

                <div v-else-if="form.whenMode === 'daily'" class="flex items-center gap-2 text-sm">
                  <span>Every day at</span>
                  <UInput v-model="form.dailyTime" type="time" class="w-28" />
                </div>

                <div v-else-if="form.whenMode === 'weekly'" class="flex flex-col gap-3 text-sm">
                  <div class="flex flex-wrap gap-1">
                    <button
                      v-for="(label, bit) in dayLabels"
                      :key="bit"
                      type="button"
                      class="h-7 w-7 rounded-full text-xs font-semibold transition-colors"
                      :class="
                        form.weeklyDays.includes(bit)
                          ? 'bg-primary-500 text-white'
                          : 'bg-white/10 text-white/60'
                      "
                      :aria-label="dayFull[bit]"
                      @click="toggleWeeklyDay(bit)"
                    >
                      {{ label }}
                    </button>
                  </div>
                  <div class="flex items-center gap-2">
                    <span>at</span>
                    <UInput v-model="form.weeklyTime" type="time" class="w-28" />
                  </div>
                </div>

                <div
                  v-else-if="form.whenMode === 'monthly'"
                  class="flex flex-wrap items-center gap-2 text-sm"
                >
                  <span>On day</span>
                  <UInputNumber v-model="form.monthlyDay" :min="1" :max="31" class="w-24" />
                  <span>at</span>
                  <UInput v-model="form.monthlyTime" type="time" class="w-28" />
                </div>

                <div v-else class="space-y-1.5">
                  <UInput
                    v-model="form.customCron"
                    placeholder="0 9 * * 1-5"
                    class="w-full font-mono"
                  />
                  <p class="text-xs text-white/50">
                    Standard 5- or 6-field cron:
                    <code>min hour day-of-month month day-of-week</code>
                  </p>
                </div>
              </div>

              <!-- Cron preview + next fires -->
              <div class="space-y-1 rounded-lg border border-white/10 bg-white/5 p-3 text-xs">
                <p v-if="cronError" class="text-red-300">{{ cronError }}</p>
                <template v-else>
                  <p class="font-medium text-white/90">{{ cronDescription }}</p>
                  <p class="font-mono text-white/50">{{ builtCron }}</p>
                  <div v-if="nextFireDates.length" class="pt-1 text-white/50">
                    <p class="font-medium text-white/70">Next runs</p>
                    <p v-for="(d, i) in nextFireDates" :key="i">· {{ fmtFire(d) }}</p>
                    <p class="pt-0.5 text-white/40">Times run in the display's timezone.</p>
                  </div>
                </template>
              </div>
            </div>

            <!-- What -->
            <div class="space-y-2">
              <p class="text-sm font-medium text-white/80">What to show</p>
              <div class="flex flex-wrap gap-1 rounded-lg border border-white/10 bg-white/5 p-1">
                <button
                  v-for="a in actionModes"
                  :key="a.id"
                  type="button"
                  class="min-w-24 flex-1 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors"
                  :class="
                    form.actionType === a.id
                      ? 'bg-primary-500 text-white'
                      : 'text-white/60 hover:text-white'
                  "
                  @click="form.actionType = a.id"
                >
                  {{ a.label }}
                </button>
              </div>

              <UFormField v-if="form.actionType === 'DISPLAY_PRESET'">
                <USelectMenu
                  v-model="form.presetId"
                  :items="presetItems"
                  value-key="value"
                  :search-input="false"
                  placeholder="Pick a preset…"
                  class="w-full"
                />
                <p v-if="!presets.length" class="mt-1 text-xs text-white/50">
                  No presets yet — create one first.
                </p>
              </UFormField>

              <div v-else-if="form.actionType === 'DISPLAY_SOLID'" class="space-y-2">
                <div
                  class="max-h-52 space-y-2 overflow-y-auto rounded-lg border border-white/10 p-2"
                >
                  <div class="flex flex-wrap gap-1">
                    <button
                      v-for="f in groups.glyphs"
                      :key="f.id"
                      type="button"
                      class="flex h-8 w-8 items-center justify-center rounded border font-mono text-sm transition-colors"
                      :class="
                        form.flap === f.id
                          ? 'border-primary-500 bg-primary-500 text-white'
                          : 'border-white/10 bg-white/5 text-white/80 hover:bg-white/10'
                      "
                      :title="f.label"
                      @click="form.flap = f.id"
                    >
                      {{ f.glyph }}
                    </button>
                  </div>
                  <div
                    v-if="groups.colors.length"
                    class="flex flex-wrap gap-1 border-t border-white/10 pt-2"
                  >
                    <button
                      v-for="f in groups.colors"
                      :key="f.id"
                      type="button"
                      class="h-8 w-8 rounded border-2 transition-all"
                      :class="
                        form.flap === f.id
                          ? 'scale-110 border-primary-500'
                          : 'border-transparent hover:border-white/30'
                      "
                      :style="{ backgroundColor: f.color ?? '#000' }"
                      :title="f.label"
                      @click="form.flap = f.id"
                    />
                  </div>
                </div>
                <p class="text-xs text-white/50">Fills the entire display with one flap.</p>
              </div>

              <p v-else class="text-xs text-white/50">Blanks every cell on the display.</p>
            </div>

            <!-- Toggles -->
            <div class="space-y-3 rounded-lg border border-white/10 bg-white/5 p-3">
              <div class="flex items-center justify-between gap-3">
                <div>
                  <p class="text-sm font-medium">Enabled</p>
                  <p class="text-xs text-white/50">Off = won't fire automatically.</p>
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
            <div class="flex justify-end gap-3">
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
import { computed, onMounted, reactive, ref } from 'vue'
import { useRoute } from 'vue-router'
import PageLayout from '@/layouts/PageLayout.vue'
import DangerConfirmModal from '@/components/DangerConfirmModal.vue'
import { usePageHeader } from '@/composables/usePageHeader'
import { useNemotoFlaps } from '@/composables/useNemotoFlaps'
import {
  buildCron,
  describeCron,
  detectTemplate,
  nextFires,
  parseCron,
  type CronTemplate,
} from '@/lib/nemoto/cron'
import {
  nemotoApi,
  type NemotoSchedule,
  type NemotoScheduleAction,
  type NemotoPresetListItem,
} from '@/lib/api/nemoto'
import { getErrorMessage } from '@/lib/api/errors'

type ActionType = NemotoScheduleAction['type']
type WhenMode = 'repeating' | 'daily' | 'weekly' | 'monthly' | 'custom'

const route = useRoute()
const { setHeader } = usePageHeader()
const { byId, groups, ensureLoaded } = useNemotoFlaps()
const deviceId = computed(() => route.params.id as string)

const schedules = ref<NemotoSchedule[]>([])
const presets = ref<NemotoPresetListItem[]>([])
const loading = ref(true)
const error = ref<string>()
const running = ref<number | null>(null)

const dayLabels = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']
const dayFull = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const whenModes: Array<{ id: WhenMode; label: string }> = [
  { id: 'repeating', label: 'Repeating' },
  { id: 'daily', label: 'Daily' },
  { id: 'weekly', label: 'Weekly' },
  { id: 'monthly', label: 'Monthly' },
  { id: 'custom', label: 'Custom' },
]
const actionModes: Array<{ id: ActionType; label: string }> = [
  { id: 'DISPLAY_PRESET', label: 'Show preset' },
  { id: 'DISPLAY_SOLID', label: 'Single flap' },
  { id: 'CLEAR', label: 'Clear' },
]
const repeatUnits: Array<'minutes' | 'hours'> = ['minutes', 'hours']

const presetItems = computed(() =>
  presets.value.map((p) => ({ label: `${p.name} (${p.width}×${p.height})`, value: p.presetId })),
)

const commandMsg = ref<{
  text: string
  color: 'success' | 'warning' | 'error'
  icon: string
} | null>(null)

// Editor state
const showEditor = ref(false)
const editing = ref<NemotoSchedule | null>(null)
const savingForm = ref(false)
const formError = ref<string>()
const form = reactive({
  name: '',
  whenMode: 'daily' as WhenMode,
  repeatN: 15,
  repeatUnit: 'minutes' as (typeof repeatUnits)[number],
  dailyTime: '09:00',
  weeklyDays: [1, 2, 3, 4, 5] as number[],
  weeklyTime: '09:00',
  monthlyDay: 1,
  monthlyTime: '09:00',
  customCron: '0 9 * * 1-5',
  enabled: true,
  obeyQuietHours: true,
  actionType: 'DISPLAY_PRESET' as ActionType,
  presetId: 0,
  flap: 0,
})

// Delete state
const showDelete = ref(false)
const pendingDelete = ref<NemotoSchedule | null>(null)
const deleting = ref(false)
const deleteError = ref<string>()

// ---- Cron building / preview -------------------------------------------------
function parseTimeStr(s: string): { h: number; m: number } {
  const [h, m] = s.split(':').map((n) => parseInt(n, 10))
  return { h: h || 0, m: m || 0 }
}

function clampInt(n: number, lo: number, hi: number): number {
  if (!Number.isFinite(n)) return lo
  return Math.max(lo, Math.min(hi, Math.round(n)))
}

const builtCron = computed<string>(() => {
  let template: CronTemplate
  switch (form.whenMode) {
    case 'repeating': {
      const n = clampInt(form.repeatN, 1, form.repeatUnit === 'minutes' ? 59 : 23)
      template =
        form.repeatUnit === 'minutes'
          ? { kind: 'every_minutes', n }
          : { kind: 'custom', cron: `0 */${n} * * *` }
      break
    }
    case 'daily': {
      const t = parseTimeStr(form.dailyTime)
      template = { kind: 'daily', hour: t.h, minute: t.m }
      break
    }
    case 'weekly': {
      const t = parseTimeStr(form.weeklyTime)
      template = {
        kind: 'weekly',
        days: form.weeklyDays.length ? form.weeklyDays : [1, 2, 3, 4, 5],
        hour: t.h,
        minute: t.m,
      }
      break
    }
    case 'monthly': {
      const t = parseTimeStr(form.monthlyTime)
      template = {
        kind: 'monthly',
        dayOfMonth: clampInt(form.monthlyDay, 1, 31),
        hour: t.h,
        minute: t.m,
      }
      break
    }
    case 'custom':
      template = { kind: 'custom', cron: form.customCron }
      break
  }
  return buildCron(template)
})

const cronError = ref<string | null>(null)
const cronDescription = computed(() => {
  cronError.value = null
  try {
    return describeCron(parseCron(builtCron.value))
  } catch (err) {
    cronError.value = getErrorMessage(err, 'Invalid cron expression')
    return null
  }
})

// Next-fire preview uses the browser's timezone; the device evaluates the
// cron in its own local time, so treat these as approximate.
const nextFireDates = computed<Date[]>(() => {
  if (cronError.value) return []
  try {
    return nextFires(parseCron(builtCron.value), 3)
  } catch {
    return []
  }
})

function fmtFire(d: Date): string {
  return d.toLocaleString(undefined, {
    weekday: 'short',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function cronSummary(cron: string): string {
  try {
    return describeCron(parseCron(cron))
  } catch {
    return cron
  }
}

function nextRunLabel(s: NemotoSchedule): string | null {
  if (!s.enabled) return null
  try {
    const next = nextFires(parseCron(s.cron), 1)[0]
    return next ? fmtFire(next) : null
  } catch {
    return null
  }
}

function toggleWeeklyDay(bit: number) {
  if (form.weeklyDays.includes(bit)) {
    form.weeklyDays = form.weeklyDays.filter((d) => d !== bit)
  } else {
    form.weeklyDays = [...form.weeklyDays, bit].sort()
  }
}

function applyTemplate(t: CronTemplate) {
  const pad = (n: number) => n.toString().padStart(2, '0')
  switch (t.kind) {
    case 'every_minutes':
      form.whenMode = 'repeating'
      form.repeatUnit = 'minutes'
      form.repeatN = t.n
      break
    case 'hourly':
      // "Hourly at minute M" has no clean fit in the Repeating mode (which
      // only supports the every-N-of-unit shape) — fall back to Custom.
      form.whenMode = 'custom'
      form.customCron = `${t.minute} * * * *`
      break
    case 'daily':
      form.whenMode = 'daily'
      form.dailyTime = `${pad(t.hour)}:${pad(t.minute)}`
      break
    case 'weekly':
      form.whenMode = 'weekly'
      form.weeklyDays = [...t.days]
      form.weeklyTime = `${pad(t.hour)}:${pad(t.minute)}`
      break
    case 'monthly':
      form.whenMode = 'monthly'
      form.monthlyDay = t.dayOfMonth
      form.monthlyTime = `${pad(t.hour)}:${pad(t.minute)}`
      break
    case 'custom':
      form.whenMode = 'custom'
      form.customCron = t.cron
      break
  }
}

// ---- Validation ---------------------------------------------------------------
const actionValid = computed(() => {
  if (form.actionType === 'DISPLAY_PRESET') return form.presetId > 0
  return true
})

const formValid = computed(
  () => form.name.trim().length > 0 && !cronError.value && actionValid.value,
)

// ---- Data ----------------------------------------------------------------------
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

function actionLabel(action: NemotoScheduleAction): string {
  if (action.type === 'CLEAR') return 'Clear display'
  if (action.type === 'DISPLAY_SOLID') {
    const glyph = byId.value.get(action.flap ?? 0)
    return `Solid: ${glyph?.label ?? `flap ${action.flap ?? 0}`}`
  }
  const preset = presets.value.find((p) => p.presetId === action.presetId)
  return `Show: ${preset?.name ?? `preset ${action.presetId ?? 0}`}`
}

async function load() {
  loading.value = true
  error.value = undefined
  try {
    const [s, p] = await Promise.all([
      nemotoApi.listSchedules(deviceId.value),
      nemotoApi.listPresets(deviceId.value),
    ])
    schedules.value = s
    presets.value = p
  } catch (err) {
    error.value = getErrorMessage(err, 'Failed to load schedules')
  } finally {
    loading.value = false
  }
}

function openCreate() {
  editing.value = null
  formError.value = undefined
  Object.assign(form, {
    name: '',
    whenMode: 'daily' as WhenMode,
    repeatN: 15,
    repeatUnit: 'minutes' as const,
    dailyTime: '09:00',
    weeklyDays: [1, 2, 3, 4, 5],
    weeklyTime: '09:00',
    monthlyDay: 1,
    monthlyTime: '09:00',
    customCron: '0 9 * * 1-5',
    enabled: true,
    obeyQuietHours: true,
    actionType: 'DISPLAY_PRESET' as ActionType,
    presetId: presets.value[0]?.presetId ?? 0,
    flap: 0,
  })
  showEditor.value = true
}

function openEdit(s: NemotoSchedule) {
  editing.value = s
  formError.value = undefined
  Object.assign(form, {
    name: s.name,
    enabled: s.enabled,
    obeyQuietHours: s.obeyQuietHours,
    actionType: s.action.type,
    presetId: s.action.presetId ?? 0,
    flap: s.action.flap ?? 0,
  })
  applyTemplate(detectTemplate(s.cron))
  showEditor.value = true
}

function buildAction(): NemotoScheduleAction {
  if (form.actionType === 'DISPLAY_PRESET')
    return { type: 'DISPLAY_PRESET', presetId: form.presetId }
  if (form.actionType === 'DISPLAY_SOLID') return { type: 'DISPLAY_SOLID', flap: form.flap }
  return { type: 'CLEAR' }
}

async function saveForm() {
  savingForm.value = true
  formError.value = undefined
  try {
    const body = {
      name: form.name.trim(),
      cron: builtCron.value,
      enabled: form.enabled,
      obeyQuietHours: form.obeyQuietHours,
      action: buildAction(),
    }
    if (editing.value) {
      await nemotoApi.updateSchedule(deviceId.value, editing.value.scheduleId, body)
    } else {
      await nemotoApi.createSchedule(deviceId.value, body)
    }
    showEditor.value = false
    await load()
  } catch (err) {
    formError.value = getErrorMessage(err, 'Failed to save schedule')
  } finally {
    savingForm.value = false
  }
}

async function toggleEnabled(s: NemotoSchedule, enabled: boolean) {
  try {
    await nemotoApi.updateSchedule(deviceId.value, s.scheduleId, { enabled })
    s.enabled = enabled
  } catch (err) {
    flash(
      getErrorMessage(err, 'Failed to update schedule'),
      'error',
      'i-fa6-solid:circle-exclamation',
    )
  }
}

async function runNow(s: NemotoSchedule) {
  running.value = s.scheduleId
  try {
    const res = await nemotoApi.runScheduleNow(deviceId.value, s.scheduleId)
    flashDelivered(res.delivered, 'Schedule run')
  } catch (err) {
    flash(getErrorMessage(err, 'Failed to run schedule'), 'error', 'i-fa6-solid:circle-exclamation')
  } finally {
    running.value = null
  }
}

function askDelete(s: NemotoSchedule) {
  pendingDelete.value = s
  deleteError.value = undefined
  showDelete.value = true
}

async function confirmDelete() {
  if (!pendingDelete.value) return
  deleting.value = true
  deleteError.value = undefined
  try {
    await nemotoApi.deleteSchedule(deviceId.value, pendingDelete.value.scheduleId)
    showDelete.value = false
    await load()
  } catch (err) {
    deleteError.value = getErrorMessage(err, 'Failed to delete schedule')
  } finally {
    deleting.value = false
  }
}

onMounted(() => {
  setHeader({ title: 'Schedules', backRoute: `/nemoto/${deviceId.value}` })
  ensureLoaded()
  load()
})
</script>
