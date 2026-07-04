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
            <p class="font-mono text-xs text-white/50">{{ s.cron }}</p>
            <p class="mt-1 text-xs text-white/60">{{ actionLabel(s.action) }}</p>
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

          <div class="space-y-4">
            <UFormField label="Name">
              <UInput v-model="form.name" placeholder="Morning greeting" size="lg" />
            </UFormField>

            <UFormField label="Cron expression" hint="minute hour day month weekday">
              <UInput v-model="form.cron" placeholder="0 9 * * 1-5" size="lg" class="font-mono" />
            </UFormField>

            <UFormField label="Action">
              <USelect v-model="form.actionType" :items="actionTypes" class="w-full" />
            </UFormField>

            <UFormField v-if="form.actionType === 'DISPLAY_PRESET'" label="Preset">
              <USelectMenu
                v-model="form.presetId"
                :items="presetItems"
                value-key="value"
                :search-input="false"
                class="w-full"
              />
            </UFormField>

            <UFormField v-if="form.actionType === 'DISPLAY_SOLID'" label="Flap (0-63)">
              <div class="flex items-center gap-3">
                <UInputNumber v-model="form.flap" :min="0" :max="63" class="flex-1" />
                <div class="h-10 w-7"><NemotoFlap :id="form.flap" /></div>
              </div>
            </UFormField>

            <div class="flex items-center justify-between">
              <span class="text-sm text-white/70">Enabled</span>
              <USwitch v-model="form.enabled" />
            </div>
            <div class="flex items-center justify-between">
              <span class="text-sm text-white/70">Honor quiet hours</span>
              <USwitch v-model="form.obeyQuietHours" />
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
                :disabled="!form.name.trim() || !form.cron.trim()"
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
import NemotoFlap from '@/components/nemoto/NemotoFlap.vue'
import { usePageHeader } from '@/composables/usePageHeader'
import { useNemotoFlaps } from '@/composables/useNemotoFlaps'
import {
  nemotoApi,
  type NemotoSchedule,
  type NemotoScheduleAction,
  type NemotoPresetListItem,
} from '@/lib/api/nemoto'
import { getErrorMessage } from '@/lib/api/errors'

type ActionType = NemotoScheduleAction['type']

const route = useRoute()
const { setHeader } = usePageHeader()
const { byId, ensureLoaded } = useNemotoFlaps()
const deviceId = computed(() => route.params.id as string)

const schedules = ref<NemotoSchedule[]>([])
const presets = ref<NemotoPresetListItem[]>([])
const loading = ref(true)
const error = ref<string>()
const running = ref<number | null>(null)

const actionTypes: ActionType[] = ['DISPLAY_PRESET', 'DISPLAY_SOLID', 'CLEAR']
const presetItems = computed(() => presets.value.map((p) => ({ label: p.name, value: p.presetId })))

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
  cron: '0 9 * * *',
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
    cron: '0 9 * * *',
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
    cron: s.cron,
    enabled: s.enabled,
    obeyQuietHours: s.obeyQuietHours,
    actionType: s.action.type,
    presetId: s.action.presetId ?? 0,
    flap: s.action.flap ?? 0,
  })
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
      cron: form.cron.trim(),
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
