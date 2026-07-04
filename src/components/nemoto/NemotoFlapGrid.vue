<template>
  <div class="nemoto-grid" :style="gridStyle">
    <NemotoFlap v-for="(id, i) in cells" :key="i" :id="id" />
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import NemotoFlap from './NemotoFlap.vue'

const props = defineProps<{ flaps: number[][] }>()

const width = computed(() => props.flaps[0]?.length ?? 0)
const cells = computed(() => props.flaps.flat())
const gridStyle = computed(() => ({
  gridTemplateColumns: `repeat(${width.value || 1}, minmax(0, 1fr))`,
}))
</script>

<style scoped>
.nemoto-grid {
  display: grid;
  gap: 2px;
  width: 100%;
}
</style>
