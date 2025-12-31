<template>
  <div class="page-layout">
    <header class="page-header">
      <div class="flex items-center gap-4">
        <UButton
          v-if="backRoute"
          color="neutral"
          variant="ghost"
          icon="i-fa6-solid:arrow-left"
          square
          @click="router.push(backRoute)"
        />
        <h1 class="text-xl font-semibold">{{ title }}</h1>
      </div>
      <div v-if="actions.length" class="flex items-center gap-2">
        <UButton
          v-for="(action, i) in actions"
          :key="i"
          color="neutral"
          variant="ghost"
          :icon="action.icon"
          square
          @click="action.onClick"
        />
      </div>
    </header>
    <main class="page-content">
      <slot />
    </main>
  </div>
</template>

<script setup lang="ts">
import { useRouter } from 'vue-router'
import { usePageHeader } from '@/composables/usePageHeader'

const router = useRouter()
const { title, backRoute, actions } = usePageHeader()
</script>

<style scoped>
.page-layout {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  background-color: #09090b;
}

.page-header {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 1rem 1.25rem;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  background-color: rgba(9, 9, 11, 0.95);
  backdrop-filter: blur(8px);
}

.page-content {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
}
</style>
