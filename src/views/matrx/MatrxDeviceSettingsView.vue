<template>
  <div class="flex min-h-screen flex-col bg-zinc-950">
    <!-- Header -->
    <header
      class="sticky top-0 z-10 border-b border-white/10 bg-zinc-950/95 backdrop-blur px-5 py-4"
    >
      <div class="flex items-center gap-4">
        <UButton
          color="neutral"
          variant="ghost"
          icon="i-lucide-arrow-left"
          square
          @click="router.back()"
        />
        <h1 class="text-xl font-semibold">Device Settings</h1>
      </div>
    </header>

    <!-- Loading State -->
    <div v-if="loading" class="flex flex-1 items-center justify-center">
      <UIcon name="i-lucide-loader-2" class="h-8 w-8 animate-spin text-white/50" />
    </div>

    <!-- Error State -->
    <div v-else-if="error" class="flex flex-1 items-center justify-center p-5">
      <UCard class="w-full max-w-md border border-red-500/20 bg-red-500/10">
        <div class="space-y-4 text-center">
          <UIcon name="i-lucide-alert-circle" class="h-12 w-12 text-red-400 mx-auto" />
          <p class="text-red-400">{{ error }}</p>
          <UButton color="neutral" variant="soft" @click="loadDevice">Retry</UButton>
        </div>
      </UCard>
    </div>

    <!-- Settings Content -->
    <div v-else-if="device" class="flex flex-1 flex-col">
      <div class="flex-1 px-5 py-6 space-y-6">
        <!-- Display Name -->
        <div class="space-y-2">
          <label for="display-name" class="block text-sm font-medium text-white/70">
            Display Name
          </label>
          <UInput
            id="display-name"
            v-model="displayName"
            placeholder="Enter device name"
            size="lg"
          />
        </div>

        <!-- Brightness -->
        <div class="space-y-3">
          <div class="flex items-center justify-between">
            <label class="block text-sm font-medium text-white/70">Brightness</label>
            <span class="text-sm text-white/50">{{ brightnessPercent }}%</span>
          </div>
          <input
            type="range"
            min="0"
            max="255"
            v-model.number="screenBrightness"
            :disabled="autoBrightnessEnabled"
            class="w-full h-2 bg-white/10 rounded-lg appearance-none cursor-pointer accent-primary-500 disabled:opacity-50 disabled:cursor-not-allowed"
          />
          <div
            v-if="autoBrightnessEnabled"
            class="flex items-center gap-2 text-xs text-white/50"
          >
            <UIcon name="i-lucide-info" class="h-3 w-3" />
            Brightness is controlled automatically
          </div>
        </div>

        <!-- Auto Brightness (only show if device has light sensor) -->
        <div v-if="hasLightSensor" class="space-y-4">
          <div class="flex items-center justify-between py-2">
            <div>
              <span class="text-sm font-medium text-white/70">Auto Brightness</span>
              <p class="text-xs text-white/50">Adjust brightness based on ambient light</p>
            </div>
            <USwitch v-model="autoBrightnessEnabled" />
          </div>

          <!-- Screen Off Lux (only show when auto brightness is enabled) -->
          <div v-if="autoBrightnessEnabled" class="space-y-3 border-t border-white/10 pt-4">
            <div class="flex items-center justify-between">
              <label class="block text-sm font-medium text-white/70">Screen Off Threshold</label>
              <span class="text-sm text-white/50">{{ screenOffLux }} lux</span>
            </div>
            <input
              type="range"
              min="0"
              max="20"
              v-model.number="screenOffLux"
              class="w-full h-2 bg-white/10 rounded-lg appearance-none cursor-pointer accent-primary-500"
            />
            <div class="flex items-start gap-2 text-xs text-white/50">
              <UIcon name="i-lucide-info" class="h-3 w-3 mt-0.5 shrink-0" />
              <span>
                The screen will turn off when ambient light drops below this level.
                Lower values mean the screen stays on in darker conditions.
              </span>
            </div>
          </div>
        </div>

        <!-- Device Info -->
        <div class="border-t border-white/10 pt-6 space-y-3">
          <h3 class="text-sm font-medium text-white/50 uppercase tracking-wider">Device Info</h3>
          <div class="space-y-2 text-sm">
            <div class="flex justify-between">
              <span class="text-white/50">Device ID</span>
              <span class="text-white/70 font-mono text-xs">{{ device.id }}</span>
            </div>
            <div class="flex justify-between">
              <span class="text-white/50">Resolution</span>
              <span class="text-white/70">{{ deviceWidth }}x{{ deviceHeight }} pixels</span>
            </div>
            <div class="flex justify-between">
              <span class="text-white/50">Light Sensor</span>
              <span class="text-white/70">{{ hasLightSensor ? 'Yes' : 'No' }}</span>
            </div>
            <div class="flex justify-between">
              <span class="text-white/50">Status</span>
              <UBadge :color="device.online ? 'success' : 'neutral'" variant="soft">
                {{ device.online ? 'Online' : 'Offline' }}
              </UBadge>
            </div>
          </div>
        </div>
      </div>

      <!-- Footer -->
      <footer
        class="sticky bottom-0 border-t border-white/10 bg-zinc-950/95 backdrop-blur px-5 py-4"
      >
        <div v-if="saveError" class="mb-3">
          <UAlert color="error" icon="i-lucide-alert-circle" :title="saveError" />
        </div>
        <UButton
          color="primary"
          size="lg"
          block
          :loading="saving"
          :disabled="saving || !hasChanges"
          @click="saveSettings"
        >
          Save Changes
        </UButton>
      </footer>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useHead } from '@unhead/vue'
