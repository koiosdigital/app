import { ref, onMounted, onBeforeUnmount, type Ref } from 'vue'

export type PullPhase = 'idle' | 'pulling' | 'ready' | 'refreshing'

export interface UsePullToRefreshOptions {
  /** Element whose scrollTop is observed and which receives touch listeners. */
  scrollContainer: Ref<HTMLElement | null>
  /** Async callback invoked when the user releases past the threshold. */
  onRefresh?: () => Promise<unknown> | unknown
  /** Pull distance (px) that triggers a refresh on release. Default: 70. */
  threshold?: number
  /** Maximum visual pull distance (px) regardless of finger travel. Default: 120. */
  maxPull?: number
  /** Drag-resistance factor; lower feels heavier. Default: 0.55. */
  resistance?: number
}

/**
 * Native-feeling pull-to-refresh gesture for a vertically scrollable element.
 *
 * Returns a reactive pull distance and phase so the caller can render the
 * indicator however they like. Listeners are attached to the provided
 * scrollContainer on mount and detached on unmount.
 */
export function usePullToRefresh(opts: UsePullToRefreshOptions) {
  const pullDistance = ref(0)
  const phase = ref<PullPhase>('idle')

  const threshold = opts.threshold ?? 70
  const maxPull = opts.maxPull ?? 120
  const resistance = opts.resistance ?? 0.55

  let startY = 0
  let tracking = false

  function reset() {
    pullDistance.value = 0
    phase.value = 'idle'
    tracking = false
  }

  function onTouchStart(e: TouchEvent) {
    if (phase.value === 'refreshing') return
    const el = opts.scrollContainer.value
    if (!el || el.scrollTop > 0) return
    if (e.touches.length !== 1) return
    startY = e.touches[0].clientY
    tracking = true
  }

  function onTouchMove(e: TouchEvent) {
    if (!tracking) return
    const el = opts.scrollContainer.value
    if (!el) return

    // If the container was scrolled (e.g. user scrolled down then back up
    // without lifting), abandon the gesture.
    if (el.scrollTop > 0) {
      reset()
      return
    }

    const dy = e.touches[0].clientY - startY
    if (dy <= 0) {
      pullDistance.value = 0
      phase.value = 'idle'
      return
    }

    // Asymptotic resistance: pull feels heavier the further you go.
    const eased = dy * resistance
    pullDistance.value = Math.min(eased, maxPull)
    phase.value = pullDistance.value >= threshold ? 'ready' : 'pulling'

    if (e.cancelable) e.preventDefault()
  }

  async function onTouchEnd() {
    if (!tracking) return
    tracking = false

    if (phase.value !== 'ready' || !opts.onRefresh) {
      reset()
      return
    }

    phase.value = 'refreshing'
    pullDistance.value = threshold

    try {
      await opts.onRefresh()
    } finally {
      reset()
    }
  }

  function attach() {
    const el = opts.scrollContainer.value
    if (!el || !opts.onRefresh) return
    el.addEventListener('touchstart', onTouchStart, { passive: true })
    el.addEventListener('touchmove', onTouchMove, { passive: false })
    el.addEventListener('touchend', onTouchEnd)
    el.addEventListener('touchcancel', onTouchEnd)
  }

  function detach() {
    const el = opts.scrollContainer.value
    if (!el) return
    el.removeEventListener('touchstart', onTouchStart)
    el.removeEventListener('touchmove', onTouchMove)
    el.removeEventListener('touchend', onTouchEnd)
    el.removeEventListener('touchcancel', onTouchEnd)
  }

  onMounted(attach)
  onBeforeUnmount(detach)

  return { pullDistance, phase, threshold }
}
