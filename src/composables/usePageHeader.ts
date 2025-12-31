import { ref, readonly } from 'vue'

export interface HeaderAction {
  icon: string
  onClick: () => void
  label?: string
}

const title = ref('')
const backRoute = ref<string | null>(null)
const actions = ref<HeaderAction[]>([])

export function usePageHeader() {
  const setHeader = (options: {
    title: string
    backRoute?: string | null
    actions?: HeaderAction[]
  }) => {
    title.value = options.title
    backRoute.value = options.backRoute ?? null
    actions.value = options.actions ?? []
  }

  const clearHeader = () => {
    title.value = ''
    backRoute.value = null
    actions.value = []
  }

  return {
    title: readonly(title),
    backRoute: readonly(backRoute),
    actions: readonly(actions),
    setHeader,
    clearHeader,
  }
}
