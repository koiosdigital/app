<template>
  <UApp>
    <div class="safe-area">
      <slot />
    </div>
  </UApp>
</template>

<script setup lang="ts">
</script>

<style scoped>
.safe-area {
  /* Handle safe areas for iOS notch and home indicator */
  padding-top: env(safe-area-inset-top);
  padding-bottom: env(safe-area-inset-bottom);
  padding-left: env(safe-area-inset-left);
  padding-right: env(safe-area-inset-right);
}
</style>
