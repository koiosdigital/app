<template>
  <div class="flex flex-1 min-h-0 flex-col bg-zinc-950">
    <!-- Header -->
    <header class="sticky top-0 z-10 border-b border-white/10 bg-zinc-950/95 backdrop-blur">
      <div class="flex items-center justify-between px-5 py-4">
        <div class="flex items-center gap-4">
          <UButton
            color="neutral"
            variant="ghost"
            icon="i-fa6-solid:arrow-left"
            square
            @click="router.push(`/matrx/${deviceId}`)"
          />
          <h1 class="text-xl font-semibold">Apps</h1>
        </div>
        <div class="flex items-center gap-2">
          <UButton
            color="neutral"
            variant="ghost"
            :icon="isSearchOpen ? 'i-fa6-solid:xmark' : 'i-fa6-solid:magnifying-glass'"
            square
            @click="toggleSearch"
          />
          <UButton
            color="neutral"
            variant="ghost"
            icon="i-fa6-solid:sliders"
            square
            @click="isFilterOpen = !isFilterOpen"
          />
        </div>
      </div>

      <!-- Search Bar (slides out) -->
      <Transition
        enter-active-class="transition-all duration-200 ease-out"
        leave-active-class="transition-all duration-150 ease-in"
        enter-from-class="opacity-0 -translate-y-2"
        enter-to-class="opacity-100 translate-y-0"
        leave-from-class="opacity-100 translate-y-0"
        leave-to-class="opacity-0 -translate-y-2"
      >
        <div v-if="isSearchOpen" class="border-t border-white/10 px-5 py-3">
          <div class="relative">
            <UInput
              ref="searchInputRef"
              v-model="searchQuery"
              placeholder="Search apps..."
              icon="i-fa6-solid:magnifying-glass"
              size="lg"
            />
            <button
              v-if="searchQuery"
              type="button"
              class="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded text-white/50 hover:text-white/80"
              @click="searchQuery = ''"
            >
              <UIcon name="i-fa6-solid:xmark" class="h-4 w-4" />
            </button>
          </div>
        </div>
      </Transition>

      <!-- Filter Panel -->
      <Transition
        enter-active-class="transition-all duration-200 ease-out"
        leave-active-class="transition-all duration-150 ease-in"
        enter-from-class="opacity-0 -translate-y-2"
        enter-to-class="opacity-100 translate-y-0"
        leave-from-class="opacity-100 translate-y-0"
        leave-to-class="opacity-0 -translate-y-2"
      >
        <div v-if="isFilterOpen" class="border-t border-white/10 px-5 py-4 space-y-4">
          <div class="flex items-center justify-between">
            <span class="text-sm font-medium text-white/70">Sort by</span>
            <div class="flex gap-2">
              <UButton
                size="xs"
                :color="sortBy === 'name' ? 'primary' : 'neutral'"
                :variant="sortBy === 'name' ? 'soft' : 'ghost'"
                @click="sortBy = 'name'"
              >
                Name
              </UButton>
              <UButton
                size="xs"
                :color="sortBy === 'author' ? 'primary' : 'neutral'"
                :variant="sortBy === 'author' ? 'soft' : 'ghost'"
                @click="sortBy = 'author'"
              >
                Author
              </UButton>
            </div>
          </div>
          <div class="flex items-center justify-between">
            <span class="text-sm font-medium text-white/70">Order</span>
            <div class="flex gap-2">
              <UButton
                size="xs"
                :color="sortOrder === 'asc' ? 'primary' : 'neutral'"
                :variant="sortOrder === 'asc' ? 'soft' : 'ghost'"
                icon="i-fa6-solid:arrow-up-a-z"
                @click="sortOrder = 'asc'"
              >
                A-Z
              </UButton>
              <UButton
                size="xs"
                :color="sortOrder === 'desc' ? 'primary' : 'neutral'"
                :variant="sortOrder === 'desc' ? 'soft' : 'ghost'"
                icon="i-fa6-solid:arrow-down-z-a"
                @click="sortOrder = 'desc'"
              >
                Z-A
              </UButton>
            </div>
          </div>
        </div>
      </Transition>
    </header>

    <!-- Loading State (initial) -->
    <div v-if="initialLoading" class="flex flex-1 items-center justify-center">
      <UIcon name="i-fa6-solid:spinner" class="h-8 w-8 animate-spin text-white/50" />
    </div>

    <!-- Error State -->
    <div v-else-if="error && apps.length === 0" class="flex flex-1 items-center justify-center p-5">
      <div class="text-center space-y-4">
        <UIcon name="i-fa6-solid:circle-exclamation" class="h-12 w-12 text-red-400 mx-auto" />
        <p class="text-red-400">{{ error }}</p>
        <UButton color="neutral" variant="soft" @click="loadApps(true)">Retry</UButton>
      </div>
    </div>

    <!-- Apps List -->
    <div v-else class="flex-1 min-h-0 overflow-y-auto">
      <!-- Empty State -->
      <div
        v-if="apps.length === 0 && !loading"
        class="flex flex-1 flex-col items-center justify-center p-8 text-center"
      >
        <UIcon name="i-fa6-solid:box-open" class="h-16 w-16 text-white/30" />
        <p class="mt-4 text-white/70">
          {{ searchQuery ? 'No apps found matching your search' : 'No apps available' }}
        </p>
        <UButton
          v-if="searchQuery"
          color="neutral"
          variant="soft"
          class="mt-4"
          @click="searchQuery = ''"
        >
          Clear search
        </UButton>
      </div>

      <!-- Apps Grid -->
      <div v-else class="grid grid-cols-2 gap-3 p-5 lg:grid-cols-3">
        <AppCard
          v-for="app in apps"
          :key="app.id"
          :app="app"
          :width="deviceWidth"
          :height="deviceHeight"
          @select="selectApp"
        />

        <!-- Loading more indicator -->
        <div v-if="hasMore" ref="loadMoreTrigger" class="col-span-full flex justify-center py-4">
          <UIcon
            v-if="loading"
            name="i-fa6-solid:spinner"
            class="h-6 w-6 animate-spin text-white/50"
          />
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useHead } from '@unhead/vue'
import AppCard from '@/components/apps/AppCard.vue'
import { appsApi, type AppManifest, type PaginationMeta } from '@/lib/api/apps'
import { devicesApi } from '@/lib/api/devices'
import { getErrorMessage } from '@/lib/api/errors'
import type { MatrxDevice } from '@/lib/api/mappers/deviceMapper'
const router = useRouter()
const route = useRoute()

