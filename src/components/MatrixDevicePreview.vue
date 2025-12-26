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
  }>(),
  {
    alt: 'Matrix display',
    width: 64,
    height: 32,
    dotSize: 3,
    dotGap: 1,
    showFrame: true,
  }
)

const containerStyle = computed(() => {
  const displayWidth = props.width * (props.dotSize + props.dotGap) - props.dotGap
  const displayHeight = props.height * (props.dotSize + props.dotGap) - props.dotGap
  return {
    width: `${displayWidth}px`,
    height: `${displayHeight}px`,
  }
})

const imageStyle = computed(() => {
  const scale = props.dotSize + props.dotGap
  return {
    width: `${props.width}px`,
    height: `${props.height}px`,
    transform: `scale(${scale})`,
  }
})
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
  mask-image:
    repeating-linear-gradient(
      to right,
      black 0,
      black calc(v-bind(dotSize) * 1px),
      transparent calc(v-bind(dotSize) * 1px),
      transparent calc((v-bind(dotSize) + v-bind(dotGap)) * 1px)
    ),
    repeating-linear-gradient(
      to bottom,
      black 0,
      black calc(v-bind(dotSize) * 1px),
      transparent calc(v-bind(dotSize) * 1px),
      transparent calc((v-bind(dotSize) + v-bind(dotGap)) * 1px)
    );
  mask-composite: intersect;
  -webkit-mask-image:
    repeating-linear-gradient(
      to right,
      black 0,
      black calc(v-bind(dotSize) * 1px),
      transparent calc(v-bind(dotSize) * 1px),
      transparent calc((v-bind(dotSize) + v-bind(dotGap)) * 1px)
    ),
    repeating-linear-gradient(
      to bottom,
      black 0,
      black calc(v-bind(dotSize) * 1px),
      transparent calc(v-bind(dotSize) * 1px),
      transparent calc((v-bind(dotSize) + v-bind(dotGap)) * 1px)
    );
  -webkit-mask-composite: source-in;
}
</style>
