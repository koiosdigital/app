import { ref, watch, onUnmounted, type Ref } from 'vue'
import { getErrorMessage } from '@/lib/api/errors'
import { useAuthStore } from '@/stores/auth/auth'

export type ImageErrorType = 'http' | 'empty' | null

/**
 * Composable for fetching images that require authentication
 * Returns a blob URL that can be used as img src
 */
export function useAuthenticatedImage(url: Ref<string | null | undefined>) {
  const blobUrl = ref<string | null>(null)
  const loading = ref(false)
  const error = ref<string | null>(null)
  /** Type of error: 'http' for non-200 responses, 'empty' for 200 with no/empty data */
  const errorType = ref<ImageErrorType>(null)

  let currentBlobUrl: string | null = null

  async function fetchImage() {
    // Clean up previous blob URL
    if (currentBlobUrl) {
      URL.revokeObjectURL(currentBlobUrl)
      currentBlobUrl = null
      blobUrl.value = null
    }

    if (!url.value) {
      return
    }

    loading.value = true
    error.value = null
    errorType.value = null

    try {
      const authStore = useAuthStore()
      const token = await authStore.getAccessToken()

      const response = await fetch(url.value, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      })

      if (!response.ok) {
        errorType.value = 'http'
        error.value = `HTTP ${response.status}`
        return
      }

      const blob = await response.blob()

      // Check for empty response (200 but no image data)
      if (!blob || blob.size === 0) {
        errorType.value = 'empty'
        error.value = 'Nothing to show'
        return
      }

      currentBlobUrl = URL.createObjectURL(blob)
      blobUrl.value = currentBlobUrl
    } catch (err) {
      errorType.value = 'http'
      error.value = getErrorMessage(err, 'Failed to load image')
      console.error('Failed to fetch authenticated image:', err)
    } finally {
      loading.value = false
    }
  }

  // Watch for URL changes and refetch
  watch(
    url,
    () => {
      fetchImage()
    },
    { immediate: true },
  )

  // Cleanup on unmount
  onUnmounted(() => {
    if (currentBlobUrl) {
      URL.revokeObjectURL(currentBlobUrl)
    }
  })

  return {
    blobUrl,
    loading,
    error,
    errorType,
    refresh: fetchImage,
  }
}
