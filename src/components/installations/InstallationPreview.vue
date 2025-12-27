<template>
  <div class="flex flex-col items-center gap-2">
    <!-- Loading state with frame -->
    <div
      v-if="loading"
      class="inline-flex items-center justify-center"
      :class="{ 'p-3 bg-zinc-800 rounded-lg': showFrame }"
    >
      <div class="flex items-center justify-center bg-black rounded-sm" :style="screenStyle">
        <UIcon name="i-lucide-loader-2" class="h-4 w-4 animate-spin text-white/50" />
      </div>
    </div>

    <!-- Loaded preview -->
    <MatrixDevicePreview
      v-else-if="blobUrl"
      :src="blobUrl"
      :width="width"
      :height="height"
      :dot-size="dotSize"
      :dot-gap="dotGap"
      :show-frame="showFrame"
    />

    <!-- HTTP error state (non-200 response) -->
    <div
      v-else-if="errorType === 'http'"
      class="inline-flex items-center justify-center"
      :class="{ 'p-3 bg-zinc-800 rounded-lg': showFrame }"
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
      class="inline-flex items-center justify-center"
      :class="{ 'p-3 bg-zinc-800 rounded-lg': showFrame }"
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
    <div
      v-else
      class="inline-flex items-center justify-center"
      :class="{ 'p-3 bg-zinc-800 rounded-lg': showFrame }"
    >
      <div class="flex items-center justify-center bg-black rounded-sm" :style="screenStyle">
        <UIcon name="i-lucide-image" class="h-4 w-4 text-white/30" />
      </div>
    </div>

    <span class="text-sm text-white/70 text-center truncate max-w-full">{{ appName }}</span>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import MatrixDevicePreview from '@/components/MatrixDevicePreview.vue'
import { useAuthenticatedImage } from '@/composables/useAuthenticatedImage'
import { ENV } from '@/config/environment'

const props = withDefaults(
  defineProps<{
    deviceId: string
    installationId: string
    appId: string
    appName?: string
    width?: number
    height?: number
    dotSize?: number
    dotGap?: number
    showFrame?: boolean
  }>(),
  {
    appName: 'Unknown App',
    width: 64,
    height: 32,
    dotSize: 3,
    dotGap: 1,
    showFrame: true,
  }
)

const previewUrl = computed(() => {
  return `${ENV.apiBaseUrl}/v1/devices/${props.deviceId}/installations/${props.installationId}/render.webp`
})

const { blobUrl, loading, error, errorType } = useAuthenticatedImage(previewUrl)

const screenStyle = computed(() => {
  const cellSize = props.dotSize + props.dotGap
  const displayWidth = props.width * cellSize - props.dotGap
  const displayHeight = props.height * cellSize - props.dotGap
  return {
    width: `${displayWidth}px`,
    height: `${displayHeight}px`,
  }
})
</script>
