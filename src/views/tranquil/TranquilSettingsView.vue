<template>
  <PageLayout :on-refresh="load">
    <DangerConfirmModal
      v-model="showFactoryReset"
      title="Factory reset"
      message="Erase all patterns, playlists, and settings on this table and restore defaults? This cannot be undone."
      confirm-text="Factory reset"
      :loading="resetting"
      :error="resetError ?? undefined"
      @confirm="factoryReset"
    />
    <DangerConfirmModal
      v-model="showPreset"
      title="Apply preset"
      :message="`Replace the motion and LED hardware settings with the “${pendingPreset?.name ?? ''}” preset? Your network and time settings are kept.`"
      confirm-text="Apply preset"
      :loading="applyingPreset"
      :error="presetError ?? undefined"
      @confirm="applyPreset"
    />

    <TranquilSessionGate :state="session.state.value" blocking @retry="session.retry">
      <div v-if="loading" class="flex flex-1 items-center justify-center py-20">
        <UIcon name="i-fa6-solid:spinner" class="h-8 w-8 animate-spin text-white/50" />
      </div>

      <div v-else class="flex flex-col gap-6 px-5 py-6 pb-28">
        <UAlert v-if="error" color="error" icon="i-fa6-solid:circle-exclamation" :title="error" />
        <UAlert
          v-if="notice"
          :color="noticeColor"
          :icon="noticeColor === 'warning' ? 'i-fa6-solid:triangle-exclamation' : 'i-fa6-solid:circle-check'"
          :title="notice"
        />

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

        <!-- Calibration -->
        <UCard class="bg-white/5">
          <template #header>
            <div class="flex items-center justify-between">
              <h3 class="font-semibold">Calibration</h3>
              <UBadge :color="homingBadge.color" variant="soft">{{ homingBadge.label }}</UBadge>
            </div>
          </template>
          <div class="flex flex-col gap-4">
            <dl class="grid grid-cols-2 gap-y-2 text-sm">
              <dt class="text-white/50">Stored calibration</dt>
              <dd class="text-right">{{ config?.calibration.is_valid ? 'Valid' : 'None' }}</dd>
              <template v-if="config?.calibration.is_valid">
                <dt class="text-white/50">Theta steps / rotation</dt>
                <dd class="k-num text-right">{{ config.calibration.theta_steps_per_rotation.toLocaleString() }}</dd>
                <dt class="text-white/50">Rho travel (steps)</dt>
                <dd class="k-num text-right">{{ config.calibration.rho_max_steps.toLocaleString() }}</dd>
                <dt class="text-white/50">Calibrated</dt>
                <dd class="text-right">{{ calibratedAt }}</dd>
              </template>
            </dl>
            <p class="text-xs text-white/50">
              Homing finds the zero position using the stored calibration. A full calibration
              re-measures the table's travel and takes longer; use it after moving the table,
              changing motors, or if patterns drift.
            </p>
            <div class="flex flex-wrap gap-3">
              <UButton
                color="primary"
                variant="soft"
                icon="i-fa6-solid:house"
                :loading="homing"
                :disabled="info?.is_homing"
                @click="home(false)"
              >
                Home table
              </UButton>
              <UButton
                color="neutral"
                variant="soft"
                icon="i-fa6-solid:ruler"
                :loading="homing"
                :disabled="info?.is_homing"
                @click="home(true)"
              >
                Full calibration
              </UButton>
              <UButton color="neutral" variant="ghost" icon="i-fa6-solid:eraser" @click="clearCal">
                Clear
              </UButton>
            </div>
          </div>
        </UCard>

        <!-- Motion -->
        <UCard class="bg-white/5">
          <template #header><h3 class="font-semibold">Motion</h3></template>
          <div class="space-y-4">
            <UFormField label="Default speed" help="Path speed new patterns start at. The player's speed slider adjusts it live.">
              <UInputNumber v-model="motion.rho_max_rpm" :min="1" :max="100" :step="1" class="w-full" />
            </UFormField>
            <div class="grid grid-cols-2 gap-4">
              <UFormField label="Theta current (mA)">
                <UInputNumber v-model="motion.theta_current_ma" :min="100" :max="1500" :step="50" class="w-full" />
              </UFormField>
              <UFormField label="Rho current (mA)">
                <UInputNumber v-model="motion.rho_current_ma" :min="100" :max="1500" :step="50" class="w-full" />
              </UFormField>
            </div>
            <UFormField
              label="StallGuard sensitivity"
              help="Sensorless homing threshold (0-255). Higher trips earlier; too high false-triggers, too low never stalls."
            >
              <UInputNumber v-model="motion.stallguard_threshold" :min="0" :max="255" :step="1" class="w-full" />
            </UFormField>

            <UCollapsible v-model:open="advancedOpen" class="rounded-lg border border-white/10">
              <UButton
                color="neutral"
                variant="ghost"
                block
                class="justify-between"
                :trailing-icon="advancedOpen ? 'i-fa6-solid:chevron-up' : 'i-fa6-solid:chevron-down'"
              >
                Advanced motion
              </UButton>
              <template #content>
                <div class="space-y-4 px-3 pb-3 pt-1">
                  <p class="text-xs text-white/50">
                    These shape how the ball accelerates and corners. They apply live to the next
                    move; the defaults suit the stock tables.
                  </p>
                  <UFormField label="Acceleration (steps/s²)" help="Ramp steepness per motor.">
                    <UInputNumber v-model="motion.accel_steps_s2" :min="500" :max="100000" :step="500" class="w-full" />
                  </UFormField>
                  <UFormField
                    label="Cornering limit (steps/s)"
                    help="Max per-axis speed jump at a junction. Higher corners faster but marks the sand."
                  >
                    <UInputNumber v-model="motion.junction_dv_steps_s" :min="10" :max="5000" :step="10" class="w-full" />
                  </UFormField>
                  <UFormField label="Theta spin cap (rot/min)" help="Safety limit on how fast the arm may swing near the centre.">
                    <UInputNumber v-model="motion.theta_max_rot_per_min" :min="0.5" :max="60" :step="0.5" class="w-full" />
                  </UFormField>
                  <UFormField label="Motor idle timeout (s)" help="De-energize the motors after this long idle. 0 keeps them powered.">
                    <UInputNumber v-model="motion.motor_idle_timeout_s" :min="0" :max="86400" :step="5" class="w-full" />
                  </UFormField>
                  <div class="grid grid-cols-2 gap-4">
                    <UFormField label="Steps / rev" help="Needs reboot + re-home.">
                      <UInputNumber v-model="motion.steps_per_rev" :min="1" :max="10000" :step="1" class="w-full" />
                    </UFormField>
                    <UFormField label="Microsteps" help="Needs reboot + re-home.">
                      <USelect v-model="motion.microsteps" :items="MICROSTEP_OPTIONS" class="w-full" />
                    </UFormField>
                  </div>
                </div>
              </template>
            </UCollapsible>
          </div>
        </UCard>

        <!-- LED hardware -->
        <UCard class="bg-white/5">
          <template #header>
            <div class="flex items-center justify-between">
              <h3 class="font-semibold">LED strip</h3>
              <USwitch v-model="ledHw.has_leds" />
            </div>
          </template>
          <div v-if="ledHw.has_leds" class="space-y-4">
            <p class="text-xs text-white/50">
              Changes apply as soon as you save — the strip is rebuilt live. Colour, effect and
              brightness live on the Lighting page.
            </p>
            <UFormField label="LED count">
              <UInputNumber v-model="ledHw.led_count" :min="1" :max="2000" :step="1" class="w-full" />
            </UFormField>
            <div class="grid grid-cols-2 gap-4">
              <UFormField label="Driver IC">
                <USelect v-model="ledHw.ic_type" :items="IC_OPTIONS" value-key="value" class="w-full" />
              </UFormField>
              <UFormField label="Pixel format">
                <USelect v-model="ledHw.format" :items="FORMAT_OPTIONS" value-key="value" class="w-full" />
              </UFormField>
            </div>
            <UFormField label="Colour order" help="Wire order of the R/G/B bytes. Wrong order shows the wrong colours.">
              <USelect v-model="ledHw.color_order" :items="ORDER_OPTIONS" value-key="value" class="w-full" />
            </UFormField>
            <UFormField v-if="ledHw.format === 'rgbcct'">
              <div class="flex items-center justify-between">
                <span class="text-sm">Swap warm / cool white</span>
                <USwitch v-model="ledHw.white_swap" />
              </div>
            </UFormField>
            <UButton color="neutral" variant="soft" size="sm" icon="i-fa6-solid:lightbulb" @click="router.push(`${base}/lighting`)">
              Lighting
            </UButton>
          </div>
          <p v-else class="text-sm text-white/60">No LED strip. Turn on to configure one.</p>
        </UCard>

        <!-- Presets -->
        <UCard class="bg-white/5">
          <template #header><h3 class="font-semibold">Hardware presets</h3></template>
          <div class="space-y-3">
            <p class="text-xs text-white/50">
              Presets set the motion and LED hardware values for a table model in one go.
              <span v-if="config?.active_preset_id">Currently based on: {{ presetName(config.active_preset_id) }}.</span>
            </p>
            <div class="flex flex-col gap-2">
              <UButton
                v-for="p in presets"
                :key="p.id"
                color="neutral"
                :variant="p.id === config?.active_preset_id ? 'soft' : 'ghost'"
                class="justify-between"
                trailing-icon="i-fa6-solid:chevron-right"
                @click="confirmPreset(p)"
              >
                <span class="text-left">
                  <span class="block">{{ p.name }}</span>
                  <span class="block text-xs text-white/50">{{ p.description }}</span>
                </span>
              </UButton>
            </div>
          </div>
        </UCard>

        <!-- Network -->
        <UCard class="bg-white/5">
          <template #header><h3 class="font-semibold">Network</h3></template>
          <UFormField label="Hostname" help="Reachable on your network as <hostname>.local">
            <UInput v-model="system.wifi_hostname" size="lg" :maxlength="63" class="w-full" />
          </UFormField>
        </UCard>

        <!-- Time -->
        <UCard class="bg-white/5">
          <template #header><h3 class="font-semibold">Time</h3></template>
          <div class="space-y-4">
            <UFormField>
              <div class="flex items-center justify-between">
                <span class="text-sm">Set timezone automatically</span>
                <USwitch v-model="system.auto_timezone" />
              </div>
            </UFormField>
            <UFormField v-if="!system.auto_timezone" label="Timezone">
              <USelectMenu
                v-model="system.timezone"
                :items="timezoneNames"
                class="w-full"
                :search-input="{ placeholder: 'Search timezones…' }"
              />
            </UFormField>
            <UFormField label="NTP server">
              <UInput v-model="system.ntp_server" size="lg" class="w-full" />
            </UFormField>
          </div>
        </UCard>

        <!-- System -->
        <UCard class="bg-white/5">
          <template #header><h3 class="font-semibold">System</h3></template>
          <dl class="grid grid-cols-2 gap-y-2 text-sm">
            <dt class="text-white/50">Model</dt>
            <dd class="text-right">{{ about?.model ?? info?.hardware_model ?? '—' }}</dd>
            <dt class="text-white/50">Firmware</dt>
            <dd class="text-right">{{ about?.version ?? info?.firmware_version ?? '—' }}</dd>
            <dt class="text-white/50">Device ID</dt>
            <dd class="truncate text-right font-mono text-xs">{{ info?.device_id || '—' }}</dd>
            <dt class="text-white/50">IP address</dt>
            <dd class="k-num text-right">{{ info?.ip_address || '—' }}</dd>
            <dt class="text-white/50">Wi-Fi signal</dt>
            <dd class="k-num text-right">{{ rssiLabel }}</dd>
            <dt class="text-white/50">Uptime</dt>
            <dd class="k-num text-right">{{ uptimeLabel }}</dd>
            <dt class="text-white/50">Free memory</dt>
            <dd class="k-num text-right">{{ freeHeapKb }}</dd>
          </dl>
          <div class="mt-4">
            <UButton color="neutral" variant="soft" icon="i-fa6-solid:power-off" :loading="rebooting" @click="reboot">
              Restart table
            </UButton>
          </div>
        </UCard>

        <!-- Danger -->
        <UCard class="border-error/20 bg-error/5">
          <template #header><h3 class="font-semibold text-error">Danger zone</h3></template>
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

      <Teleport v-if="!loading" to="#app-footer">
        <div class="border-t border-white/10 bg-black/80 p-3 backdrop-blur">
          <UButton
            color="primary"
            block
            size="lg"
            :loading="saving"
            :disabled="saving || !hasChanges"
            @click="save"
          >
            {{ hasChanges ? 'Save changes' : 'No changes' }}
          </UButton>
        </div>
      </Teleport>
    </TranquilSessionGate>
  </PageLayout>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import PageLayout from '@/layouts/PageLayout.vue'
