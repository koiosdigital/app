<template>
  <UApp>
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
import OfflineBanner from '@/components/OfflineBanner.vue'
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
