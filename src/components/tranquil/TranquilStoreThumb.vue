<template>
  <div class="relative aspect-square w-full bg-black/40">
    <img
      v-if="blobUrl"
      :src="blobUrl"
      :alt="alt ?? ''"
      class="h-full w-full object-cover"
      loading="lazy"
    />
    <div v-else class="flex h-full w-full items-center justify-center text-white/30">
      <UIcon
        :name="loading ? 'i-fa6-solid:spinner' : 'i-fa6-solid:image'"
        class="h-6 w-6"
        :class="{ 'animate-spin': loading }"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useAuthenticatedImage } from '@/composables/useAuthenticatedImage'
import { tranquilStore } from '@/lib/tranquil/cloudStore'

const props = defineProps<{ uuid: string; alt?: string }>()

// Store thumbnails are behind device-api's gated /v1/store/* — they need the
// user bearer, so they can't be a plain <img src>.
const { blobUrl, loading } = useAuthenticatedImage(
  computed(() => tranquilStore.thumbUrl(props.uuid)),
)
</script>