const deviceId = computed(() => route.params.id as string)

// Device data
const device = ref<MatrxDevice | null>(null)
const deviceWidth = computed(() => device.value?.settings?.width ?? 64)
const deviceHeight = computed(() => device.value?.settings?.height ?? 32)

// Search and filter state
const isSearchOpen = ref(false)
const isFilterOpen = ref(false)
const searchQuery = ref('')
const sortBy = ref<'name' | 'author'>('name')
const sortOrder = ref<'asc' | 'desc'>('asc')
const searchInputRef = ref<{ $el: HTMLElement } | null>(null)

// Data state
const apps = ref<AppManifest[]>([])
const pagination = ref<PaginationMeta | null>(null)
const loading = ref(false)
const initialLoading = ref(true)
const error = ref<string>()

// Infinite scroll
const loadMoreTrigger = ref<HTMLElement | null>(null)
const observer = ref<IntersectionObserver | null>(null)

// Debounce timer
let searchDebounceTimer: ReturnType<typeof setTimeout> | null = null

const hasMore = computed(() => {
  if (!pagination.value) return false
  return pagination.value.hasNext
})

const currentPage = computed(() => pagination.value?.page ?? 1)

useHead({
  title: 'Apps | Koios Digital',
  meta: [{ name: 'description', content: 'Browse and install apps for your Matrx device' }],
})

function toggleSearch() {
  isSearchOpen.value = !isSearchOpen.value
  if (isSearchOpen.value) {
    isFilterOpen.value = false
    nextTick(() => {
      const input = searchInputRef.value?.$el?.querySelector('input')
      input?.focus()
    })
  }
}

async function loadDevice() {
  try {
    const deviceData = await devicesApi.getDevice(deviceId.value)
    if (deviceData?.type === 'MATRX') {
      device.value = deviceData as MatrxDevice
    }
  } catch (err) {
    console.error('Failed to load device:', err)
  }
}

async function loadApps(reset = false) {
  if (loading.value) return

  loading.value = true
  error.value = undefined

  try {
    const page = reset ? 1 : currentPage.value + 1

    const response = await appsApi.listApps({
      search: searchQuery.value || undefined,
      page,
      limit: 20,
      sortBy: sortBy.value,
      order: sortOrder.value,
    })

    if (!response) {
      throw new Error('No response from server')
    }

    if (reset) {
      apps.value = response.data
    } else {
      apps.value = [...apps.value, ...response.data]
    }

    pagination.value = response.meta
  } catch (err) {
    error.value = getErrorMessage(err, 'Failed to load apps')
    console.error('Failed to load apps:', err)
  } finally {
    loading.value = false
    initialLoading.value = false
  }
}

function selectApp(app: AppManifest) {
  router.push(`/matrx/${deviceId.value}/apps/${app.id}`)
}

// Watch for search query changes with debounce
watch(searchQuery, () => {
  if (searchDebounceTimer) {
    clearTimeout(searchDebounceTimer)
  }

  searchDebounceTimer = setTimeout(() => {
    loadApps(true)
  }, 300)
})

// Watch for sort changes
watch([sortBy, sortOrder], () => {
  loadApps(true)
})

// Setup intersection observer for infinite scroll
function setupIntersectionObserver() {
  if (observer.value) {
    observer.value.disconnect()
  }

  observer.value = new IntersectionObserver(
    (entries) => {
      const [entry] = entries
      if (entry.isIntersecting && hasMore.value && !loading.value) {
        loadApps()
      }
    },
    {
      rootMargin: '100px',
    },
  )
}

watch(loadMoreTrigger, (el) => {
  if (el && observer.value) {
    observer.value.observe(el)
  }
})

onMounted(async () => {
  setupIntersectionObserver()
  await loadDevice()
  await loadApps(true)
})

onUnmounted(() => {
  if (observer.value) {
    observer.value.disconnect()
  }
  if (searchDebounceTimer) {
    clearTimeout(searchDebounceTimer)
  }
})
</script>

