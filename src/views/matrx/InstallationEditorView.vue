<template>
  <div class="flex min-h-screen flex-col bg-zinc-950">
    <!-- Header -->
    <header
      class="sticky top-0 z-10 border-b border-white/10 bg-zinc-950/95 backdrop-blur px-5 py-4"
    >
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-4">
          <UButton
            color="neutral"
            variant="ghost"
            icon="i-fa6-solid:arrow-left"
            square
            @click="router.back()"
          />
          <h1 class="text-xl font-semibold truncate">{{ appName }}</h1>
        </div>
        <div v-if="mode === 'edit'" class="flex items-center gap-1">
          <UButton
            color="neutral"
            variant="ghost"
            :icon="pinnedByUser ? 'i-fa6-solid:thumbtack' : 'i-fa6-regular:thumbtack'"
            square
            :loading="pinning"
            :class="{ 'text-primary-400': pinnedByUser }"
            @click="togglePin"
          />
          <UButton
            color="error"
            variant="ghost"
            icon="i-fa6-solid:trash"
            square
            @click="showDeleteModal = true"
          />
        </div>
      </div>
    </header>

    <!-- Delete Confirmation Modal -->
    <DangerConfirmModal
      v-model="showDeleteModal"
      title="Delete Installation"
      :message="`Are you sure you want to remove '${appName}' from this device? This action cannot be undone.`"
      confirm-text="Delete"
      :loading="deleting"
      @confirm="handleDelete"
    />

    <!-- Loading State -->
    <div v-if="initialLoading" class="flex flex-1 items-center justify-center">
      <UIcon name="i-fa6-solid:spinner" class="h-8 w-8 animate-spin text-white/50" />
    </div>

    <!-- Error State -->
    <div v-else-if="loadError" class="flex flex-1 items-center justify-center p-5">
      <div class="text-center space-y-4">
        <UIcon name="i-fa6-solid:circle-exclamation" class="h-12 w-12 text-red-400 mx-auto" />
        <p class="text-red-400">{{ loadError }}</p>
        <UButton color="neutral" variant="soft" @click="loadData">Retry</UButton>
      </div>
    </div>

    <!-- Main Content -->
    <div v-else class="flex flex-1 flex-col">
      <!-- Preview Section -->
      <section class="flex flex-col items-center gap-4 px-5 py-8 border-b border-white/10">
        <p class="text-xs uppercase tracking-widest text-white/50">Preview</p>

        <!-- Preview with base64 image -->
        <div v-if="previewBase64" class="relative">
          <MatrixDevicePreview
            :src="`data:image/webp;base64,${previewBase64}`"
            :width="deviceWidth"
            :height="deviceHeight"
            :dot-size="4"
            :dot-gap="1"
            :show-frame="true"
          />
          <div
            v-if="previewLoading"
            class="absolute inset-0 flex items-center justify-center bg-black/50 rounded-lg"
          >
            <UIcon name="i-fa6-solid:spinner" class="h-6 w-6 animate-spin text-white/70" />
          </div>
        </div>

        <!-- Preview loading state -->
        <div
          v-else-if="previewLoading"
          class="inline-flex items-center justify-center p-3 bg-zinc-800 rounded-lg"
        >
          <div
            class="flex items-center justify-center bg-black rounded-sm"
            :style="previewPlaceholderStyle"
          >
            <UIcon name="i-fa6-solid:spinner" class="h-6 w-6 animate-spin text-white/50" />
          </div>
        </div>

        <!-- HTTP error state (non-200 response) -->
        <div
          v-else-if="previewErrorType === 'http'"
          class="inline-flex items-center justify-center p-3 bg-zinc-800 rounded-lg"
        >
          <div
            class="flex flex-col items-center justify-center gap-1 bg-black rounded-sm"
            :style="previewPlaceholderStyle"
          >
            <UIcon name="i-fa6-solid:circle-exclamation" class="h-6 w-6 text-red-500" />
            <span class="text-xs text-red-500 text-center px-2">{{ previewError }}</span>
          </div>
        </div>

        <!-- Setup required state (render failed due to incomplete config) -->
        <div
          v-else-if="previewErrorType === 'setup'"
          class="inline-flex items-center justify-center p-3 bg-zinc-800 rounded-lg"
        >
          <div
            class="flex flex-col items-center justify-center gap-1 bg-black rounded-sm"
            :style="previewPlaceholderStyle"
          >
            <UIcon name="i-fa6-solid:gear" class="h-6 w-6 text-amber-500" />
            <span class="text-xs text-amber-500 text-center px-2">Complete setup below</span>
          </div>
        </div>

        <!-- Empty state (200 but no render output) -->
        <div
          v-else-if="previewErrorType === 'empty'"
          class="inline-flex items-center justify-center p-3 bg-zinc-800 rounded-lg"
        >
          <div
            class="flex flex-col items-center justify-center gap-1 bg-black rounded-sm"
            :style="previewPlaceholderStyle"
          >
            <UIcon name="i-fa6-regular:image" class="h-6 w-6 text-white/50" />
            <span class="text-xs text-white/50 text-center px-2">Nothing to show</span>
          </div>
        </div>

        <!-- Default placeholder -->
        <div v-else class="inline-flex items-center justify-center p-3 bg-zinc-800 rounded-lg">
          <div
            class="flex items-center justify-center bg-black rounded-sm"
            :style="previewPlaceholderStyle"
          >
            <UIcon name="i-fa6-regular:image" class="h-6 w-6 text-white/30" />
          </div>
        </div>
      </section>

      <!-- Schema Form Section -->
      <section class="flex-1 px-5 py-6">
        <SchemaForm
          v-if="schema"
          :schema="schema.schema"
          :values="formState.values.value"
          :errors="formState.errors.value"
          :app-id="resolvedAppId"
          :device-id="props.deviceId"
          :installation-id="props.installationId"
          :mode="props.mode"
          :display-time="displayTime"
          :skipped-by-user="skippedByUser"
          @update:value="handleFieldUpdate"
          @handler-result="handleHandlerResult"
        />

        <div v-if="!schema?.schema?.length" class="text-center text-white/50 py-8">
          This app has no configuration options.
        </div>

        <!-- Display Time Section -->
        <div class="border-t border-white/10 pt-4 mt-4">
          <label class="block text-sm font-medium text-white/70 mb-2">Display Time</label>
          <USelectMenu
            v-model="displayTime"
            :items="displayTimeItems"
            value-key="value"
            class="w-full"
          >
            <template #item="{ item }">
              <span>{{ item.label }}</span>
            </template>
          </USelectMenu>
        </div>

        <!-- Skip Toggle (edit mode only) -->
        <div
          v-if="mode === 'edit'"
          class="flex items-center justify-between pt-4 mt-4 border-t border-white/10"
        >
          <div>
            <span class="text-sm font-medium text-white/70">Skip this app</span>
            <p class="text-xs text-white/50">App won't be shown in rotation</p>
          </div>
          <USwitch v-model="skippedByUser" />
        </div>
      </section>

      <!-- Footer Actions -->
      <footer
        class="sticky bottom-0 border-t border-white/10 bg-zinc-950/95 backdrop-blur px-5 py-4"
      >
        <div v-if="saveError" class="mb-3">
          <UAlert color="error" icon="i-fa6-solid:circle-exclamation" :title="saveError" />
        </div>
        <UButton
          color="primary"
          size="lg"
          block
          :loading="saving"
          :disabled="saving"
          @click="handleSave"
        >
          {{ mode === 'install' ? 'Install App' : 'Save Changes' }}
        </UButton>
      </footer>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, toRef } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useHead } from '@unhead/vue'
