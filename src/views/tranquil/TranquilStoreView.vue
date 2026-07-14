<template>
  <PageLayout :on-refresh="refresh">
    <!-- Pattern detail -->
    <UModal
      :open="!!selected"
      :title="selected?.name ?? ''"
      @update:open="(v) => !v && (selected = null)"
    >
      <template #body>
        <div v-if="selected" class="flex flex-col gap-4">
          <div class="mx-auto w-full max-w-xs">
            <TranquilStoreThumb :uuid="selected.uuid" :alt="selected.name" />
          </div>
          <div class="text-center">
            <p class="font-medium">{{ selected.name }}</p>
            <p v-if="selected.creator" class="text-sm text-white/60">by {{ selected.creator }}</p>
          </div>
          <UButton
            v-if="downloadPct(selected.uuid) === undefined"
            color="primary"
            size="lg"
            icon="i-fa6-solid:down-to-bracket"
            block
            :disabled="!tranquilLocal.connected"
            @click="addToTable(selected)"
          >
            Add to table
          </UButton>
          <UButton
            v-else-if="downloadPct(selected.uuid)! < 100"
            color="primary"
            size="lg"
            icon="i-fa6-solid:spinner"
            :ui="{ leadingIcon: 'animate-spin' }"
            block
            disabled
          >
            Sending to your table…
          </UButton>
          <UButton
            v-else
            color="success"
            variant="soft"
            size="lg"
            icon="i-fa6-solid:circle-check"
            block
            disabled
          >
            On your table
          </UButton>
          <p v-if="!tranquilLocal.connected" class="text-center text-xs text-white/50">
            Connect to your table on your network to add patterns.
          </p>
        </div>
      </template>
    </UModal>

    <!-- The store is the one login-gated Tranquil surface. -->
    <div
      v-if="!authStore.isLoggedIn"
      class="flex flex-col items-center gap-4 px-5 py-16 text-center"
    >
      <UIcon name="i-fa6-solid:store" class="h-8 w-8 text-white/30" />
      <p class="text-white/70">Sign in to browse the pattern store.</p>
      <UButton color="primary" @click="router.push('/login')">Sign in</UButton>
    </div>

    <template v-else>
      <!-- Search bar (slides out from the header, toggled by the header search button) -->
      <Transition
        enter-active-class="transition-all duration-200 ease-out"
        leave-active-class="transition-all duration-150 ease-in"
        enter-from-class="opacity-0 -translate-y-2"
        enter-to-class="opacity-100 translate-y-0"
        leave-from-class="opacity-100 translate-y-0"
        leave-to-class="opacity-0 -translate-y-2"
      >
        <div v-if="isSearchOpen" class="border-b border-white/10 px-5 py-3">
          <div class="relative">
            <UInput
              ref="searchInputRef"
              v-model="search"
              icon="i-fa6-solid:magnifying-glass"
              size="lg"
              class="w-full"
              :placeholder="mode === 'patterns' ? 'Search patterns…' : 'Search playlists…'"
            />
            <button
              v-if="search"
              type="button"
              class="absolute right-3 top-1/2 -translate-y-1/2 rounded p-1 text-white/50 hover:text-white/80"
              @click="search = ''"
            >
              <UIcon name="i-fa6-solid:xmark" class="h-4 w-4" />
            </button>
          </div>
        </div>
      </Transition>

      <!-- pb clears the fixed bottom tab bar -->
      <div class="flex flex-col gap-4 px-5 pt-6 pb-28">
        <!-- Sort panel (toggled by the header sliders button) -->
        <Transition
          enter-active-class="transition-all duration-200 ease-out"
          leave-active-class="transition-all duration-150 ease-in"
          enter-from-class="opacity-0 -translate-y-2"
          enter-to-class="opacity-100 translate-y-0"
          leave-from-class="opacity-100 translate-y-0"
          leave-to-class="opacity-0 -translate-y-2"
        >
          <div v-if="isSortOpen" class="space-y-4 rounded-lg border border-white/10 bg-white/5 p-4">
            <div class="flex items-center justify-between">
              <span class="text-sm font-medium text-white/70">Sort by</span>
              <div class="flex gap-2">
                <UButton
                  v-for="option in sortOptions"
                  :key="option.value"
                  size="xs"
                  :color="sortBy === option.value ? 'primary' : 'neutral'"
                  :variant="sortBy === option.value ? 'soft' : 'ghost'"
                  @click="sortBy = option.value"
                >
                  {{ option.label }}
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
                  icon="i-fa6-solid:arrow-up-short-wide"
                  @click="sortOrder = 'asc'"
                >
                  Asc
                </UButton>
                <UButton
                  size="xs"
                  :color="sortOrder === 'desc' ? 'primary' : 'neutral'"
                  :variant="sortOrder === 'desc' ? 'soft' : 'ghost'"
                  icon="i-fa6-solid:arrow-down-wide-short"
                  @click="sortOrder = 'desc'"
                >
                  Desc
                </UButton>
              </div>
            </div>
          </div>
        </Transition>

        <!-- Patterns / Curated Playlists pill-switcher -->
        <div class="flex rounded-full bg-white/10 p-1">
          <button
            v-for="tab in MODES"
            :key="tab.value"
            type="button"
            class="flex-1 rounded-full py-1.5 text-sm font-medium transition-colors"
            :class="mode === tab.value ? 'bg-white/20 text-white' : 'text-white/60'"
            @click="mode = tab.value"
          >
            {{ tab.label }}
          </button>
        </div>

        <UAlert
          v-if="errorKind === 'forbidden'"
          color="warning"
          icon="i-fa6-solid:lock"
          title="Store locked"
          :description="error ?? ''"
        />
        <UAlert
          v-else-if="error"
          color="error"
          icon="i-fa6-solid:circle-exclamation"
          :title="error"
        />

        <p v-if="notice" class="rounded-lg bg-white/5 px-3 py-2 text-sm text-white/70">
          {{ notice }}
        </p>

        <!-- ============ Patterns ============ -->
        <template v-if="mode === 'patterns'">
          <div v-if="loading && !patterns.length" class="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <USkeleton v-for="i in 6" :key="i" class="aspect-square w-full rounded-lg" />
          </div>

          <div
            v-else-if="!patterns.length && !error"
            class="rounded-lg border border-dashed border-white/20 p-8 text-center text-white/60"
          >
            {{ search ? 'No patterns match your search.' : 'No patterns in the store yet.' }}
          </div>

          <div v-else class="grid grid-cols-2 gap-4 sm:grid-cols-3">
            <button
              v-for="pattern in patterns"
              :key="pattern.uuid"
              type="button"
              class="flex flex-col gap-1.5"
              @click="selected = pattern"
            >
              <TranquilStoreThumb :uuid="pattern.uuid" :alt="pattern.name" />
              <p class="w-full truncate text-center text-sm">{{ pattern.name }}</p>
            </button>
          </div>

          <UButton
            v-if="hasMore"
            color="neutral"
            variant="soft"
            block
            :loading="loading"
            @click="loadMore"
          >
            Load more
          </UButton>
        </template>

        <!-- ============ Curated Playlists ============ -->
        <template v-else>
          <div v-if="plLoading && !playlists.length" class="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <USkeleton v-for="i in 6" :key="i" class="aspect-square w-full rounded-lg" />
          </div>

          <div
            v-else-if="!playlists.length && !error"
            class="rounded-lg border border-dashed border-white/20 p-8 text-center text-white/60"
          >
            {{ search ? 'No playlists match your search.' : 'No curated playlists yet.' }}
          </div>

          <div v-else class="grid grid-cols-2 gap-4 sm:grid-cols-3">
            <button
              v-for="pl in playlists"
              :key="pl.uuid"
              type="button"
              class="flex flex-col gap-1.5"
              @click="openPlaylist(pl)"
            >
              <TranquilStoreThumb :uuid="playlistThumb(pl)" :alt="pl.name" />
              <div class="w-full">
                <p class="truncate text-center text-sm">{{ pl.name }}</p>
                <p class="text-center text-xs text-white/40">{{ pl.patterns.length }} patterns</p>
              </div>
            </button>
          </div>

          <UButton
            v-if="plHasMore"
            color="neutral"
            variant="soft"
            block
            :loading="plLoading"
            @click="plLoadMore"
          >
            Load more
          </UButton>
        </template>
      </div>
    </template>

    <TranquilTabBar />
  </PageLayout>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import PageLayout from '@/layouts/PageLayout.vue'
