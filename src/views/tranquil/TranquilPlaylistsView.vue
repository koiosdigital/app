<template>
  <PageLayout :on-refresh="refresh">
    <UModal v-model:open="showNew" title="New playlist">
      <template #body>
        <UFormField label="Name">
          <UInput
            v-model="newName"
            placeholder="My playlist"
            size="lg"
            class="w-full"
            @keyup.enter="create"
          />
        </UFormField>
      </template>
      <template #footer>
        <div class="flex justify-end gap-3">
          <UButton color="neutral" variant="ghost" @click="showNew = false">Cancel</UButton>
          <UButton color="primary" :loading="creating" :disabled="!newName.trim()" @click="create">
            Create
          </UButton>
        </div>
      </template>
    </UModal>

    <div v-if="!isActive" class="flex flex-col items-center gap-4 px-5 py-16 text-center">
      <UIcon name="i-fa6-solid:wifi" class="h-8 w-8 text-white/30" />
      <p class="text-white/70">This table isn't connected. Open it from your device list.</p>
      <UButton color="primary" variant="soft" @click="router.replace('/')">Go to devices</UButton>
    </div>

    <!-- pb clears the fixed bottom tab bar -->
    <div v-else class="flex flex-col gap-4 px-5 pt-6 pb-28">
      <UAlert v-if="error" color="error" icon="i-fa6-solid:circle-exclamation" :title="error" />

      <div v-if="loading && !playlists.length" class="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <USkeleton v-for="i in 6" :key="i" class="aspect-square w-full rounded-lg" />
      </div>

      <div
        v-else-if="!playlists.length"
        class="rounded-lg border border-dashed border-white/20 p-8 text-center text-white/60"
      >
        No playlists yet. Create one to sequence your patterns.
      </div>

      <div v-else class="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <button
          v-for="playlist in playlists"
          :key="playlist.uuid"
          type="button"
          class="flex flex-col gap-1.5"
          @click="openEditor(playlist)"
        >
          <TranquilPatternThumb :src="playlistThumb(playlist)" :alt="playlist.name" />
          <div class="w-full">
            <p class="truncate text-center text-sm">{{ playlist.name }}</p>
            <p class="text-center text-xs text-white/40">
              {{ playlist.pattern_uuids.length }} patterns
            </p>
          </div>
        </button>
      </div>
    </div>

    <TranquilTabBar />
  </PageLayout>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import PageLayout from '@/layouts/PageLayout.vue'
import TranquilPatternThumb from '@/components/tranquil/TranquilPatternThumb.vue'
import TranquilTabBar from '@/components/tranquil/TranquilTabBar.vue'
import { usePageHeader } from '@/composables/usePageHeader'
import { useTranquilLocalStore } from '@/stores/tranquilLocal'
import { formatTranquilError } from '@/lib/tranquil/local/errors'
import type { Playlist } from '@/lib/tranquil/local/types'

const route = useRoute()
const router = useRouter()
const { setHeader } = usePageHeader()
const store = useTranquilLocalStore()

const routeId = computed(() => route.params.id as string)
const isActive = computed(() => store.activeDevice?.id === routeId.value)

const playlists = ref<Playlist[]>([])
const loading = ref(false)
const error = ref<string | null>(null)

const showNew = ref(false)
const newName = ref('')
const creating = ref(false)

function playlistThumb(pl: Playlist): string {
  const uuid = pl.featured_pattern || pl.pattern_uuids[0]
  const base = store.baseUrl()
  return uuid && base ? `${base}/api/pattern_thumbs/${uuid}.png` : ''
}

async function refresh() {
  if (!isActive.value) return
  loading.value = true
  error.value = null
  try {
    const res = await store.api().playlists.list(0, 100)
    playlists.value = res.playlists
  } catch (e) {
    error.value = formatTranquilError(e)
  } finally {
    loading.value = false
  }
}

function openEditor(pl: Playlist) {
  router.push(`/tranquil/local/${encodeURIComponent(routeId.value)}/playlists/${pl.uuid}`)
}

async function create() {
  if (!newName.value.trim()) return
  creating.value = true
  try {
    const pl = await store.api().playlists.create({ name: newName.value.trim() })
    showNew.value = false
    newName.value = ''
    openEditor(pl)
  } catch (e) {
    error.value = formatTranquilError(e)
  } finally {
    creating.value = false
  }
}

onMounted(() => {
  setHeader({
    title: 'Playlists',
    backRoute: `/tranquil/local/${encodeURIComponent(routeId.value)}`,
    actions: [{ icon: 'i-fa6-solid:plus', onClick: () => (showNew.value = true) }],
  })
  void refresh()
})
</script>
