<template>
  <div class="inline-flex items-center justify-center" :class="{ 'p-3 bg-zinc-800 rounded-lg': showFrame }">
    <div class="matrix-container rounded-sm bg-black" :style="containerStyle">
      <img
        :src="src"
        :alt="alt"
        class="matrix-image"
        :style="imageStyle"
      />
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
    /** Width in pixels (LED count) */
    width?: number
    /** Height in pixels (LED count) */
    height?: number
    /** Size of each LED dot in display pixels */
    dotSize?: number
    /** Gap between LED dots in display pixels */
    dotGap?: number
    /** Show the physical frame around the matrix */
    showFrame?: boolean
    /** Use circular LED dots (true) or square pixels (false) */
    roundDots?: boolean
  }>(),
  {
    alt: 'Matrix display',
    width: 64,
    height: 32,
    dotSize: 3,
    dotGap: 1,
    showFrame: true,
    roundDots: true,
  }
)

const cellSize = computed(() => props.dotSize + props.dotGap)

const containerStyle = computed(() => {
  const displayWidth = props.width * cellSize.value - props.dotGap
  const displayHeight = props.height * cellSize.value - props.dotGap
  return {
    width: `${displayWidth}px`,
    height: `${displayHeight}px`,
  }
})

const imageStyle = computed(() => {
  // Scale the image so each source pixel becomes cellSize display pixels
  return {
    width: `${props.width}px`,
    height: `${props.height}px`,
    transform: `scale(${cellSize.value})`,
  }
})

/**
 * Generate an SVG data URL for a single LED dot mask tile.
 * The mask is applied at 1x1 source pixel size, then scaled with the image.
 */
const dotMaskUrl = computed(() => {
  // The mask tile is 1x1 source pixel, which gets scaled with the image
  // We need to create the dot pattern within that 1x1 space
  const dotRatio = props.dotSize / cellSize.value
  const gapRatio = props.dotGap / cellSize.value / 2

  if (props.roundDots) {
    // Circular LED dot centered in the cell
    const radius = dotRatio / 2
    const center = 0.5
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1" viewBox="0 0 1 1">
      <circle cx="${center}" cy="${center}" r="${radius}" fill="white"/>
    </svg>`
    return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`
  } else {
    // Square pixel with gap offset
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1" viewBox="0 0 1 1">
      <rect x="${gapRatio}" y="${gapRatio}" width="${dotRatio}" height="${dotRatio}" fill="white"/>
    </svg>`
    return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`
  }
})

// Mask size in source pixels (1x1) that scales with transform
const maskSize = computed(() => '1px 1px')
</script>

<style scoped>
.matrix-container {
  position: relative;
  overflow: hidden;
}

.matrix-image {
  position: absolute;
  top: 0;
  left: 0;
  transform-origin: top left;
  image-rendering: pixelated;
  image-rendering: -moz-crisp-edges;
  image-rendering: crisp-edges;
  /* Use the generated SVG mask, repeated to cover the entire image */
  /* Mask is 1x1 px tiles that scale with the image transform */
  mask-image: v-bind(dotMaskUrl);
  mask-repeat: repeat;
  mask-size: v-bind(maskSize);
  -webkit-mask-image: v-bind(dotMaskUrl);
  -webkit-mask-repeat: repeat;
  -webkit-mask-size: v-bind(maskSize);
}
</style>
