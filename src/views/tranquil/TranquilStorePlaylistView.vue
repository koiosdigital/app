<template>
  <PageLayout>
    <!-- The store is the one login-gated Tranquil surface. -->
    <div
      v-if="!authStore.isLoggedIn"
      class="flex flex-col items-center gap-4 px-5 py-16 text-center"
    >
      <UIcon name="i-fa6-solid:store" class="h-8 w-8 text-white/30" />
      <p class="text-white/70">Sign in to browse the pattern store.</p>
      <UButton color="primary" @click="router.push('/login')">Sign in</UButton>
    </div>

    <div v-else-if="loading" class="flex flex-1 items-center justify-center py-20">
      <UIcon name="i-fa6-solid:spinner" class="h-8 w-8 animate-spin text-white/50" />
    </div>

    <!-- pb clears the fixed bottom tab bar -->
    <div v-else-if="playlist" class="flex flex-col gap-6 px-5 pt-6 pb-28">
      <UAlert v-if="error" color="error" icon="i-fa6-solid:circle-exclamation" :title="error" />

      <div class="mx-auto w-full max-w-xs">
        <TranquilStoreThumb :uuid="featuredUuid" :alt="playlist.name" />
      </div>

      <div class="text-center">
        <h2 class="text-xl font-semibold">{{ playlist.name }}</h2>
        <p v-if="playlist.description" class="text-sm text-white/60">
          {{ playlist.description }}
        </p>
        <p class="text-xs text-white/40">{{ playlist.patterns.length }} patterns</p>
      </div>

      <!-- Whole-playlist action: fetch every pattern, then save the playlist. -->
      <div class="flex flex-col gap-1.5">
        <UButton
          color="primary"
          size="lg"
          block
          :icon="bulkBusy ? 'i-fa6-solid:spinner' : 'i-fa6-solid:layer-group'"
          :ui="bulkBusy ? { leadingIcon: 'animate-spin' } : undefined"
          :disabled="!tranquilLocal.connected || bulkBusy || !playlist.patterns.length"
          @click="downloadEntirePlaylist"
        >
          {{ bulkLabel }}
        </UButton>
        <p v-if="bulkBusy && bulkCurrent" class="truncate text-center text-xs text-white/50">
          {{ bulkCurrent }}
        </p>
        <p v-else class="text-center text-xs text-white/40">
          or add patterns individually below
        </p>
      </div>

      <p v-if="notice" class="rounded-lg bg-white/5 px-3 py-2 text-sm text-white/70">
        {{ notice }}
      </p>

      <div class="flex flex-col gap-2">
        <div
          v-for="pattern in playlist.patterns"
          :key="pattern.uuid"
          class="flex items-center gap-3 rounded-lg bg-white/5 p-2"
        >
          <div class="w-12 shrink-0">
            <TranquilStoreThumb :uuid="pattern.uuid" :alt="pattern.name" />
          </div>
          <div class="min-w-0 flex-1">
            <p class="truncate text-sm font-medium">{{ pattern.name }}</p>
            <p v-if="pattern.creator" class="truncate text-xs text-white/50">
              {{ pattern.creator }}
            </p>
          </div>
          <UButton
            v-if="!downloadState(pattern.uuid)"
            color="primary"
            variant="ghost"
            size="sm"
            square
            icon="i-fa6-solid:down-to-bracket"
            :disabled="!tranquilLocal.connected"
            :aria-label="`Add ${pattern.name} to table`"
            @click="addToTable(pattern)"
          />
          <UButton
            v-else-if="downloadState(pattern.uuid)!.failed"
            color="error"
            variant="ghost"
            size="sm"
            square
            icon="i-fa6-solid:arrow-rotate-right"
            :disabled="!tranquilLocal.connected"
            :aria-label="`Retry ${pattern.name}`"
            :title="downloadState(pattern.uuid)!.error || 'Download failed'"
            @click="retry(pattern)"
          />
          <span
            v-else-if="downloadState(pattern.uuid)!.pct < 100"
            class="text-xs tabular-nums text-primary-400"
          >
            {{ downloadState(pattern.uuid)!.pct }}%
          </span>
          <UIcon v-else name="i-fa6-solid:circle-check" class="h-4 w-4 text-success" />
        </div>
      </div>

      <p v-if="!tranquilLocal.connected" class="text-center text-xs text-white/50">
        Connect to your table on your network to add patterns.
      </p>
    </div>

    <div v-else class="flex flex-col items-center gap-4 px-5 py-16 text-center">
      <UIcon name="i-fa6-solid:circle-exclamation" class="h-8 w-8 text-white/30" />
      <p class="text-white/70">{{ error ?? 'Playlist not found in the store.' }}</p>
      <UButton color="neutral" variant="soft" @click="router.back()">Go back</UButton>
    </div>

    <TranquilTabBar />
  </PageLayout>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import PageLayout from '@/layouts/PageLayout.vue'
import { usePageHeader } from '@/composables/usePageHeader'
import { useAuthStore } from '@/stores/auth/auth'
import { useTranquilLocalStore } from '@/stores/tranquilLocal'
import TranquilStoreThumb from '@/components/tranquil/TranquilStoreThumb.vue'
import TranquilTabBar from '@/components/tranquil/TranquilTabBar.vue'
import { tranquilStore, type StorePattern, type StorePlaylist } from '@/lib/tranquil/cloudStore'