import { usePageHeader } from '@/composables/usePageHeader'
import { useAuthStore } from '@/stores/auth/auth'
import { useTranquilLocalStore } from '@/stores/tranquilLocal'
import TranquilStoreThumb from '@/components/tranquil/TranquilStoreThumb.vue'
import TranquilTabBar from '@/components/tranquil/TranquilTabBar.vue'
import {
  tranquilStore,
  StoreError,
  type StorePattern,
  type StorePlaylist,
  type StoreErrorKind,
  type StoreSort,
} from '@/lib/tranquil/cloudStore'

const route = useRoute()
const router = useRouter()
const { setHeader } = usePageHeader()
const authStore = useAuthStore()
const tranquilLocal = useTranquilLocalStore()

const routeId = computed(() => route.params.id as string)

const MODES = [
  { value: 'patterns', label: 'Patterns' },
  { value: 'playlists', label: 'Curated Playlists' },
] as const

// ?tab=playlists keeps the active tab across navigation to/from playlist pages
const mode = ref<'patterns' | 'playlists'>(
  route.query.tab === 'playlists' ? 'playlists' : 'patterns',
)
const search = ref('')

const isSearchOpen = ref(false)
const searchInputRef = ref<{ $el: HTMLElement } | null>(null)

function toggleSearch() {
  isSearchOpen.value = !isSearchOpen.value
  if (isSearchOpen.value) {
    isSortOpen.value = false
    void nextTick(() => {
      searchInputRef.value?.$el?.querySelector('input')?.focus()
    })
  }
}

const isSortOpen = ref(false)
const sortBy = ref<StoreSort>('popularity')
const sortOrder = ref<'asc' | 'desc'>('desc')

