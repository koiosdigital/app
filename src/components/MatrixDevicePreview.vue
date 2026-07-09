<template>
  <div class="matrix-frame" :class="{ 'has-frame': showFrame }">
    <div class="matrix-screen" :style="screenStyle">
      <img :src="src" :alt="alt" class="matrix-image" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'

const props = withDefaults(
  defineProps<{
    /** Image source URL */
    src: string
    /** Alt text for image */
    alt?: string
    /** Width in LED pixels */
    width?: number
    /** Height in LED pixels */
    height?: number
    /** Show the physical frame around the matrix */
    showFrame?: boolean
    /** Use circular LED dots (true) or square pixels (false) */
    roundDots?: boolean
  }>(),
  {
    alt: 'Matrix display',
    width: 64,
    height: 32,
    showFrame: true,
    roundDots: true,
  },
)

const screenStyle = computed(() => ({
  aspectRatio: `${props.width} / ${props.height}`,
}))

/**
 * Generate an SVG data URL for the full LED dot grid mask.
 * A single SVG covering the whole matrix (one dot per LED cell) is scaled
 * as one image, so it stays aligned with the scaled image at any size —
 * unlike a tiled mask, where per-tile pixel rounding drifts on mobile.
 * The dot takes up ~75% of each cell with a small gap.
 */
const dotMaskUrl = computed(() => {
  const dotRatio = 0.75 // dot size relative to cell
  const dot = props.roundDots
    ? `<circle cx="0.5" cy="0.5" r="${dotRatio / 2}" fill="white"/>`
    : `<rect x="${(1 - dotRatio) / 2}" y="${(1 - dotRatio) / 2}" width="${dotRatio}" height="${dotRatio}" fill="white"/>`
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${props.width} ${props.height}" preserveAspectRatio="none">
    <defs>
      <pattern id="dot" width="1" height="1" patternUnits="userSpaceOnUse">${dot}</pattern>
    </defs>
    <rect width="${props.width}" height="${props.height}" fill="url(#dot)"/>
  </svg>`
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`
})
</script>

<style scoped>
.matrix-frame {
  display: inline-flex;
  width: 100%;
}

.matrix-frame.has-frame {
  padding: 6px;
  background: #27272a; /* zinc-800 */
  border-radius: 0.5rem;
}

.matrix-screen {
  width: 100%;
  background: black;
  border-radius: 2px;
  overflow: hidden;
  position: relative;
}

.matrix-image {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: fill;
  image-rendering: pixelated;
  image-rendering: -moz-crisp-edges;
  image-rendering: crisp-edges;
  /* LED dot mask - single full-grid SVG scaled with the image */
  mask-image: v-bind(dotMaskUrl);
  mask-repeat: no-repeat;
  mask-size: 100% 100%;
  mask-position: 0 0;
  -webkit-mask-image: v-bind(dotMaskUrl);
  -webkit-mask-repeat: no-repeat;
  -webkit-mask-size: 100% 100%;
  -webkit-mask-position: 0 0;
}
</style>
