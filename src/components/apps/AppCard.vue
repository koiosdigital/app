<template>
  <button
    type="button"
    class="flex flex-col rounded-lg border border-white/10 bg-white/5 p-4 text-left transition hover:bg-white/10 active:scale-[0.98]"
    @click="emit('select', app)"
  >
    <!-- Preview -->
    <div class="flex justify-center mb-3">
      <div class="preview-frame">
        <div class="preview-screen" :style="{ aspectRatio: `${width} / ${height}` }">
          <!-- Loading state -->
          <div v-if="previewLoading" class="state-overlay">
            <UIcon name="i-fa6-solid:spinner" class="h-5 w-5 animate-spin text-white/50" />
          </div>

          <!-- Loaded preview -->
          <MatrixDevicePreview
            v-else-if="previewBlobUrl"
            :src="previewBlobUrl"
            :width="width"
            :height="height"
            :show-frame="false"
          />

          <!-- HTTP error state -->
          <div v-else-if="errorType === 'http'" class="state-overlay">
            <UIcon name="i-fa6-solid:circle-exclamation" class="h-5 w-5 text-red-500/70" />
          </div>

          <!-- Empty/default state -->
          <div v-else class="state-overlay">
            <UIcon name="i-fa6-regular:image" class="h-5 w-5 text-white/30" />
          </div>
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
  },
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
  errorType,
} = useAuthenticatedImage(previewUrl)
</script>

<style scoped>
.preview-frame {
  width: 100%;
  max-width: 280px;
  padding: 6px;
  background: #27272a;
  border-radius: 0.5rem;
}

.preview-screen {
  width: 100%;
  background: black;
  border-radius: 2px;
  overflow: hidden;
  position: relative;
}

.state-overlay {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}
</style>
