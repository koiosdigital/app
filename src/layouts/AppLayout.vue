<template>
  <UApp :toaster="{ position: toastPosition }">
    <div class="app-container">
      <!-- Sits above the routed page so it pushes content down instead of
           covering a sticky header. -->
      <OfflineBanner />
      <slot />
    </div>
    <div id="app-footer"></div>
  </UApp>
</template>

<script setup lang="ts">
import { onBeforeUnmount, ref } from 'vue'
import OfflineBanner from '@/components/OfflineBanner.vue'

/**
 * Toasts go top-center on phones. The bottom of the screen belongs to the
 * thumb — and to the fixed tab bar teleported into #app-footer — so a toast
 * landing there covers the controls the user just reached for. Nuxt UI derives
 * the swipe-to-dismiss direction from this too, so a top toast correctly
 * dismisses upward.
 */
const COMPACT = '(max-width: 768px)'
const compact = window.matchMedia(COMPACT)
const toastPosition = ref<'top-center' | 'bottom-right'>(
  compact.matches ? 'top-center' : 'bottom-right',
)

const onChange = (e: MediaQueryListEvent) => {
  toastPosition.value = e.matches ? 'top-center' : 'bottom-right'
}
compact.addEventListener('change', onChange)
onBeforeUnmount(() => compact.removeEventListener('change', onChange))
</script>

<style scoped>
.app-container {
  height: 100%;
  display: flex;
  flex-direction: column;
  padding-top: env(safe-area-inset-top);
  padding-left: env(safe-area-inset-left);
  padding-right: env(safe-area-inset-right);
  padding-bottom: env(safe-area-inset-bottom);
}
</style>

<style>
#app-footer {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  z-index: 50;
}

#app-footer > * {
  padding-bottom: max(1rem, env(safe-area-inset-bottom));
  padding-left: calc(1.5rem + env(safe-area-inset-left));
  padding-right: calc(1.5rem + env(safe-area-inset-right));
}
</style>