import DangerConfirmModal from '@/components/DangerConfirmModal.vue'
import TranquilSessionGate from '@/components/tranquil/TranquilSessionGate.vue'
import { usePageHeader } from '@/composables/usePageHeader'
import { useTranquilSession } from '@/composables/useTranquilSession'
import { formatTranquilError } from '@/lib/tranquil/local/errors'
import type {
  AboutResponse,
  DeviceConfig,
  LEDHardwareConfig,
  MotionConfig,
  PresetInfo,
  SystemConfig,
  SystemInfo,
} from '@/lib/tranquil/local/types'

const router = useRouter()
const { setHeader } = usePageHeader()
const session = useTranquilSession()
const { store, base, isActive } = session

const MICROSTEP_OPTIONS = [1, 2, 4, 8, 16, 32, 64, 128, 256]
const IC_OPTIONS = [
  { label: 'WS2812 (RGB)', value: 'ws2812' },
  { label: 'SK6812 (RGBW)', value: 'sk6812' },
  { label: 'FW1906 (RGB + warm/cool white)', value: 'fw1906' },
]
const FORMAT_OPTIONS = [
  { label: 'RGB', value: 'rgb' },
  { label: 'RGBW', value: 'rgbw' },
  { label: 'RGBCCT (dual white)', value: 'rgbcct' },
]
const ORDER_OPTIONS = ['rgb', 'rbg', 'grb', 'gbr', 'brg', 'bgr'].map((v) => ({
  label: v.toUpperCase(),
  value: v,
}))

