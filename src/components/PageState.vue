<template>
  <div class="state">
    <!-- Reaching a device is a physical act, so waiting is a pulsing lamp
         rather than a generic spinner — same language as device status. -->
    <template v-if="loading">
      <span class="k-lamp k-lamp--ember state__pulse" aria-hidden="true" />
      <p class="k-eyebrow">{{ loadingLabel }}</p>
      <span class="sr-only" role="status">{{ loadingLabel }}</span>
    </template>

    <template v-else-if="error">
      <span class="k-lamp k-lamp--fault" aria-hidden="true" />
      <p class="state__message">{{ error }}</p>
      <UButton color="neutral" variant="soft" size="sm" @click="emit('retry')">
        {{ retryLabel }}
      </UButton>
    </template>
  </div>
</template>

<script setup lang="ts">
withDefaults(
  defineProps<{
    loading?: boolean
    error?: string
    loadingLabel?: string
    retryLabel?: string
  }>(),
  {
    loading: false,
    error: undefined,
    loadingLabel: 'Reaching device',
    retryLabel: 'Try again',
  },
)

const emit = defineEmits<{ (e: 'retry'): void }>()
</script>

<style scoped>
.state {
  display: flex;
  flex: 1;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 64px 20px;
  text-align: center;
}

.state__message {
  max-width: 36ch;
  font-size: 14px;
  color: var(--ui-text);
}

.state__pulse {
  animation: state-pulse 1.4s ease-in-out infinite;
}

@keyframes state-pulse {
  0%,
  100% {
    transform: scale(1);
    opacity: 1;
  }
  50% {
    transform: scale(0.6);
    opacity: 0.45;
  }
}
</style>
