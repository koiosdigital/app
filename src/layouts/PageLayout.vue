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
    <main ref="scrollContainer" class="page-content" :class="{ 'has-refresh': !!onRefresh }">
      <!-- Pull-to-refresh indicator — grows in flow as the user pulls. -->
      <div
        v-if="onRefresh"
        class="pull-indicator"
        :style="indicatorStyle"
        aria-hidden="true"
      >
        <UIcon
          v-if="phase === 'refreshing'"
          name="i-fa6-solid:spinner"
          class="h-5 w-5 animate-spin text-white/70"
        />
        <UIcon
          v-else
          name="i-fa6-solid:arrow-down"
          class="h-5 w-5 text-white/70 transition-transform duration-150"
          :class="{ 'rotate-180': phase === 'ready' }"
          :style="{ opacity: Math.min(1, pullDistance / threshold) }"
        />
      </div>

      <slot />
    </main>
  </div>
</template>

<script setup lang="ts">
import { computed, useTemplateRef } from 'vue'
import { useRouter } from 'vue-router'
import { usePageHeader } from '@/composables/usePageHeader'
import { usePullToRefresh } from '@/composables/usePullToRefresh'

const props = defineProps<{
  /**
   * Optional callback for pull-to-refresh. When provided, the page content
   * listens for a top-of-scroll pull-down gesture and invokes this on release
   * past the threshold. The indicator stays visible until the returned
   * promise settles.
   */
  onRefresh?: () => Promise<unknown> | unknown
}>()

const router = useRouter()
const { title, backRoute, actions } = usePageHeader()

const scrollContainer = useTemplateRef<HTMLElement>('scrollContainer')
const { pullDistance, phase, threshold } = usePullToRefresh({
  scrollContainer,
  onRefresh: props.onRefresh,
})

// Animate height changes when the user has released (snap back to 0 or
// settle at threshold) or while refreshing; while the finger is moving the
// height should track 1:1 without lag.
const animating = computed(() => phase.value === 'idle' || phase.value === 'refreshing')

const indicatorStyle = computed(() => ({
  height: `${pullDistance.value}px`,
  transition: animating.value ? 'height 240ms cubic-bezier(0.22, 1, 0.36, 1)' : 'none',
}))
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

/* When refreshable, prevent the native scroll bounce from competing with
   our gesture. */
.page-content.has-refresh {
  overscroll-behavior-y: contain;
}

.pull-indicator {
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  flex-shrink: 0;
  will-change: height;
}
</style>