const route = useRoute()
const router = useRouter()
const { setHeader } = usePageHeader()
const authStore = useAuthStore()
const tranquilLocal = useTranquilLocalStore()

const routeId = computed(() => route.params.id as string)
const uuid = route.params.uuid as string
const backRoute = computed(
  () => `/tranquil/local/${encodeURIComponent(routeId.value)}/store?tab=playlists`,
)

const playlist = ref<StorePlaylist | null>(null)
const loading = ref(true)
const error = ref<string | null>(null)
const notice = ref<string | null>(null)

const featuredUuid = computed(() => {
  const pl = playlist.value
  return pl ? pl.featured_pattern_uuid || pl.patterns[0]?.uuid || '' : ''
})

// Same download flow as the store view: the table fetches the pattern itself;
// we send the uuid and watch progress via tranquilLocal.downloads.
const downloadState = (uuid: string) => tranquilLocal.downloads[uuid]

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

function retry(pattern: StorePattern) {
  tranquilLocal.clearDownload(pattern.uuid)
  addToTable(pattern)
}

// ---- Whole-playlist download ----------------------------------------------
// Fetch every missing pattern one by one (the table already has some), then
// POST the playlist manifest so it appears as a playlist on the table.

const bulkBusy = ref(false)
const bulkStep = ref<null | 'checking' | 'downloading' | 'creating'>(null)
const bulkDone = ref(0)
const bulkTotal = ref(0)
const bulkCurrent = ref('')

const bulkLabel = computed(() => {
  switch (bulkStep.value) {
    case 'checking':
      return 'Checking your table…'
    case 'downloading':
      return `Downloading ${bulkDone.value}/${bulkTotal.value}…`
    case 'creating':
      return 'Saving playlist…'
    default:
      return 'Add entire playlist to table'
  }
})

// Every pattern already on the table (keyed by store uuid = device external uuid).
async function fetchDevicePatternUuids(): Promise<Set<string>> {
  const present = new Set<string>()
  let page = 0
  // Hard page cap so a bad total_pages can't loop forever.
  for (let i = 0; i < 100; i++) {
    const res = await tranquilLocal.api().patterns.list(page, 50)
    for (const p of res.patterns) present.add(p.uuid)
    if (page + 1 >= res.pagination.total_pages) break
    page++
  }
  return present
}

// Request one pattern and resolve when the table reports it done, or reject on
// failure. The store's stall watchdog flips a stuck download to failed, so this
// can't hang forever.
function downloadOne(pattern: StorePattern): Promise<void> {
  return new Promise((resolve, reject) => {
    const cur = tranquilLocal.downloads[pattern.uuid]
    if (cur && !cur.failed && cur.pct >= 100) {
      resolve()
      return
    }
    if (cur) tranquilLocal.clearDownload(pattern.uuid)
    try {
      tranquilLocal.requestPatternDownload(pattern.uuid)
    } catch (e) {
      reject(e instanceof Error ? e : new Error('Failed to start download'))
      return
    }
    const stop = watch(
      () => tranquilLocal.downloads[pattern.uuid],
      (s) => {
        if (!s) return
        if (s.failed) {
          stop()
          reject(new Error(s.error || `Failed to download ${pattern.name}`))
        } else if (s.pct >= 100) {
          stop()
          resolve()
        }
      },
      { immediate: true },
    )
  })
}

async function downloadEntirePlaylist() {
  const pl = playlist.value
  if (!pl) return
  notice.value = null
  error.value = null
  if (!tranquilLocal.connected) {
    notice.value = 'Connect to your table on your network to add patterns.'
    return
  }

  bulkBusy.value = true
  bulkStep.value = 'checking'
  bulkDone.value = 0
  bulkTotal.value = 0
  bulkCurrent.value = ''
  const failures: string[] = []

  try {
    const present = await fetchDevicePatternUuids()
    const missing = pl.patterns.filter((p) => !present.has(p.uuid))

    bulkStep.value = 'downloading'
    bulkTotal.value = missing.length
    for (const p of missing) {
      bulkCurrent.value = p.name
      try {
        await downloadOne(p)
      } catch {
        // Keep going — a missing pattern just becomes a dead entry the table
        // skips, and the user can retry it individually afterwards.
        failures.push(p.name)
      }
      bulkDone.value += 1
    }

    // Send the manifest last: the full pattern list, in playlist order.
    bulkStep.value = 'creating'
    bulkCurrent.value = ''
    await tranquilLocal.api().playlists.create({
      name: pl.name,
      description: pl.description || '',
      pattern_uuids: pl.patterns.map((p) => p.uuid),
    })

    notice.value = failures.length
      ? `"${pl.name}" saved, but ${failures.length} pattern${failures.length > 1 ? 's' : ''} couldn't download.`
      : `"${pl.name}" added to your table.`
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Failed to add the playlist'
  } finally {
    bulkBusy.value = false
    bulkStep.value = null
    bulkCurrent.value = ''
  }
}

onMounted(async () => {
  setHeader({ title: 'Playlist', backRoute: backRoute.value })
  if (!authStore.isLoggedIn) {
    loading.value = false
    return
  }
  try {
    playlist.value = await tranquilStore.getPlaylist(uuid)
    setHeader({ title: playlist.value.name, backRoute: backRoute.value })
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Failed to load the playlist'
  } finally {
    loading.value = false
  }
})
</script>
