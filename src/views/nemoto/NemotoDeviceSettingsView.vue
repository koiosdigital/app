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
            <UInput v-model="form.displayEffectId" placeholder="e.g. diagonal" />
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
            <UInputNumber v-model="w.startHour" :min="0" :max="23" class="w-20" />
            <span>:</span>
            <UInputNumber v-model="w.startMin" :min="0" :max="59" class="w-20" />
            <span class="px-1 text-white/50">to</span>
            <UInputNumber v-model="w.endHour" :min="0" :max="23" class="w-20" />
            <span>:</span>
            <UInputNumber v-model="w.endMin" :min="0" :max="59" class="w-20" />
            <div class="flex-1" />
            <USwitch v-model="w.enabled" />
          </div>
        </div>
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
import { nemotoApi, type NemotoQuietWindow } from '@/lib/api/nemoto'
import { getErrorMessage } from '@/lib/api/errors'

const route = useRoute()
const router = useRouter()
const { setHeader } = usePageHeader()
const deviceId = computed(() => route.params.id as string)

const dayLabels = ['S', 'M', 'T', 'W', 'T', 'F', 'S']
const cycleTypes: Array<'PARTIAL' | 'FULL'> = ['PARTIAL', 'FULL']

const loading = ref(true)
const error = ref<string>()
const saving = ref(false)
const saveError = ref<string>()

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
function addWindow() {
  form.quietWindows.push({
    dayMask: 0,
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
    const [config, presets] = await Promise.all([
      nemotoApi.getConfig(deviceId.value),
      nemotoApi.listPresets(deviceId.value),
    ])
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
