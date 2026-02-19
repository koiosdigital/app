<template>
  <div class="page-layout flex flex-col bg-zinc-950">
    <!-- Header (fixed, does not scroll) -->
    <header class="shrink-0 border-b border-white/10 bg-zinc-950/95 backdrop-blur px-5 py-4">
      <slot name="header" />
    </header>

    <!-- Scrollable content area -->
    <main class="flex-1 min-h-0 overflow-y-auto">
      <slot />
    </main>
  </div>
</template>

<script setup lang="ts"></script>

<style scoped>
.page-layout {
  height: 100vh;
  height: 100dvh; /* Dynamic viewport height for mobile */
}
</style>
