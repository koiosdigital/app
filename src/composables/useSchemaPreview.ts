import { ref, watch, onUnmounted, type Ref } from 'vue'
import { appsApi } from '@/lib/api/apps'
import { getErrorMessage } from '@/lib/api/errors'
import { debounce } from '@/utils/debounce'

export type PreviewErrorType = 'http' | 'empty' | 'setup' | null

export interface SchemaPreviewOptions {
  width: Ref<number>
  height: Ref<number>
  deviceId?: Ref<string | undefined>
  debounceMs?: number
  /** If true, use static preview until user interacts with form */
  useStaticPreviewUntilInteraction?: boolean
  /** Ref that controls when preview fetching is enabled (default: always enabled) */
  enabled?: Ref<boolean>
}

export function useSchemaPreview(
  appId: Ref<string>,
  config: Ref<Record<string, unknown>>,
  options: SchemaPreviewOptions
) {
  const previewBase64 = ref<string | null>(null)
  const loading = ref(false)
  const error = ref<string | null>(null)
  /** Type of error: 'http' for API errors, 'empty' for 200 with no render output, 'setup' for incomplete config */
  const errorType = ref<PreviewErrorType>(null)
  /** Whether user has interacted with the form (changed any field) */
  const hasInteracted = ref(false)

  function isEnabled() {
    return options.enabled?.value !== false
  }

  async function fetchStaticPreview() {
    if (!appId.value || !isEnabled()) return

    loading.value = true
    error.value = null
    errorType.value = null

    try {
      const base64 = await appsApi.getPreview(appId.value, {
        width: options.width.value,
        height: options.height.value,
      })

      if (base64) {
        previewBase64.value = base64
      } else {
        errorType.value = 'empty'
        error.value = 'Nothing to show'
        previewBase64.value = null
      }
    } catch (err) {
      previewBase64.value = null
      errorType.value = 'http'
      error.value = getErrorMessage(err, 'Failed to load preview')
    } finally {
      loading.value = false
    }
  }

  async function fetchRenderPreview() {
    if (!appId.value || !isEnabled()) return

    loading.value = true
    error.value = null
    errorType.value = null

    try {
      const response = await appsApi.renderApp(appId.value, config.value, {
        width: options.width.value,
        height: options.height.value,
        deviceId: options.deviceId?.value,
      })

      if (response.error) {
        // API returned an error (validation error, server error, etc.)
        errorType.value = 'setup'
        error.value = 'Complete setup below'
        previewBase64.value = null
      } else if (response.data?.result?.render_output) {
        previewBase64.value = response.data.result.render_output
      } else {
        // 200 response but no render output
        errorType.value = 'empty'
        error.value = 'Nothing to show'
        previewBase64.value = null
      }
    } catch (err) {
      previewBase64.value = null
      errorType.value = 'setup'
      error.value = 'Complete setup below'
    } finally {
      loading.value = false
    }
  }

  async function fetchPreview() {
    if (!isEnabled()) return

    // Use static preview if enabled and user hasn't interacted yet
    if (options.useStaticPreviewUntilInteraction && !hasInteracted.value) {
      await fetchStaticPreview()
    } else {
      await fetchRenderPreview()
    }
  }

  /** Mark that user has interacted with the form */
  function markInteracted() {
    if (!hasInteracted.value) {
      hasInteracted.value = true
    }
  }

  const debouncedFetch = debounce(fetchPreview, options.debounceMs ?? 500)

  // Watch config changes and trigger debounced preview refresh
  watch(
    config,
    (_newConfig, oldConfig) => {
      // If config changed and we had an old config, user has interacted
      if (oldConfig && Object.keys(oldConfig).length > 0) {
        markInteracted()
      }
      debouncedFetch()
    },
    { deep: true }
  )

  // Watch enabled state - fetch immediately when enabled becomes true
  if (options.enabled) {
    watch(
      options.enabled,
      (newEnabled) => {
        if (newEnabled && appId.value) {
          fetchPreview()
        }
      }
    )
  }

  // Initial fetch when app ID is available (only if enabled)
  watch(
    appId,
    (newAppId) => {
      if (newAppId && isEnabled()) {
        fetchPreview()
      }
    },
    { immediate: true }
  )

  // Cleanup on unmount
  onUnmounted(() => {
    debouncedFetch.cancel()
  })

  return {
    previewBase64,
    loading,
    error,
    errorType,
    hasInteracted,
    markInteracted,
    refresh: fetchPreview,
  }
}