const loading = ref(true)
const saving = ref(false)
const homing = ref(false)
const stopping = ref(false)
const rebooting = ref(false)
const resetting = ref(false)
const applyingPreset = ref(false)
const error = ref<string | null>(null)
const resetError = ref<string | null>(null)
const presetError = ref<string | null>(null)
const notice = ref<string | null>(null)
const noticeColor = ref<'success' | 'warning'>('success')
const showFactoryReset = ref(false)
const showPreset = ref(false)
const pendingPreset = ref<PresetInfo | null>(null)
const advancedOpen = ref(false)

const info = ref<SystemInfo | null>(null)
const about = ref<AboutResponse | null>(null)
const config = ref<DeviceConfig | null>(null)
const presets = ref<PresetInfo[]>([])
const timezoneNames = ref<string[]>([])

// Drafts. Nothing is sent until Save; `hasChanges` compares against the
// snapshot taken at load so the button only lights when something differs.
const system = reactive<SystemConfig>({
  auto_timezone: true,
  timezone: '',
  ntp_server: '',
  wifi_hostname: '',
})
const motion = reactive<MotionConfig>({
  steps_per_rev: 200,
  microsteps: 16,
  rho_max_rpm: 15,
  theta_current_ma: 400,
  rho_current_ma: 400,
  stallguard_threshold: 30,
  accel_steps_s2: 10000,
  junction_dv_steps_s: 250,
  theta_max_rot_per_min: 12,
  motor_idle_timeout_s: 30,
})
const ledHw = reactive<Required<Pick<LEDHardwareConfig, 'has_leds' | 'led_count' | 'white_swap'>> & {
  ic_type: string
  format: string
  color_order: string
}>({
  has_leds: true,
  led_count: 84,
  ic_type: 'fw1906',
  format: 'rgbcct',
  color_order: 'rgb',
  white_swap: true,
})
let snapshot = ''
const draftKey = () => JSON.stringify({ system, motion, ledHw })
const hasChanges = computed(() => snapshot !== '' && draftKey() !== snapshot)

