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
  padding: 1.25rem;
  background-color: #09090b;
}
</style>
