<template>
  <PageLayout>
    <!-- Add to playlist -->
    <UModal v-model:open="showPlaylists" title="Add to playlist">
      <template #body>
        <div v-if="playlistsLoading" class="flex justify-center py-8">
          <UIcon name="i-fa6-solid:spinner" class="h-6 w-6 animate-spin text-white/50" />
        </div>
        <div
          v-else-if="!playlists.length"
          class="rounded-lg border border-dashed border-white/20 p-6 text-center text-sm text-white/60"
        >
          No playlists yet. Create one from the Playlists tab.
        </div>
        <div v-else class="flex flex-col gap-2">
          <button
            v-for="pl in playlists"
            :key="pl.uuid"
            type="button"
            class="flex items-center gap-3 rounded-lg bg-white/5 p-3 text-left transition-colors hover:bg-white/10 disabled:opacity-60"
            :disabled="pl.pattern_uuids.includes(uuid) || addingTo === pl.uuid"
            @click="addToPlaylist(pl)"
          >
            <div class="min-w-0 flex-1">
              <p class="truncate font-medium">{{ pl.name }}</p>
              <p class="text-xs text-white/50">{{ pl.pattern_uuids.length }} patterns</p>
            </div>
            <UIcon
              v-if="pl.pattern_uuids.includes(uuid)"
              name="i-fa6-solid:circle-check"
              class="h-5 w-5 shrink-0 text-green-400"
            />
            <UIcon
              v-else-if="addingTo === pl.uuid"
              name="i-fa6-solid:spinner"
              class="h-5 w-5 shrink-0 animate-spin text-white/50"
            />
            <UIcon v-else name="i-fa6-solid:plus" class="h-5 w-5 shrink-0 text-white/40" />
          </button>
        </div>
      </template>
    </UModal>

    <DangerConfirmModal
      v-model="showDelete"
      title="Delete pattern"
      :message="`Delete “${pattern?.name ?? ''}” from your table? This cannot be undone.`"
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

    <!-- pb clears the fixed bottom tab bar -->
    <div v-else-if="pattern" class="flex flex-col gap-6 px-5 pt-6 pb-28">
      <UAlert v-if="error" color="error" icon="i-fa6-solid:circle-exclamation" :title="error" />

      <div class="mx-auto w-full max-w-xs">
        <TranquilPatternThumb :src="thumbnailUrl" :alt="pattern.name" />
      </div>

      <div class="text-center">
        <h2 class="text-xl font-semibold">{{ pattern.name }}</h2>
        <p v-if="pattern.creator" class="text-sm text-white/60">by {{ pattern.creator }}</p>
      </div>

      <div class="flex flex-col gap-3">
        <UButton
          color="primary"
          size="lg"
          block
          icon="i-fa6-solid:play"
          :loading="playing"
          @click="play"
        >
          Play
        </UButton>
        <UButton
          color="neutral"
          variant="soft"
          size="lg"
          block
          icon="i-fa6-solid:list"
          @click="openPlaylists"
        >
          Add to playlist
        </UButton>
        <UButton
          color="error"
          variant="soft"
          size="lg"
          block
          icon="i-fa6-solid:trash"
          @click="showDelete = true"
        >
          Delete
        </UButton>
      </div>
    </div>

    <div v-else class="flex flex-col items-center gap-4 px-5 py-16 text-center">
      <UIcon name="i-fa6-solid:circle-exclamation" class="h-8 w-8 text-white/30" />
      <p class="text-white/70">{{ error ?? 'Pattern not found on this table.' }}</p>
      <UButton color="neutral" variant="soft" @click="router.back()">Go back</UButton>
    </div>

    <TranquilTabBar />
  </PageLayout>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import PageLayout from '@/layouts/PageLayout.vue'
import DangerConfirmModal from '@/components/DangerConfirmModal.vue'
import TranquilPatternThumb from '@/components/tranquil/TranquilPatternThumb.vue'
import TranquilTabBar from '@/components/tranquil/TranquilTabBar.vue'
import { usePageHeader } from '@/composables/usePageHeader'
import { useTranquilLocalStore } from '@/stores/tranquilLocal'
import { formatTranquilError } from '@/lib/tranquil/local/errors'
import type { Pattern, Playlist } from '@/lib/tranquil/local/types'

const route = useRoute()
const router = useRouter()
const { setHeader } = usePageHeader()
const store = useTranquilLocalStore()

const routeId = computed(() => route.params.id as string)
const uuid = route.params.uuid as string
const isActive = computed(() => store.activeDevice?.id === routeId.value)

const pattern = ref<Pattern | null>(null)
const loading = ref(true)
const playing = ref(false)
const error = ref<string | null>(null)

const showDelete = ref(false)
const showPlaylists = ref(false)
const playlists = ref<Playlist[]>([])
const playlistsLoading = ref(false)
const addingTo = ref<string | null>(null)

const thumbnailUrl = computed(() => {
  const base = store.baseUrl()
  return base ? `${base}/api/pattern_thumbs/${uuid}.png` : ''
})

async function play() {
  playing.value = true
  error.value = null
  try {
    await store.play(uuid)
    router.push(`/tranquil/local/${encodeURIComponent(routeId.value)}`)
  } catch (e) {
    error.value = formatTranquilError(e)
  } finally {
    playing.value = false
  }
}

async function openPlaylists() {
  showPlaylists.value = true
  playlistsLoading.value = true
  try {
    const res = await store.api().playlists.list(0, 100)
    playlists.value = res.playlists
  } catch (e) {
    error.value = formatTranquilError(e)
    showPlaylists.value = false
  } finally {
    playlistsLoading.value = false
  }
}

async function addToPlaylist(pl: Playlist) {
  addingTo.value = pl.uuid
  error.value = null
  try {
    const updated = await store.api().playlists.modify(pl.uuid, {
      action: 'add',
      pattern_uuid: uuid,
    })
    // Reflect membership in the modal (shows the green check, disables the row)
    playlists.value = playlists.value.map((p) => (p.uuid === updated.uuid ? updated : p))
  } catch (e) {
    error.value = formatTranquilError(e)
    showPlaylists.value = false
  } finally {
    addingTo.value = null
  }
}

async function confirmDelete() {
  error.value = null
  try {
    await store.api().patterns.delete(uuid)
    router.replace(`/tranquil/local/${encodeURIComponent(routeId.value)}/patterns`)
  } catch (e) {
    error.value = formatTranquilError(e)
  } finally {
    showDelete.value = false
  }
}

onMounted(async () => {
  setHeader({
    title: 'Pattern',
    backRoute: `/tranquil/local/${encodeURIComponent(routeId.value)}/patterns`,
  })
  if (!isActive.value) {
    loading.value = false
    return
  }
  try {
    pattern.value = await store.api().patterns.get(uuid)
    setHeader({
      title: pattern.value.name,
      backRoute: `/tranquil/local/${encodeURIComponent(routeId.value)}/patterns`,
    })
  } catch (e) {
    error.value = formatTranquilError(e)
  } finally {
    loading.value = false
  }
})
</script>
