<template>
  <!-- Pattern thumbnails are transparent PNGs of the ball's path drawn in WHITE
       (the on-device thumbnailer). White lines vanish on a light backdrop, so
       render them over a mid-grey disc where they read clearly. -->
  <div class="tranquil-thumb" :class="{ 'tranquil-thumb--flat': flat }">
    <img
      v-if="resolvedSrc"
      :src="resolvedSrc"
      :alt="alt ?? ''"
      class="tranquil-thumb__img"
      loading="lazy"
      @error="onError"
    />
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { ENV } from '@/config/environment'
import { useAuthenticatedImage } from '@/composables/useAuthenticatedImage'

const props = withDefaults(
  defineProps<{ src?: string | null; alt?: string; loading?: boolean; flat?: boolean }>(),
  {
    src: null,
    loading: false,
    flat: false,
  },
)

// Store thumbnails live behind device-api's gated /v1/store/* and need the
// user bearer, so they can't be a plain <img src>: fetch those to a blob. A
// table's own LAN thumbnail loads directly. Deciding here keeps the views
// transport-blind: they just pass whatever `thumbUrl()` gave them.
const needsAuth = computed(() => !!props.src && props.src.startsWith(ENV.apiBaseUrl))
const { blobUrl } = useAuthenticatedImage(computed(() => (needsAuth.value ? props.src : null)))
const resolvedSrc = computed(() => (needsAuth.value ? blobUrl.value : props.src))

// A broken/empty image should fall back to the empty disc, not a broken icon.
function onError(e: Event) {
  ;(e.target as HTMLImageElement).style.visibility = 'hidden'
}
</script>

<style scoped>
.tranquil-thumb {
  position: relative;
  aspect-ratio: 1;
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 9999px;
  overflow: hidden;
  /* Mid-grey disc so the white path lines stand out; subtly lit at top. */
  background: radial-gradient(circle at 50% 38%, #6c7078 0%, #565a61 55%, #43464c 100%);
  box-shadow:
    inset 0 2px 12px rgba(0, 0, 0, 0.35),
    inset 0 0 0 1px rgba(255, 255, 255, 0.06);
}
/* Some layouts (e.g. dense grids) prefer a rounded square disc. */
.tranquil-thumb--flat {
  border-radius: 0.75rem;
}
.tranquil-thumb__img {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.tranquil-thumb__icon {
  width: 2rem;
  height: 2rem;
  color: rgba(255, 255, 255, 0.35);
}
</style>
