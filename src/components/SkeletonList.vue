<template>
  <!-- Placeholders shaped like the content they stand in for, so the page
       doesn't reflow the moment real data lands. A centred spinner tells you
       nothing about what is coming; this does. -->
  <div v-if="variant === 'tile'" class="grid gap-3" :class="gridClass">
    <div v-for="i in count" :key="i" class="flex flex-col gap-2">
      <USkeleton class="w-full rounded-lg" :style="{ aspectRatio: ratio }" />
      <USkeleton class="h-2.5 w-3/5 rounded-full" />
    </div>
  </div>

  <div v-else class="flex flex-col gap-2">
    <div v-for="i in count" :key="i" class="skeleton-row">
      <div class="min-w-0 flex-1">
        <USkeleton class="h-3.5 w-2/5 rounded" />
        <USkeleton class="mt-2.5 h-2.5 w-1/4 rounded-full" />
      </div>
      <USkeleton class="h-7 w-16 shrink-0 rounded-lg" />
    </div>
  </div>
</template>

<script setup lang="ts">
withDefaults(
  defineProps<{
    /** How many placeholders to draw. Match the usual page size, not the max. */
    count?: number
    variant?: 'row' | 'tile'
    /** Aspect ratio of a tile's preview, e.g. '64 / 32' for a matrix panel. */
    ratio?: string
    gridClass?: string
  }>(),
  {
    count: 6,
    variant: 'row',
    ratio: '1 / 1',
    gridClass: 'grid-cols-2 sm:grid-cols-3',
  },
)
</script>

<style scoped>
.skeleton-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px;
  border: 1px solid var(--k-line);
  border-radius: 14px;
  background: var(--k-panel);
  box-shadow: var(--k-bezel);
}
</style>
