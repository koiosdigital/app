<template>
  <!-- Pattern thumbnails are transparent PNGs of the ball's path drawn in WHITE
       (the on-device thumbnailer). White lines vanish on a light backdrop, so
       render them over a mid-grey disc where they read clearly. -->
  <div class="tranquil-thumb" :class="{ 'tranquil-thumb--flat': flat }">
    <img
      v-if="src"
      :src="src"
      :alt="alt ?? ''"
      class="tranquil-thumb__img"
      loading="lazy"
      @error="onError"
    />
  </div>
</template>

<script setup lang="ts">
withDefaults(
  defineProps<{ src?: string | null; alt?: string; loading?: boolean; flat?: boolean }>(),
  {
    src: null,
    loading: false,
    flat: false,
  },
)

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