const homingBadge = computed(() => {
  if (info?.value?.is_homing) return { color: 'warning' as const, label: 'Homing…' }
  if (info?.value?.is_homed) return { color: 'success' as const, label: 'Homed' }
  return { color: 'warning' as const, label: 'Not homed' }
})
const calibratedAt = computed(() => {
  const ts = config.value?.calibration.timestamp ?? 0
  return ts > 0 ? new Date(ts * 1000).toLocaleString() : 'Unknown'
})
const freeHeapKb = computed(() =>
  info.value ? `${Math.round(info.value.free_heap / 1024).toLocaleString()} KB` : '—',
)
const rssiLabel = computed(() => {
  const r = info.value?.wifi_rssi ?? 0
  if (!r) return '—'
  const q = r >= -55 ? 'Excellent' : r >= -67 ? 'Good' : r >= -75 ? 'Fair' : 'Weak'
  return `${r} dBm · ${q}`
})
const uptimeLabel = computed(() => {
  const s = info.value?.uptime_s ?? 0
  if (!s) return '—'
  const d = Math.floor(s / 86400)
  const h = Math.floor((s % 86400) / 3600)
  const m = Math.floor((s % 3600) / 60)
  return d ? `${d}d ${h}h` : h ? `${h}h ${m}m` : `${m}m`
})

