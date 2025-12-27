<template>
  <button
    type="button"
    class="flex flex-col rounded-lg border border-white/10 bg-white/5 p-4 text-left transition hover:bg-white/10 active:scale-[0.98]"
    @click="emit('select', app)"
  >
    <!-- Preview -->
    <div class="flex justify-center mb-3">
      <!-- Loading state with frame -->
      <div
        v-if="previewLoading"
        class="inline-flex items-center justify-center p-3 bg-zinc-800 rounded-lg"
      >
        <div class="flex items-center justify-center bg-black rounded-sm" :style="screenStyle">
          <UIcon name="i-lucide-loader-2" class="h-5 w-5 animate-spin text-white/50" />
        </div>
      </div>

      <!-- Loaded preview -->
      <MatrixDevicePreview
        v-else-if="previewBlobUrl"
        :src="previewBlobUrl"
        :width="width"
        :height="height"
        :dot-size="2"
        :dot-gap="1"
        :show-frame="true"
      />

      <!-- HTTP error state (non-200 response) -->
      <div
        v-else-if="errorType === 'http'"
        class="inline-flex items-center justify-center p-3 bg-zinc-800 rounded-lg"
      >
        <div
          class="flex flex-col items-center justify-center gap-1 bg-black rounded-sm"
          :style="screenStyle"
        >
          <UIcon name="i-lucide-alert-circle" class="h-4 w-4 text-red-500" />
          <span class="text-[8px] text-red-500 text-center px-1">{{ error }}</span>
        </div>
      </div>

      <!-- Empty state (200 but no image data) -->
      <div
        v-else-if="errorType === 'empty'"
        class="inline-flex items-center justify-center p-3 bg-zinc-800 rounded-lg"
      >
        <div
          class="flex flex-col items-center justify-center gap-1 bg-black rounded-sm"
          :style="screenStyle"
        >
          <UIcon name="i-lucide-image-off" class="h-4 w-4 text-white/50" />
          <span class="text-[8px] text-white/50 text-center px-1">Nothing to show</span>
        </div>
      </div>

      <!-- Default fallback state -->
      <div v-else class="inline-flex items-center justify-center p-3 bg-zinc-800 rounded-lg">
        <div class="flex items-center justify-center bg-black rounded-sm" :style="screenStyle">
          <UIcon name="i-lucide-image" class="h-5 w-5 text-white/30" />
        </div>
      </div>
    </div>

    <!-- App Info -->
    <div class="flex-1 min-w-0 space-y-1">
      <h3 class="font-medium text-white truncate">{{ app.name }}</h3>
      <p class="text-xs text-white/50 truncate">{{ app.author }}</p>
      <p class="text-sm text-white/70 line-clamp-2">{{ app.summary }}</p>
    </div>
  </button>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import MatrixDevicePreview from '@/components/MatrixDevicePreview.vue'
import { useAuthenticatedImage } from '@/composables/useAuthenticatedImage'
import { ENV } from '@/config/environment'
import type { AppManifest } from '@/lib/api/apps'

const props = withDefaults(
  defineProps<{
    app: AppManifest
    width?: number
    height?: number
  }>(),
  {
    width: 64,
    height: 32,
  }
)

const emit = defineEmits<{
  (e: 'select', app: AppManifest): void
}>()

const previewUrl = computed(() => {
  const dimensions = `${props.width}x${props.height}`
  return `${ENV.apiBaseUrl}/v1/apps/${props.app.id}/preview/${dimensions}.webp`
})

const {
  blobUrl: previewBlobUrl,
  loading: previewLoading,
  error,
  errorType,
} = useAuthenticatedImage(previewUrl)

const screenStyle = computed(() => {
  const dotSize = 2
  const dotGap = 1
  const cellSize = dotSize + dotGap
  const displayWidth = props.width * cellSize - dotGap
  const displayHeight = props.height * cellSize - dotGap
  return {
    width: `${displayWidth}px`,
    height: `${displayHeight}px`,
  }
})
</script>
