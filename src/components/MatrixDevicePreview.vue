<template>
  <div class="matrix-frame" :class="{ 'has-frame': showFrame }">
    <div class="matrix-screen" :style="screenStyle">
      <img :src="src" :alt="alt" class="matrix-image" :style="imageStyle" />
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

const imageStyle = computed(() => ({
  // Image is scaled via CSS to fill container
  // The mask will tile based on the LED pixel count
  '--led-cols': props.width,
  '--led-rows': props.height,
}))

/**
 * Generate an SVG data URL for a single LED dot mask tile.
 * The dot takes up ~75% of each cell with a small gap.
 */
const dotMaskUrl = computed(() => {
  const dotRatio = 0.75 // dot size relative to cell
  const center = 0.5

  if (props.roundDots) {
    const radius = dotRatio / 2
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1" viewBox="0 0 1 1">
      <circle cx="${center}" cy="${center}" r="${radius}" fill="white"/>
    </svg>`
    return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`
  } else {
    const offset = (1 - dotRatio) / 2
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1" viewBox="0 0 1 1">
      <rect x="${offset}" y="${offset}" width="${dotRatio}" height="${dotRatio}" fill="white"/>
    </svg>`
    return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`
  }
})

// Mask size as percentage of container - one tile per LED pixel
const maskSizeX = computed(() => `${100 / props.width}%`)
const maskSizeY = computed(() => `${100 / props.height}%`)
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
  /* LED dot mask - tiles based on LED pixel count */
  mask-image: v-bind(dotMaskUrl);
  mask-repeat: repeat;
  mask-size: v-bind(maskSizeX) v-bind(maskSizeY);
  mask-position: 0 0;
  mask-origin: content-box;
  -webkit-mask-image: v-bind(dotMaskUrl);
  -webkit-mask-repeat: repeat;
  -webkit-mask-size: v-bind(maskSizeX) v-bind(maskSizeY);
  -webkit-mask-position: 0 0;
  -webkit-mask-origin: content-box;
}
</style>