function presetName(id: string): string {
  return presets.value.find((p) => p.id === id)?.name ?? id
}

function showNotice(text: string, color: 'success' | 'warning' = 'success') {
  notice.value = text
  noticeColor.value = color
  error.value = null
}

function applyConfig(cfg: DeviceConfig) {
  config.value = cfg
  Object.assign(motion, cfg.motion)
  ledHw.has_leds = cfg.led.has_leds
  ledHw.led_count = cfg.led.led_count
  ledHw.ic_type = cfg.led.ic_type ?? 'ws2812'
  ledHw.format = cfg.led.format ?? (cfg.led.is_rgbw ? 'rgbw' : 'rgb')
  ledHw.color_order = cfg.led.color_order ?? 'grb'
  ledHw.white_swap = cfg.led.white_swap ?? false
}

async function load() {
  if (!isActive.value) {
    loading.value = false
    return
  }
  loading.value = true
  error.value = null
  try {
    const api = store.api()
    const [sysCfg, devCfg, sysInfo, aboutRes, presetsRes] = await Promise.all([
      api.system.getConfig(),
      api.deviceConfig.get(),
      api.system.getInfo().catch(() => null),
      api.system.getAbout().catch(() => null),
      api.presets.list().catch(() => null),
    ])
    Object.assign(system, sysCfg)
    applyConfig(devCfg)
    info.value = sysInfo
    about.value = aboutRes
    presets.value = presetsRes?.presets ?? []
    snapshot = draftKey()
    // Timezone list is only needed for the manual picker; best-effort.
    api.system
      .getTimezones()
      .then((tzs) => (timezoneNames.value = tzs.map((t) => t.name)))
      .catch(() => {})
  } catch (e) {
    error.value = formatTranquilError(e)
    snapshot = ''
  } finally {
    loading.value = false
  }
}

async function refreshInfo() {
  try {
    info.value = await store.api().system.getInfo()
  } catch {
    /* keep the last reading */
  }
}

