<template>
  <TranquilPatternThumb :src="blobUrl" :alt="alt" :loading="loading" />
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useAuthenticatedImage } from '@/composables/useAuthenticatedImage'
import { tranquilStore } from '@/lib/tranquil/cloudStore'
import TranquilPatternThumb from './TranquilPatternThumb.vue'

const props = defineProps<{ uuid: string; alt?: string }>()

// Store thumbnails are behind device-api's gated /v1/store/* — they need the
// user bearer, so they can't be a plain <img src>. Fetch to a blob, then render
// it over the shared sand disc.
const { blobUrl, loading } = useAuthenticatedImage(
  computed(() => tranquilStore.thumbUrl(props.uuid)),
)
</script>