import { devicesApi } from '@/lib/api/devices'
import { getErrorMessage } from '@/lib/api/errors'
import type { MatrxDevice } from '@/lib/api/mappers/deviceMapper'

const router = useRouter()
const route = useRoute()

const deviceId = computed(() => route.params.id as string)

const device = ref<MatrxDevice | null>(null)
const loading = ref(true)
const error = ref<string>()
const saving = ref(false)
const saveError = ref<string>()

// Editable settings
const displayName = ref('')
const screenBrightness = ref(200)
const autoBrightnessEnabled = ref(false)
const screenOffLux = ref(3)

// Original values for change detection
const originalDisplayName = ref('')
const originalScreenBrightness = ref(200)
const originalAutoBrightnessEnabled = ref(false)
const originalScreenOffLux = ref(3)

const deviceWidth = computed(() => device.value?.settings?.width ?? 64)
const deviceHeight = computed(() => device.value?.settings?.height ?? 32)
const hasLightSensor = computed(() => device.value?.settings?.hasLightSensor ?? false)

const brightnessPercent = computed(() => Math.round((screenBrightness.value / 255) * 100))

const hasChanges = computed(() => {
  return (
    displayName.value !== originalDisplayName.value ||
    screenBrightness.value !== originalScreenBrightness.value ||
    autoBrightnessEnabled.value !== originalAutoBrightnessEnabled.value ||
    screenOffLux.value !== originalScreenOffLux.value
  )
})

useHead({
  title: 'Device Settings | Koios',
  meta: [{ name: 'description', content: 'Configure your Matrix device settings' }],
})

async function loadDevice() {
  loading.value = true
  error.value = undefined

  try {
    const deviceData = await devicesApi.getDevice(deviceId.value)

    if (!deviceData) {
      error.value = 'Device not found'
      return
    }

    if (deviceData.type !== 'MATRX') {
      error.value = 'This is not a Matrix device'
      return
    }

    device.value = deviceData as MatrxDevice

    // Initialize form values
    const settings = device.value.settings
    displayName.value = settings?.displayName ?? ''
    screenBrightness.value = settings?.typeSettings?.screenBrightness ?? 200
    autoBrightnessEnabled.value = settings?.typeSettings?.autoBrightnessEnabled ?? false
    screenOffLux.value = settings?.typeSettings?.screenOffLux ?? 3

    // Store original values
    originalDisplayName.value = displayName.value
    originalScreenBrightness.value = screenBrightness.value
    originalAutoBrightnessEnabled.value = autoBrightnessEnabled.value
    originalScreenOffLux.value = screenOffLux.value
  } catch (err) {
    error.value = getErrorMessage(err, 'Failed to load device')
    console.error('Failed to load device:', err)
  } finally {
    loading.value = false
  }
}

async function saveSettings() {
  saving.value = true
  saveError.value = undefined

  try {
    // Build settings update payload
    const displayNameChanged = displayName.value !== originalDisplayName.value
    const typeSettingsChanged =
      screenBrightness.value !== originalScreenBrightness.value ||
      autoBrightnessEnabled.value !== originalAutoBrightnessEnabled.value ||
      screenOffLux.value !== originalScreenOffLux.value

    if (displayNameChanged || typeSettingsChanged) {
      await devicesApi.updateMatrxSettings(deviceId.value, {
        ...(displayNameChanged && { displayName: displayName.value }),
        ...(typeSettingsChanged && {
          typeSettings: {
            screenBrightness: screenBrightness.value,
            autoBrightnessEnabled: autoBrightnessEnabled.value,
            screenOffLux: screenOffLux.value,
          },
        }),
      })
    }

    // Update original values after successful save
    originalDisplayName.value = displayName.value
    originalScreenBrightness.value = screenBrightness.value
    originalAutoBrightnessEnabled.value = autoBrightnessEnabled.value
    originalScreenOffLux.value = screenOffLux.value

    router.back()
  } catch (err) {
    saveError.value = getErrorMessage(err, 'Failed to save settings')
    console.error('Failed to save settings:', err)
  } finally {
    saving.value = false
  }
}

// Reset screenBrightness to device's actual value when auto brightness is disabled
watch(autoBrightnessEnabled, (enabled) => {
  if (!enabled && device.value?.settings?.typeSettings?.screenBrightness) {
    screenBrightness.value = device.value.settings.typeSettings.screenBrightness
  }
})

onMounted(() => {
  loadDevice()
})
</script>
