<template>
  <div class="page-layout flex flex-col bg-zinc-950">
    <!-- Header (fixed, does not scroll) -->
    <header
      class="shrink-0 border-b border-white/10 bg-zinc-950/95 backdrop-blur px-5 py-4"
    >
      <slot name="header" />
    </header>

    <!-- Scrollable content area -->
    <main class="flex-1 overflow-auto">
      <slot />
    </main>
  </div>
</template>

<script setup lang="ts">
</script>

<style scoped>
.page-layout {
  min-height: 100vh;
  min-height: 100dvh; /* Dynamic viewport height for mobile */
}
</style>
