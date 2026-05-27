<template>
  <div class="full-page-layout">
    <slot />
  </div>
</template>

<style scoped>
.full-page-layout {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  flex: 1;
  min-height: 0;
  background-color: #09090b;

  /* Break out of AppLayout's safe-area padding so backgrounds extend
     edge-to-edge (behind the status bar, home indicator, notches). */
  margin-top: calc(-1 * env(safe-area-inset-top));
  margin-bottom: calc(-1 * env(safe-area-inset-bottom));
  margin-left: calc(-1 * env(safe-area-inset-left));
  margin-right: calc(-1 * env(safe-area-inset-right));

  /* Re-inset content with at least 1.25rem of padding. */
  padding-top: max(1.25rem, env(safe-area-inset-top));
  padding-bottom: max(1.25rem, env(safe-area-inset-bottom));
  padding-left: max(1.25rem, env(safe-area-inset-left));
  padding-right: max(1.25rem, env(safe-area-inset-right));
}
</style>
