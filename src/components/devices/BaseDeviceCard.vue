<template>
  <UCard
    :class="[
      'h-full',
      'border-white/10 backdrop-blur hover:border-primary-500/60 transition-all cursor-pointer',
      cardBackgroundClass,
    ]"
    :ui="{ body: 'h-full flex flex-col justify-between p-4 sm:p-6' }"
    @click="$emit('click')"
  >
    <!-- Header -->
    <div class="flex items-start justify-between gap-4">
      <div class="flex-1">
        <p class="text-xs uppercase tracking-[0.35em] text-white/60">{{ eyebrow }}</p>
        <h3 class="text-2xl font-semibold">{{ title }}</h3>
        <p class="text-sm text-white/70">{{ subtitle }}</p>
      </div>
      <slot name="header-end" />
    </div>

    <!-- Content -->
    <div class="flex items-center justify-center py-4">
      <slot name="content" />
    </div>

    <!-- Footer -->
    <div class="flex flex-wrap gap-2">
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
