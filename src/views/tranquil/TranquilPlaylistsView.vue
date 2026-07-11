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

    <DangerConfirmModal
      v-model="showDelete"
      title="Delete playlist"
      :message="`Delete “${pendingDelete?.name ?? ''}”? Patterns stay on the table.`"
      confirm-text="Delete"
      @confirm="confirmDelete"
    />

    <div v-if="!isActive" class="flex flex-col items-center gap-4 px-5 py-16 text-center">
      <UIcon name="i-fa6-solid:wifi" class="h-8 w-8 text-white/30" />
      <p class="text-white/70">This table isn't connected. Open it from your device list.</p>
      <UButton color="primary" variant="soft" @click="router.replace('/')">Go to devices</UButton>
    </div>

    <div v-else class="flex flex-col gap-4 px-5 py-6">
      <UAlert v-if="error" color="error" icon="i-fa6-solid:circle-exclamation" :title="error" />

      <div v-if="loading && !playlists.length" class="flex justify-center py-10">
        <UIcon name="i-fa6-solid:spinner" class="h-7 w-7 animate-spin text-white/50" />
      </div>

      <div
        v-else-if="!playlists.length"
        class="rounded-lg border border-dashed border-white/20 p-8 text-center text-white/60"
      >
        No playlists yet. Create one to sequence your patterns.
      </div>

      <div v-else class="flex flex-col gap-3">
        <UCard
          v-for="playlist in playlists"
          :key="playlist.uuid"
          class="cursor-pointer bg-white/5"
          :ui="{ body: 'p-3' }"
          @click="openEditor(playlist)"
        >
          <div class="flex items-center gap-3">
            <div class="w-14 shrink-0">
              <TranquilPatternThumb :src="playlistThumb(playlist)" flat :alt="playlist.name" />
            </div>
            <div class="min-w-0 flex-1">
              <p class="truncate font-medium">{{ playlist.name }}</p>
              <p class="text-sm text-white/50">{{ playlist.pattern_uuids.length }} patterns</p>
            </div>
            <UButton
              color="primary"
              variant="ghost"
              icon="i-fa6-solid:play"
              square
              @click.stop="play(playlist)"
            />
            <UButton
              color="error"
              variant="ghost"
              icon="i-fa6-solid:trash"
              square
              @click.stop="askDelete(playlist)"
            />
          </div>
        </UCard>
      </div>
    </div>
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

const showDelete = ref(false)
const pendingDelete = ref<Playlist | null>(null)

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

async function play(pl: Playlist) {
  try {
    await store.play(undefined, pl.uuid)
    router.push(`/tranquil/local/${encodeURIComponent(routeId.value)}`)
  } catch (e) {
    error.value = formatTranquilError(e)
  }
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

function askDelete(pl: Playlist) {
  pendingDelete.value = pl
  showDelete.value = true
}

async function confirmDelete() {
  const pl = pendingDelete.value
  if (!pl) return
  try {
    await store.api().playlists.delete(pl.uuid)
    playlists.value = playlists.value.filter((p) => p.uuid !== pl.uuid)
  } catch (e) {
    error.value = formatTranquilError(e)
  } finally {
    showDelete.value = false
    pendingDelete.value = null
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
