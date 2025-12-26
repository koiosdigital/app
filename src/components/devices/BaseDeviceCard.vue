<template>
  <UCard
    :class="[
      'border-white/10 backdrop-blur hover:border-primary-500/60 transition-all cursor-pointer',
      cardBackgroundClass
    ]"
    @click="$emit('click')"
  >
    <div class="flex items-start justify-between gap-4">
      <div class="flex-1">
        <p class="text-xs uppercase tracking-[0.35em] text-white/60">{{ eyebrow }}</p>
        <h3 class="text-2xl font-semibold">{{ title }}</h3>
        <p class="text-sm text-white/70">{{ subtitle }}</p>
      </div>
      <slot name="header-end" />
    </div>

    <div class="mt-4 flex flex-wrap items-center gap-4 text-sm text-white/70">
      <slot name="metadata" />
    </div>

    <slot name="preview" />

    <div class="mt-6 flex flex-wrap gap-2">
      <slot name="actions" />
    </div>
  </UCard>
</template>

<script setup lang="ts">
defineProps<{
  eyebrow: string
  title: string
  subtitle: string
  cardBackgroundClass?: string
}>()

defineEmits<{
  (e: 'click'): void
}>()
</script>
