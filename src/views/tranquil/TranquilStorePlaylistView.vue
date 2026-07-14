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
            v-if="downloadPct(pattern.uuid) === undefined"
            color="primary"
            variant="ghost"
            size="sm"
            square
            icon="i-fa6-solid:down-to-bracket"
            :disabled="!tranquilLocal.connected"
            :aria-label="`Add ${pattern.name} to table`"
            @click="addToTable(pattern)"
          />
          <span
            v-else-if="downloadPct(pattern.uuid)! < 100"
            class="text-xs tabular-nums text-primary-400"
          >
            {{ downloadPct(pattern.uuid) }}%
          </span>
          <UIcon v-else name="i-fa6-solid:circle-check" class="h-4 w-4 text-green-400" />
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
import { computed, onMounted, ref } from 'vue'
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