// Playlists have no popularity — offer only what the store can sort by
const sortOptions = computed<{ value: StoreSort; label: string }[]>(() =>
  mode.value === 'patterns'
    ? [
        { value: 'popularity', label: 'Popularity' },
        { value: 'name', label: 'Name' },
        { value: 'created_at', label: 'Date' },
      ]
    : [
        { value: 'name', label: 'Name' },
        { value: 'created_at', label: 'Date' },
      ],
)

const listQuery = computed(() => {
  // If the active tab doesn't support the picked sort, fall back to its default
  const sort = sortOptions.value.some((o) => o.value === sortBy.value)
    ? sortBy.value
    : ('name' as StoreSort)
  return { search: search.value, sort, order: sortOrder.value }
})

const patterns = ref<StorePattern[]>([])
const page = ref(1) // store is 1-based
const totalPages = ref(1)
const loading = ref(false)

const playlists = ref<StorePlaylist[]>([])
const plPage = ref(1)
const plTotalPages = ref(1)
const plLoading = ref(false)

const error = ref<string | null>(null)
const errorKind = ref<StoreErrorKind | null>(null)
const notice = ref<string | null>(null)
const selected = ref<StorePattern | null>(null)

const hasMore = computed(() => page.value < totalPages.value)
const plHasMore = computed(() => plPage.value < plTotalPages.value)

function playlistThumb(pl: StorePlaylist): string {
  return pl.featured_pattern_uuid || pl.patterns[0]?.uuid || ''
}

function captureError(e: unknown) {
  error.value = e instanceof Error ? e.message : 'Failed to load the store'
  errorKind.value = e instanceof StoreError ? e.kind : 'http'
}

async function fetchPage(next: number) {
  if (!authStore.isLoggedIn) return
  loading.value = true
  error.value = null
  errorKind.value = null
  try {
    const res = await tranquilStore.listPatterns(next, 24, listQuery.value)
    patterns.value = next === 1 ? res.data : [...patterns.value, ...res.data]
    page.value = res.pagination.page
    totalPages.value = res.pagination.total_pages
  } catch (e) {
    captureError(e)
  } finally {
    loading.value = false
  }
}

async function fetchPlaylistPage(next: number) {
  if (!authStore.isLoggedIn) return
  plLoading.value = true
  error.value = null
  errorKind.value = null
  try {
    const res = await tranquilStore.listPlaylists(next, 24, listQuery.value)
    playlists.value = next === 1 ? res.data : [...playlists.value, ...res.data]
    plPage.value = res.pagination.page
    plTotalPages.value = res.pagination.total_pages
  } catch (e) {
    captureError(e)
  } finally {
    plLoading.value = false
  }
}

const refresh = () => (mode.value === 'patterns' ? fetchPage(1) : fetchPlaylistPage(1))
const loadMore = () => fetchPage(page.value + 1)
const plLoadMore = () => fetchPlaylistPage(plPage.value + 1)

function openPlaylist(pl: StorePlaylist) {
  router.push(`/tranquil/local/${encodeURIComponent(routeId.value)}/store/playlists/${pl.uuid}`)
}

// Refetch page 1 of the active list when the tab, sort, or (debounced) search changes.
let searchTimer: ReturnType<typeof setTimeout> | undefined
watch([mode, sortBy, sortOrder], () => void refresh())
// Mirror the tab into the URL so back-navigation from a playlist restores it
watch(mode, (m) =>
  router.replace({ query: { ...route.query, tab: m === 'playlists' ? 'playlists' : undefined } }),
)
watch(search, () => {
  clearTimeout(searchTimer)
  searchTimer = setTimeout(() => void refresh(), 300)
})
onUnmounted(() => clearTimeout(searchTimer))

// Tell the table to fetch this pattern from the cloud. The device does the
// encrypt-for-device + download itself over its device-plane link; we just send
// the uuid and watch progress via tranquilLocal.downloads.
const downloadPct = (uuid: string): number | undefined => tranquilLocal.downloads[uuid]

function addToTable(pattern: StorePattern) {
  notice.value = null
  if (!tranquilLocal.connected) {
    notice.value = 'Connect to your table on your network to add patterns.'
    return
  }
  try {
    tranquilLocal.requestPatternDownload(pattern.uuid)
    notice.value = `Sending "${pattern.name}" to your table…`
  } catch {
    notice.value = 'Could not reach your table. Try again.'
  }
}

// Re-applied when the search panel toggles so the header icon flips.
function applyHeader() {
  setHeader({
    title: 'Store',
    backRoute: `/tranquil/local/${encodeURIComponent(routeId.value)}`,
    actions: [
      {
        icon: isSearchOpen.value ? 'i-fa6-solid:xmark' : 'i-fa6-solid:magnifying-glass',
        onClick: toggleSearch,
      },
      { icon: 'i-fa6-solid:sliders', onClick: () => (isSortOpen.value = !isSortOpen.value) },
    ],
  })
}

watch(isSearchOpen, applyHeader)

onMounted(() => {
  applyHeader()
  void refresh()
})
</script>
