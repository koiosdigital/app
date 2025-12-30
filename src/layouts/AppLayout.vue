<template>
  <UApp>
    <div :class="{ 'safe-area': !isFullscreenRoute }">
      <slot />
    </div>
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
  /* Handle safe areas for iOS notch - bottom handled by tab bar */
  padding-top: env(safe-area-inset-top);
  padding-left: env(safe-area-inset-left);
  padding-right: env(safe-area-inset-right);
}
</style>
