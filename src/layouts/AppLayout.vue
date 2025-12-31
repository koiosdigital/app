<template>
  <UApp>
    <div :class="{ 'safe-area': !isFullscreenRoute }">
      <slot />
    </div>
    <!-- Footer teleport target -->
    <div id="app-footer" class="footer-area"></div>
  </UApp>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'

const route = useRoute()

// Routes that should be full screen without safe area padding
const FULLSCREEN_ROUTES = new Set(['/login', '/login/callback'])

const isFullscreenRoute = computed(() => FULLSCREEN_ROUTES.has(route.path))
</script>

<style scoped>
.safe-area {
  /* Handle safe areas for iOS notch */
  padding-top: env(safe-area-inset-top);
  padding-left: env(safe-area-inset-left);
  padding-right: env(safe-area-inset-right);
}
</style>

<style>
/* Footer area - not scoped so teleported content inherits styles */
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