import { Capacitor } from '@capacitor/core'
import MatrixDevicePreview from '@/components/MatrixDevicePreview.vue'
import SchemaForm from '@/components/schema/SchemaForm.vue'
import DangerConfirmModal from '@/components/DangerConfirmModal.vue'
import { appsApi, type AppSchema, type AppManifest } from '@/lib/api/apps'
import { devicesApi, type InstallationResponse } from '@/lib/api/devices'
import { getErrorMessage } from '@/lib/api/errors'
import { useSchemaForm } from '@/composables/useSchemaForm'
import { useSchemaPreview } from '@/composables/useSchemaPreview'
import { useOAuthFlow } from '@/composables/useOAuthFlow'
import { ENV } from '@/config/environment'
import type { components } from '@/types/api'

type MatrxDevice = components['schemas']['MatrxDeviceResponseDto']

const props = defineProps<{
  deviceId: string
  appId?: string
  installationId?: string
  mode: 'install' | 'edit'
}>()

const router = useRouter()
const route = useRoute()

// Data refs
const app = ref<AppManifest | null>(null)
const device = ref<MatrxDevice | null>(null)
const schema = ref<AppSchema | null>(null)
const installation = ref<InstallationResponse | null>(null)
const maxSortOrder = ref(0)

// State refs
const initialLoading = ref(true)
const loadError = ref<string>()
const saving = ref(false)
const saveError = ref<string>()
const showDeleteModal = ref(false)
const deleting = ref(false)
const dataLoaded = ref(false)

// Installation settings
const displayTime = ref(10)
const skippedByUser = ref(false)
const pinnedByUser = ref(false)
const pinning = ref(false)

