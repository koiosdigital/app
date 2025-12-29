import { ref, onMounted, onUnmounted, type Ref } from 'vue'

export interface PullToRefreshOptions {
  /** Threshold in pixels to trigger refresh (default: 80) */
  threshold?: number
  /** Maximum pull distance in pixels (default: 120) */
  maxPull?: number
  /** Callback when refresh is triggered */
  onRefresh: () => Promise<void>
}

export function usePullToRefresh(
  containerRef: Ref<HTMLElement | null>,
  options: PullToRefreshOptions,
) {
  const { threshold = 80, maxPull = 120, onRefresh } = options

  const isPulling = ref(false)
  const isRefreshing = ref(false)
  const pullDistance = ref(0)

  let startY = 0
  let currentY = 0

  const canPull = () => {
    // Only allow pull when scrolled to top
    if (!containerRef.value) return false
    return containerRef.value.scrollTop <= 0
  }

  const handleTouchStart = (e: TouchEvent) => {
    if (!canPull() || isRefreshing.value) return
    startY = e.touches[0].clientY
    isPulling.value = true
  }

  const handleTouchMove = (e: TouchEvent) => {
    if (!isPulling.value || isRefreshing.value) return

    currentY = e.touches[0].clientY
    const diff = currentY - startY

    // Only pull down, not up
    if (diff <= 0) {
      pullDistance.value = 0
      return
    }

    // Apply resistance (logarithmic feel)
    const resistance = 0.5
    pullDistance.value = Math.min(diff * resistance, maxPull)

    // Prevent default scroll when pulling
    if (pullDistance.value > 0) {
      e.preventDefault()
    }
  }

  const handleTouchEnd = async () => {
    if (!isPulling.value) return

    isPulling.value = false

    if (pullDistance.value >= threshold && !isRefreshing.value) {
      isRefreshing.value = true
      pullDistance.value = threshold // Hold at threshold during refresh

      try {
        await onRefresh()
      } finally {
        isRefreshing.value = false
        pullDistance.value = 0
      }
    } else {
      pullDistance.value = 0
    }
  }

  onMounted(() => {
    const container = containerRef.value
    if (!container) return

    container.addEventListener('touchstart', handleTouchStart, { passive: true })
    container.addEventListener('touchmove', handleTouchMove, { passive: false })
    container.addEventListener('touchend', handleTouchEnd, { passive: true })
  })

  onUnmounted(() => {
    const container = containerRef.value
    if (!container) return

    container.removeEventListener('touchstart', handleTouchStart)
    container.removeEventListener('touchmove', handleTouchMove)
    container.removeEventListener('touchend', handleTouchEnd)
  })

  return {
    isPulling,
    isRefreshing,
    pullDistance,
  }
}
