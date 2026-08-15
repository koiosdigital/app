<template>
  <div class="installation-preview">
    <!-- Frame wrapper -->
    <div class="matrix-frame" :class="{ 'has-frame': showFrame }">
      <div class="matrix-screen" :style="screenStyle">
        <!-- Loading state -->
        <div v-if="loading" class="state-overlay">
          <UIcon name="i-fa6-solid:spinner" class="h-5 w-5 animate-spin text-white/50" />
        </div>

        <!-- Loaded image with LED effect -->
        <MatrixDevicePreview
          v-else-if="blobUrl"
          :src="blobUrl"
          :width="width"
          :height="height"
          :show-frame="false"
        />

        <!-- Error/Empty state (unified) -->
        <div v-else class="state-overlay">
          <UIcon :name="stateIcon" class="h-5 w-5" :class="stateIconClass" />
        </div>
      </div>
    </div>

    <!-- Label -->
    <span v-if="showLabel" class="label">{{ appName }}</span>
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
    showFrame?: boolean
    showLabel?: boolean
  }>(),
  {
    appName: 'Unknown App',
    width: 64,
    height: 32,
    showFrame: true,
    showLabel: true,
  },
)

const previewUrl = computed(() => {
  return `${ENV.apiBaseUrl}/v1/devices/${props.deviceId}/installations/${props.installationId}/render.webp`
})

const { blobUrl, loading, errorType } = useAuthenticatedImage(previewUrl)

const screenStyle = computed(() => ({
  aspectRatio: `${props.width} / ${props.height}`,
}))

// Unified icon for error/empty states
const stateIcon = computed(() => {
  if (errorType.value === 'http') return 'i-fa6-solid:circle-exclamation'
  return 'i-fa6-regular:image'
})

const stateIconClass = computed(() => {
  if (errorType.value === 'http') return 'text-red-500/70'
  return 'text-white/30'
})
</script>

<style scoped>
.installation-preview {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.5rem;
  width: 100%;
}

.matrix-frame {
  width: 100%;
}

/* Housing, not a flat swatch: a warm moulding with a lit top edge, so the
   panel reads as a physical object rather than a bordered image. */
.matrix-frame.has-frame {
  padding: 7px;
  border-radius: 10px;
  background: linear-gradient(180deg, #241f1b, #171412);
  box-shadow:
    inset 0 1px 0 rgb(255 255 255 / 0.06),
    0 2px 6px rgb(0 0 0 / 0.5);
}

.matrix-screen {
  width: 100%;
  background: #050505;
  border-radius: 4px;
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

.label {
  font-size: 0.875rem;
  color: rgb(255 255 255 / 0.7);
  text-align: center;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 100%;
}
</style>