// Display time options
const displayTimeItems = [
  { label: '5 seconds', value: 5 },
  { label: '10 seconds', value: 10 },
  { label: '15 seconds', value: 15 },
  { label: '30 seconds', value: 30 },
  { label: '60 seconds', value: 60 },
]

// Computed
const resolvedAppId = computed(() => props.appId || installation.value?.config?.app_id || '')
const appName = computed(() => app.value?.name || 'App')
const deviceWidth = computed(() => device.value?.settings?.width ?? 64)
const deviceHeight = computed(() => device.value?.settings?.height ?? 32)

const previewPlaceholderStyle = computed(() => {
  const dotSize = 4
  const dotGap = 1
  const cellSize = dotSize + dotGap
  return {
    width: `${deviceWidth.value * cellSize - dotGap}px`,
    height: `${deviceHeight.value * cellSize - dotGap}px`,
  }
})

// Form state
const schemaRef = computed(() => schema.value?.schema)
const formState = useSchemaForm(schemaRef)

// Preview - use static preview until interaction in install mode
// Only enabled after data is loaded to prevent racing with config initialization
const {
  previewBase64,
  loading: previewLoading,
  error: previewError,
  errorType: previewErrorType,
  refresh: refreshPreview,
} = useSchemaPreview(
  toRef(() => resolvedAppId.value),
  formState.values,
  {
    width: deviceWidth,
    height: deviceHeight,
    deviceId: toRef(() => props.deviceId),
    debounceMs: 500,
    useStaticPreviewUntilInteraction: props.mode === 'install',
    enabled: dataLoaded,
  },
)

useHead({
  title: computed(() => `${appName.value} | Koios Digital`),
})

async function loadData() {
  initialLoading.value = true
  loadError.value = undefined

  try {
    // Load device first
    const deviceData = await devicesApi.getDevice(props.deviceId)
    if (deviceData?.type !== 'MATRX') {
      throw new Error('Invalid device type')
    }
    device.value = deviceData

    if (props.mode === 'edit' && props.installationId) {
      // Edit mode: load installation first
      const installationData = await devicesApi.getInstallation(
        props.deviceId,
        props.installationId,
      )
      installation.value = installationData ?? null

      if (!installation.value?.config) {
        throw new Error('Installation not found')
      }

      // Initialize form with saved config BEFORE setting schema
      // This prevents the schema watcher from overwriting with defaults
      if (installation.value.config.params) {
        formState.initializeFromConfig(installation.value.config.params as Record<string, unknown>)
      }

      // Load app and schema
      const [appData, schemaData] = await Promise.all([
        appsApi.getApp(installation.value.config.app_id),
        appsApi.getAppSchema(installation.value.config.app_id),
      ])

      app.value = appData ?? null
      schema.value = schemaData ?? null

      // Initialize installation settings
      displayTime.value = installation.value.displayTime ?? 10
      skippedByUser.value = installation.value.skippedByUser ?? false
      pinnedByUser.value = installation.value.pinnedByUser ?? false
    } else if (props.mode === 'install' && props.appId) {
      // Install mode: load app, schema, and existing installations to get max sortOrder
      const [appData, schemaData, installationsData] = await Promise.all([
        appsApi.getApp(props.appId),
        appsApi.getAppSchema(props.appId),
        devicesApi.getInstallations(props.deviceId),
      ])

      app.value = appData ?? null
      schema.value = schemaData ?? null

      // Calculate max sort order from existing installations
      if (installationsData && installationsData.length > 0) {
        maxSortOrder.value = Math.max(...installationsData.map((i) => i.sortOrder ?? 0))
      }
      // Form already initialized from schema defaults by useSchemaForm
    }

    // Mark data as loaded and trigger preview fetch
    dataLoaded.value = true
    refreshPreview()
  } catch (err) {
    loadError.value = getErrorMessage(err, 'Failed to load')
    console.error('Load error:', err)
  } finally {
    initialLoading.value = false
  }
}

function handleFieldUpdate(fieldId: string, value: unknown) {
  formState.updateValue(fieldId, value)

  // Trigger generated field handlers
  const generatedFields = formState.getGeneratedFieldsForSource(fieldId)
  for (const genFieldId of generatedFields) {
    triggerGeneratedHandler(genFieldId)
  }
}

