<template>
  <Transition name="banner">
    <div
      v-if="!online || reconnected"
      class="banner"
      :class="online ? 'banner--back' : 'banner--out'"
    >
      <span class="k-lamp" :class="online ? 'k-lamp--on' : 'k-lamp--fault'" aria-hidden="true" />
      <span>{{ online ? 'Back online' : "You're offline — showing the last state we saw" }}</span>
    </div>
  </Transition>
</template>

<script setup lang="ts">
import { useNetworkStatus } from '@/composables/useNetworkStatus'

const { online, reconnected } = useNetworkStatus()
</script>

<style scoped>
.banner {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  flex-shrink: 0;
  padding: 8px 14px;
  font-family: var(--font-mono);
  font-size: 11.5px;
  letter-spacing: 0.01em;
  text-align: center;
}

.banner--out {
  color: #f0a19c;
  background: rgb(226 86 79 / 0.12);
  border-bottom: 1px solid rgb(226 86 79 / 0.22);
}

.banner--back {
  color: #86ddbc;
  background: rgb(79 194 154 / 0.12);
  border-bottom: 1px solid rgb(79 194 154 / 0.22);
}

/* Sliding the strip in pushes the page down rather than covering its header. */
.banner-enter-active,
.banner-leave-active {
  transition:
    opacity 0.24s var(--k-ease),
    transform 0.24s var(--k-ease);
}
.banner-enter-from,
.banner-leave-to {
  opacity: 0;
  transform: translateY(-100%);
}
</style>
