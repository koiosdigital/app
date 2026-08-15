<template>
  <div class="page-layout flex flex-col bg-default">
    <!-- Header (fixed, does not scroll) -->
    <header
      class="shrink-0 border-b border-muted bg-[rgb(11_10_9/0.82)] px-4 py-3 backdrop-blur-xl"
    >
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
