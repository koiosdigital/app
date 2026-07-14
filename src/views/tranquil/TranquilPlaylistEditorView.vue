<template>
  <PageLayout>
    <UModal v-model:open="showPicker" title="Add pattern">
      <template #body>
        <p v-if="!availablePatterns.length" class="py-4 text-center text-sm text-white/60">
          Every pattern is already in this playlist.
        </p>
        <div v-else class="grid max-h-[60vh] grid-cols-3 gap-3 overflow-auto">
          <button
            v-for="pattern in availablePatterns"
            :key="pattern.uuid"
            class="flex flex-col gap-1"
            @click="addPattern(pattern)"
          >
            <TranquilPatternThumb :src="thumbUrl(pattern.uuid)" :alt="pattern.name" />
            <span class="truncate text-xs text-white/70">{{ pattern.name }}</span>
          </button>
        </div>
      </template>
    </UModal>

    <DangerConfirmModal
      v-model="showDelete"
      title="Delete playlist"
      :message="`Delete “${playlist?.name ?? ''}”? Patterns stay on the table.`"
      confirm-text="Delete"
      @confirm="confirmDelete"
    />

    <div v-if="!isActive" class="flex flex-col items-center gap-4 px-5 py-16 text-center">
      <UIcon name="i-fa6-solid:wifi" class="h-8 w-8 text-white/30" />
      <p class="text-white/70">This table isn't connected. Open it from your device list.</p>
      <UButton color="primary" variant="soft" @click="router.replace('/')">Go to devices</UButton>
    </div>

    <div v-else-if="loading" class="flex flex-1 items-center justify-center py-20">
      <UIcon name="i-fa6-solid:spinner" class="h-8 w-8 animate-spin text-white/50" />
    </div>

    <div v-else-if="playlist" class="flex flex-col gap-6 px-5 py-6 pb-28">
      <UAlert v-if="error" color="error" icon="i-fa6-solid:circle-exclamation" :title="error" />

      <div class="mx-auto w-full max-w-xs">
        <TranquilPatternThumb :src="featuredThumb" :alt="playlist.name" />
      </div>

      <div class="text-center">
        <h2 class="text-xl font-semibold">{{ playlist.name }}</h2>
        <p class="text-sm text-white/50">{{ playlistPatterns.length }} patterns</p>
      </div>

      <UButton
        color="primary"
        size="lg"
        block
        icon="i-fa6-solid:play"
        :disabled="!playlistPatterns.length"
        :loading="playing"
        @click="playAll"
      >
        Play
      </UButton>

      <p
        v-if="!playlistPatterns.length"
        class="rounded-lg border border-dashed border-white/20 p-8 text-center text-white/60"
      >
        No patterns yet. Add some below.
      </p>

      <div v-else class="flex flex-col gap-2">
        <UCard
          v-for="(pattern, index) in playlistPatterns"
          :key="pattern.uuid"
          class="bg-white/5"
          :ui="{ body: 'p-2' }"
        >
          <div class="flex items-center gap-3">
            <div class="w-12 shrink-0">
              <TranquilPatternThumb :src="thumbUrl(pattern.uuid)" flat :alt="pattern.name" />
            </div>
            <div class="min-w-0 flex-1">
              <p class="truncate text-sm font-medium">{{ pattern.name }}</p>
              <p class="text-xs text-white/40">#{{ index + 1 }}</p>
            </div>
            <UButton
              color="primary"
              variant="ghost"
              icon="i-fa6-solid:play"
              square
              size="sm"
              @click="playFrom(pattern.uuid)"
            />
            <UButton
              color="neutral"
              variant="ghost"
              icon="i-fa6-solid:xmark"
              square
              size="sm"
              @click="removePattern(pattern.uuid)"
            />
          </div>
        </UCard>
      </div>
    </div>

    <Teleport v-if="isActive && playlist" to="#app-footer">
      <div class="border-t border-white/10 bg-black/80 p-3 backdrop-blur">
        <UButton
          color="neutral"
          variant="soft"
          block
          size="lg"
          icon="i-fa6-solid:plus"
          @click="showPicker = true"
        >
          Add patterns
        </UButton>
      </div>
    </Teleport>
  </PageLayout>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import PageLayout from '@/layouts/PageLayout.vue'