async function triggerGeneratedHandler(fieldId: string) {
  const field = schema.value?.schema.find((f) => f.id === fieldId)
  if (!field || field.type !== 'generated') return
  if (!('handler' in field) || !('source' in field)) return
  if (!field.handler || !field.source) return

  const sourceValue = formState.values.value[field.source]
  if (!sourceValue) return

  let finalValue = sourceValue
  if (typeof sourceValue === 'object') {
    finalValue = JSON.stringify(sourceValue)
  }

  try {
    const response = await appsApi.callHandler(
      resolvedAppId.value,
      field.handler,
      finalValue as string,
    )

    if (response?.result) {
      formState.updateValue(fieldId, response.result)
    }
  } catch (err) {
    console.error(`Handler error for ${fieldId}:`, err)
  }
}

function handleHandlerResult(fieldId: string, result: unknown) {
  formState.updateValue(fieldId, result)
}

async function handleSave() {
  saving.value = true
  saveError.value = undefined
  formState.clearErrors()

  try {
    // Validate first
    const validationResult = await appsApi.validateConfig(
      resolvedAppId.value,
      formState.values.value,
    )

    if (!validationResult?.valid && validationResult?.errors) {
      formState.setErrors(validationResult.errors)
      return
    }

    if (props.mode === 'install') {
      // Create new installation with sortOrder = max + 1
      const result = await devicesApi.createInstallation(props.deviceId, {
        config: {
          app_id: resolvedAppId.value,
          params: formState.values.value,
        },
        enabled: true,
        displayTime: displayTime.value,
        sortOrder: maxSortOrder.value + 1,
      })

      if (result.error) {
        throw new Error('Failed to create installation')
      }

      // Navigate back to device view
      router.replace(`/matrx/${props.deviceId}`)
    } else {
      // Update existing installation
      const result = await devicesApi.updateInstallation(props.deviceId, props.installationId!, {
        config: {
          app_id: resolvedAppId.value,
          params: formState.values.value,
        },
        displayTime: displayTime.value,
        skippedByUser: skippedByUser.value,
      })

      if (result.error) {
        throw new Error('Failed to update installation')
      }

      router.back()
    }
  } catch (err) {
    saveError.value = getErrorMessage(err, 'Failed to save')
    console.error('Save error:', err)
  } finally {
    saving.value = false
  }
}

async function handleDelete() {
  if (!props.installationId) return

  deleting.value = true
  try {
    await devicesApi.deleteInstallation(props.deviceId, props.installationId)
    showDeleteModal.value = false
    router.replace(`/matrx/${props.deviceId}`)
  } catch (err) {
    console.error('Delete error:', err)
  } finally {
    deleting.value = false
  }
}

async function togglePin() {
  if (!props.installationId) return

  pinning.value = true
  try {
    const newPinState = !pinnedByUser.value
    await devicesApi.setPinState(props.deviceId, props.installationId, newPinState)
    pinnedByUser.value = newPinState
  } catch (err) {
    console.error('Pin toggle error:', err)
  } finally {
    pinning.value = false
  }
}

// OAuth flow for restoration
const oauthFlow = useOAuthFlow({
  onSuccess: () => {
    // OAuth success is handled by the field component
  },
})

function getRedirectUri(): string {
  let baseUrl = Capacitor.isNativePlatform() ? ENV.appNativeUrl : window.location.origin
  // OAuth providers often don't accept localhost - use 127.0.0.1 instead
  baseUrl = baseUrl.replace('://localhost', '://127.0.0.1')
  return `${baseUrl}/oauth/callback`
}

async function checkOAuthRestoration() {
  // Check if returning from OAuth callback (native flow)
  if (route.query.restore === 'true' && route.query.oauth_code) {
    const session = await oauthFlow.getPendingSession()
    if (!session) return

    // Restore form state from session
    formState.initializeFromConfig(session.formValues)
    displayTime.value = session.displayTime
    skippedByUser.value = session.skippedByUser

    // Process OAuth code for the field
    const code = route.query.oauth_code as string
    const fieldId = route.query.oauth_field as string

    // Find the OAuth field and call its handler
    const field = schema.value?.schema.find((f) => f.id === fieldId)
    if (field && (field.type === 'oauth1' || field.type === 'oauth2') && 'handler' in field) {
      try {
        const handlerName = field.handler || `${fieldId}_handler`
        const result = await appsApi.callHandler(
          resolvedAppId.value,
          handlerName,
          JSON.stringify({
            code,
            grant_type: 'authorization_code',
            client_id: (field as { client_id?: string }).client_id,
            redirect_uri: getRedirectUri(),
          }),
        )

        if (result?.result) {
          formState.updateValue(fieldId, result.result)
        }
      } catch (err) {
        console.error('OAuth handler error:', err)
      }
    }

    await oauthFlow.clearPendingSession()

    // Clean URL
    router.replace({ query: {} })
  }
}

onMounted(async () => {
  await loadData()
  await checkOAuthRestoration()
})
</script>
