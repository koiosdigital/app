<template>
  <!-- Pattern thumbnails are transparent PNGs of the ball's path (dark lines).
       They're invisible on a dark UI, so render them over a sand-colored disc —
       the look of the physical table. -->
  <div class="tranquil-thumb" :class="{ 'tranquil-thumb--flat': flat }">
    <img
      v-if="src"
      :src="src"
      :alt="alt ?? ''"
      class="tranquil-thumb__img"
      loading="lazy"
      @error="onError"
    />
    <UIcon
      v-else
      :name="loading ? 'i-fa6-solid:spinner' : 'i-fa6-solid:record-vinyl'"
      class="tranquil-thumb__icon"
      :class="{ 'animate-spin': loading }"
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
  /* Warm sand disc with a soft lit top and darker rim. */
  background: radial-gradient(circle at 50% 38%, #efe3c6 0%, #e3d0a8 55%, #cdb684 100%);
  box-shadow:
    inset 0 2px 12px rgba(60, 45, 20, 0.28),
    inset 0 0 0 1px rgba(60, 45, 20, 0.12);
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
  color: rgba(70, 55, 30, 0.45);
}
</style>