async function save() {
  if (!hasChanges.value) return
  saving.value = true
  error.value = null
  notice.value = null
  const before = JSON.parse(snapshot) as { system: SystemConfig; motion: MotionConfig; ledHw: typeof ledHw }
  try {
    const api = store.api()
    const jobs: Promise<unknown>[] = []

    // Only the groups that changed are sent; the device applies motion and LED
    // hardware live, and reports whether a reboot is needed.
    const systemChanged = JSON.stringify(system) !== JSON.stringify(before.system)
    if (systemChanged) {
      jobs.push(
        api.system.setConfig({
          wifi_hostname: system.wifi_hostname,
          auto_timezone: system.auto_timezone,
          timezone: system.timezone,
          ntp_server: system.ntp_server,
        }),
      )
    }

    const motionChanged = JSON.stringify(motion) !== JSON.stringify(before.motion)
    const ledChanged = JSON.stringify(ledHw) !== JSON.stringify(before.ledHw)
    let result: DeviceConfig | null = null
    if (motionChanged || ledChanged) {
      const patch: Parameters<typeof api.deviceConfig.patch>[0] = {}
      if (motionChanged) patch.motion = { ...motion }
      if (ledChanged) {
        patch.led = {
          has_leds: ledHw.has_leds,
          led_count: ledHw.led_count,
          ic_type: ledHw.ic_type,
          format: ledHw.format,
          color_order: ledHw.color_order,
          white_swap: ledHw.white_swap,
        }
      }
      jobs.push(api.deviceConfig.patch(patch).then((r) => (result = r)))
    }

    await Promise.all(jobs)
    if (result) applyConfig(result)
    snapshot = draftKey()
    const saved = result as DeviceConfig | null
    if (saved?.reboot_required) {
      showNotice('Saved. Steps or microsteps changed: restart the table and run a full calibration.', 'warning')
    } else if (ledChanged) {
      showNotice('Saved. The LED strip has been reconfigured.')
    } else {
      showNotice('Settings saved.')
    }
    if (systemChanged && system.wifi_hostname !== before.system.wifi_hostname) {
      showNotice('Saved. The new hostname applies after the next restart.', 'warning')
    }
  } catch (e) {
    error.value = formatTranquilError(e)
  } finally {
    saving.value = false
  }
}

async function emergencyStop() {
  stopping.value = true
  error.value = null
  notice.value = null
  try {
    await store.stop(true)
    showNotice('Table stopped.')
  } catch (e) {
    error.value = formatTranquilError(e)
  } finally {
    stopping.value = false
  }
}

async function home(fullCalibration: boolean) {
  homing.value = true
  error.value = null
  notice.value = null
  try {
    const res = await store.api().system.home(fullCalibration)
    if (!res.success) {
      error.value = res.error || 'Homing could not start.'
      return
    }
    showNotice(fullCalibration ? 'Full calibration started…' : 'Homing started…')
    // Poll until the run finishes; the device pushes SystemInfo too, but the
    // settings page reads it over REST.
    for (let i = 0; i < 90; i++) {
      await new Promise((r) => setTimeout(r, 2000))
      await refreshInfo()
      if (!info.value?.is_homing) break
    }
    if (info.value?.is_homed) {
      showNotice('Homing complete.')
      // Calibration values may have changed after a full run.
      try {
        applyConfig(await store.api().deviceConfig.get())
        snapshot = draftKey()
      } catch {
        /* keep current */
      }
    } else if (!info.value?.is_homing) {
      error.value = 'Homing did not complete. Check the table and try again.'
    }
  } catch (e) {
    error.value = formatTranquilError(e)
  } finally {
    homing.value = false
  }
}

async function clearCal() {
  error.value = null
  notice.value = null
  try {
    await store.api().deviceConfig.clearCalibration()
    applyConfig(await store.api().deviceConfig.get())
    snapshot = draftKey()
    showNotice('Calibration cleared. Run a full calibration.', 'warning')
  } catch (e) {
    error.value = formatTranquilError(e)
  }
}

function confirmPreset(p: PresetInfo) {
  pendingPreset.value = p
  presetError.value = null
  showPreset.value = true
}

async function applyPreset() {
  if (!pendingPreset.value) return
  applyingPreset.value = true
  presetError.value = null
  try {
    const cfg = await store.api().presets.load(pendingPreset.value.id)
    applyConfig(cfg)
    snapshot = draftKey()
    showPreset.value = false
    showNotice(
      cfg.reboot_required
        ? `Preset applied. Restart the table and run a full calibration.`
        : `Preset "${pendingPreset.value.name}" applied.`,
      cfg.reboot_required ? 'warning' : 'success',
    )
  } catch (e) {
    presetError.value = formatTranquilError(e)
  } finally {
    applyingPreset.value = false
  }
}

async function reboot() {
  rebooting.value = true
  error.value = null
  notice.value = null
  try {
    await store.api().system.reboot()
    showNotice('Restarting… the table will be back in a moment.')
  } catch (e) {
    error.value = formatTranquilError(e)
  } finally {
    rebooting.value = false
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
    backRoute: base,
  })
  void load()
})
watch(isActive, (active) => {
  if (active) void load()
})
</script>