import DangerConfirmModal from '@/components/DangerConfirmModal.vue'
import TranquilPatternThumb from '@/components/tranquil/TranquilPatternThumb.vue'
import { usePageHeader } from '@/composables/usePageHeader'
import { useTranquilLocalStore } from '@/stores/tranquilLocal'
import { formatTranquilError } from '@/lib/tranquil/local/errors'
import type { Pattern, Playlist } from '@/lib/tranquil/local/types'

const route = useRoute()
const router = useRouter()
const { setHeader } = usePageHeader()
const store = useTranquilLocalStore()

const routeId = computed(() => route.params.id as string)
const playlistUuid = computed(() => route.params.uuid as string)
const isActive = computed(() => store.activeDevice?.id === routeId.value)

const playlist = ref<Playlist | null>(null)
const allPatterns = ref<Pattern[]>([])
const loading = ref(true)
const playing = ref(false)
const error = ref<string | null>(null)
const showPicker = ref(false)
const showDelete = ref(false)

const patternsByUuid = computed(() => new Map(allPatterns.value.map((p) => [p.uuid, p])))

const playlistPatterns = computed<Pattern[]>(() =>
  playlist.value
    ? playlist.value.pattern_uuids
        .map((id) => patternsByUuid.value.get(id))
        .filter((p): p is Pattern => p !== undefined)
    : [],
)

const availablePatterns = computed<Pattern[]>(() => {
  if (!playlist.value) return allPatterns.value
  const inList = new Set(playlist.value.pattern_uuids)
  return allPatterns.value.filter((p) => !inList.has(p.uuid))
})

function thumbUrl(uuid: string): string {
  const base = store.baseUrl()
  return base ? `${base}/api/pattern_thumbs/${uuid}.png` : ''
}

const featuredThumb = computed(() => {
  const pl = playlist.value
  const uuid = pl ? pl.featured_pattern || pl.pattern_uuids[0] : undefined
  return uuid ? thumbUrl(uuid) : ''
})

async function load() {
  if (!isActive.value) {
    loading.value = false
    return
  }
  loading.value = true
  error.value = null
  try {
    const [pl, patterns] = await Promise.all([
      store.api().playlists.get(playlistUuid.value),
      store.api().patterns.list(0, 100),
    ])
    playlist.value = pl
    allPatterns.value = patterns.patterns
    setHeader({
      title: pl.name,
      backRoute: `/tranquil/local/${encodeURIComponent(routeId.value)}/playlists`,
      actions: [{ icon: 'i-fa6-solid:trash', onClick: () => (showDelete.value = true) }],
    })
  } catch (e) {
    error.value = formatTranquilError(e)
  } finally {
    loading.value = false
  }
}

async function playAll() {
  if (!playlist.value) return
  playing.value = true
  try {
    await store.play(undefined, playlist.value.uuid)
    router.push(`/tranquil/local/${encodeURIComponent(routeId.value)}`)
  } catch (e) {
    error.value = formatTranquilError(e)
  } finally {
    playing.value = false
  }
}

async function confirmDelete() {
  if (!playlist.value) return
  try {
    await store.api().playlists.delete(playlist.value.uuid)
    router.replace(`/tranquil/local/${encodeURIComponent(routeId.value)}/playlists`)
  } catch (e) {
    error.value = formatTranquilError(e)
  } finally {
    showDelete.value = false
  }
}

async function playFrom(patternUuid: string) {
  if (!playlist.value) return
  try {
    await store.play(patternUuid, playlist.value.uuid)
    router.push(`/tranquil/local/${encodeURIComponent(routeId.value)}`)
  } catch (e) {
    error.value = formatTranquilError(e)
  }
}

async function removePattern(patternUuid: string) {
  if (!playlist.value) return
  try {
    playlist.value = await store
      .api()
      .playlists.modify(playlist.value.uuid, { action: 'remove', pattern_uuid: patternUuid })
  } catch (e) {
    error.value = formatTranquilError(e)
  }
}

async function addPattern(pattern: Pattern) {
  if (!playlist.value) return
  showPicker.value = false
  try {
    playlist.value = await store
      .api()
      .playlists.modify(playlist.value.uuid, { action: 'add', pattern_uuid: pattern.uuid })
  } catch (e) {
    error.value = formatTranquilError(e)
  }
}

onMounted(() => {
  setHeader({
    title: 'Playlist',
    backRoute: `/tranquil/local/${encodeURIComponent(routeId.value)}/playlists`,
  })
  void load()
})
</script>
