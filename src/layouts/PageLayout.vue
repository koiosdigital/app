<template>
  <div class="page-layout">
    <header class="page-header">
      <div class="flex min-w-0 items-center gap-1">
        <UButton
          v-if="backRoute"
          color="neutral"
          variant="ghost"
          icon="i-fa6-solid:chevron-left"
          square
          size="lg"
          class="-ml-2"
          aria-label="Go back"
          @click="router.push(backRoute)"
        />
        <h1 class="page-title">{{ title }}</h1>
      </div>
      <div v-if="actions.length" class="-mr-2 flex shrink-0 items-center">
        <UButton
          v-for="(action, i) in actions"
          :key="i"
          color="neutral"
          variant="ghost"
          :icon="action.icon"
          square
          size="lg"
          :aria-label="action.label"
          @click="action.onClick"
        />
      </div>
    </header>
    <main ref="scrollContainer" class="page-content" :class="{ 'has-refresh': !!onRefresh }">
      <!-- Pull-to-refresh indicator — grows in flow as the user pulls. -->
      <div v-if="onRefresh" class="pull-indicator" :style="indicatorStyle" aria-hidden="true">
        <!-- The indicator lights up as it arms, so the gesture reads the same
             way device state does everywhere else in the app. -->
        <span
          class="pull-dot"
          :class="{
            'pull-dot--armed': phase === 'ready' || phase === 'refreshing',
            'pull-dot--spinning': phase === 'refreshing',
          }"
          :style="{ opacity: phase === 'idle' ? 0 : Math.min(1, pullDistance / threshold) }"
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
  background-color: var(--k-ground);
}

.page-header {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  /* Tighter vertically than before: on a phone the header is overhead, and
     the 44px controls already guarantee a comfortable touch target. */
  padding: 0.5rem 1rem;
  border-bottom: 1px solid var(--k-line-soft);
  background-color: rgb(11 10 9 / 0.82);
  backdrop-filter: blur(14px) saturate(1.3);
}

.page-title {
  font-size: 1.0625rem;
  font-weight: 600;
  letter-spacing: -0.02em;
  color: var(--ui-text-highlighted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
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

.pull-dot {
  width: 9px;
  height: 9px;
  border-radius: 999px;
  box-shadow: inset 0 0 0 1.5px #453d36;
  transition:
    background 0.2s var(--k-ease),
    box-shadow 0.2s var(--k-ease),
    opacity 0.15s linear;
}

/* Past the threshold the dot lights: release now and it refreshes. */
.pull-dot--armed {
  background: var(--k-ember);
  box-shadow:
    0 0 0 2px rgb(231 145 20 / 0.16),
    0 0 10px 1px rgb(231 145 20 / 0.85);
}

.pull-dot--spinning {
  animation: pull-pulse 1s ease-in-out infinite;
}

@keyframes pull-pulse {
  0%,
  100% {
    transform: scale(1);
    opacity: 1;
  }
  50% {
    transform: scale(0.72);
    opacity: 0.55;
  }
}
</style>
