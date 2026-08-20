<template>
  <PageLayout :on-refresh="load">
    <NemotoSavePresetModal
      v-model:open="showSavePreset"
      :device-id="deviceId"
      :flaps="presetSource?.flaps ?? null"
      :suggested-name="presetSource?.name ?? ''"
    />

    <div class="flex flex-col gap-6 px-5 py-6 pb-10">
      <SkeletonList
        v-if="loading"
        :count="4"
        variant="tile"
        ratio="22 / 6"
        grid-class="grid-cols-1"
      />

      <UAlert
        v-else-if="error"
        color="error"
        icon="i-fa6-solid:circle-exclamation"
        :title="error"
      />

      <template v-else>
        <!-- Starred frames come first. The server keeps its own copy of each
             one, so they outlive the history prune below. -->
        <section v-if="favorites.length" class="flex flex-col gap-4">
          <h2 class="text-sm font-semibold">Starred</h2>

          <article v-for="favorite in favorites" :key="favorite.id" class="flex flex-col gap-2">
            <div class="k-bezel w-full">
              <NemotoFlapGrid :flaps="favorite.flaps" />
            </div>
            <div class="flex items-center justify-between gap-3 px-0.5">
              <p class="min-w-0 truncate text-sm text-white/60">
                Starred {{ formatRelativeTime(favorite.savedAt) }}
              </p>
              <div class="flex shrink-0 items-center gap-1">
                <UButton
                  color="primary"
                  variant="soft"
                  size="sm"
                  icon="i-fa6-solid:paper-plane"
                  :loading="displaying === favorite.id"
                  :disabled="!!displaying"
                  aria-label="Put this back on the board"
                  @click="display(favorite.id, favorite.flaps)"
                />
                <UButton
                  color="neutral"
                  variant="ghost"
                  size="sm"
                  icon="i-fa6-solid:bookmark"
                  aria-label="Save as preset"
                  @click="openSavePreset(favorite.flaps)"
                />
                <UButton
                  color="primary"
                  variant="ghost"
                  size="sm"
                  icon="i-fa6-solid:star"
                  :loading="starring === favorite.id"
                  :disabled="!!starring"
                  aria-label="Remove star"
                  @click="unstar(favorite)"
                />
              </div>
            </div>
          </article>
        </section>

        <div
          v-if="!messages.length && !favorites.length"
          class="rounded-lg border border-dashed border-white/20 p-8 text-center text-white/60"
        >
          Nothing sent yet. Messages you push to this board show up here.
        </div>

        <section v-if="messages.length" class="flex flex-col gap-4">
          <h2 v-if="favorites.length" class="text-sm font-semibold">Recent</h2>

          <div class="k-stagger flex flex-col gap-4">
            <article v-for="message in messages" :key="message.id" class="flex flex-col gap-2">
              <div class="k-bezel w-full">
                <NemotoFlapGrid :flaps="message.flaps" />
              </div>
              <div class="flex items-center justify-between gap-3 px-0.5">
                <!-- The relative label is what gets read; the exact timestamp is
                     the title, for when "3d ago" isn't precise enough. -->
                <p
                  class="min-w-0 truncate text-sm text-white/60"
                  :title="absoluteTime(message.sentAt)"
                >
                  {{ formatRelativeTime(message.sentAt) }}
                </p>
                <div class="flex shrink-0 items-center gap-1">
                  <UBadge v-if="message.sentByMe" color="neutral" variant="soft" size="sm">
                    You
                  </UBadge>
                  <UBadge v-if="!message.delivered" color="warning" variant="soft" size="sm">
                    Not delivered
                  </UBadge>
                  <UButton
                    color="neutral"
                    variant="ghost"
                    size="sm"
                    icon="i-fa6-solid:paper-plane"
                    :loading="displaying === message.id"
                    :disabled="!!displaying"
                    aria-label="Send this to the board again"
                    @click="display(message.id, message.flaps)"
                  />
                  <UButton
                    color="neutral"
                    variant="ghost"
                    size="sm"
                    icon="i-fa6-solid:bookmark"
                    aria-label="Save as preset"
                    @click="openSavePreset(message.flaps)"
                  />
                  <!-- Filled star means kept; hollow means it will age out with
                       the rest of the history. -->
                  <UButton
                    :color="message.favoriteId ? 'primary' : 'neutral'"
                    variant="ghost"
                    size="sm"
                    :icon="message.favoriteId ? 'i-fa6-solid:star' : 'i-fa6-regular:star'"
                    :loading="starring === message.id"
                    :disabled="!!starring"
                    :aria-label="message.favoriteId ? 'Remove star' : 'Star this message'"
                    @click="toggleStar(message)"
                  />
                </div>
              </div>
            </article>
          </div>

          <!-- Says why the list stops, so a full page doesn't read as "that's
               everything I ever sent". -->
          <p v-if="messages.length >= HISTORY_LIMIT" class="k-eyebrow text-center text-white/40">
            Showing the {{ HISTORY_LIMIT }} most recent · star one to keep it
          </p>
        </section>
      </template>
    </div>
  </PageLayout>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import PageLayout from '@/layouts/PageLayout.vue'
import NemotoFlapGrid from '@/components/nemoto/NemotoFlapGrid.vue'
import NemotoSavePresetModal from '@/components/nemoto/NemotoSavePresetModal.vue'
import SkeletonList from '@/components/SkeletonList.vue'
import { usePageHeader } from '@/composables/usePageHeader'
import { useNemotoFlaps } from '@/composables/useNemotoFlaps'
import { nemotoApi, type NemotoFavorite, type NemotoMessage } from '@/lib/api/nemoto'
import { getErrorMessage } from '@/lib/api/errors'
import { formatRelativeTime } from '@/utils/device'
import { useCommandToast } from '@/composables/useCommandToast'

const props = defineProps<{ deviceId: string }>()

/** Matches the cloud's per-device cap; the API will not return more. */
const HISTORY_LIMIT = 50

const { setHeader } = usePageHeader()
// NemotoFlap resolves each id against the flap set, so it must be loaded
// before any preview renders.
const { ensureLoaded, frameToText } = useNemotoFlaps()
const command = useCommandToast()

const messages = ref<NemotoMessage[]>([])
const favorites = ref<NemotoFavorite[]>([])
const loading = ref(true)
const error = ref<string>()

const showSavePreset = ref(false)
const presetSource = ref<{ flaps: number[][]; name: string } | null>(null)
/** Id of the frame currently being pushed, so only its own button spins. */
const displaying = ref<string | null>(null)
/** Same, for the star — a double tap would otherwise post twice. */
const starring = ref<string | null>(null)

const absoluteTime = (iso: string) => new Date(iso).toLocaleString()

/**
 * Put a frame back on the board. This is the point of starring one: without it
 * a favourite is a picture you can look at, and getting it back up meant
 * rebuilding it by hand in the composer.
 */
async function display(id: string, flaps: number[][]) {
  if (displaying.value) return
  displaying.value = id
  try {
    const res = await nemotoApi.displayFrame(props.deviceId, { flaps })
    command.delivered(res.delivered, 'Sent to the board')
  } catch (err) {
    command.fail(err, 'Failed to send to the board')
  } finally {
    displaying.value = null
  }
}

async function toggleStar(message: NemotoMessage) {
  if (starring.value) return
  starring.value = message.id
  try {
    if (message.favoriteId) {
      await nemotoApi.removeFavorite(props.deviceId, message.favoriteId)
      favorites.value = favorites.value.filter((f) => f.id !== message.favoriteId)
      message.favoriteId = null
    } else {
      const favorite = await nemotoApi.addFavorite(props.deviceId, { messageId: message.id })
      message.favoriteId = favorite.id
      favorites.value = [favorite, ...favorites.value]
    }
  } catch (err) {
    command.fail(err, 'Failed to update the star')
  } finally {
    starring.value = null
  }
}

async function unstar(favorite: NemotoFavorite) {
  if (starring.value) return
  starring.value = favorite.id
  try {
    await nemotoApi.removeFavorite(props.deviceId, favorite.id)
    favorites.value = favorites.value.filter((f) => f.id !== favorite.id)
    // The same frame is probably still in the list below; its star has to go
    // hollow with this one.
    const source = messages.value.find((m) => m.favoriteId === favorite.id)
    if (source) source.favoriteId = null
  } catch (err) {
    command.fail(err, 'Failed to remove the star')
  } finally {
    starring.value = null
  }
}

function openSavePreset(flaps: number[][]) {
  // Suggest the message's own words, capped to something that reads as a name
  // rather than a sentence. Empty for a picture-only frame, which is fine —
  // the field is required and the user will type one.
  presetSource.value = { flaps, name: frameToText(flaps).slice(0, 32) }
  showSavePreset.value = true
}

async function load() {
  error.value = undefined
  try {
    // Stars are their own read: a favourite outlives the message it came from,
    // so the two lists don't always overlap.
    const [history, starred] = await Promise.all([
      nemotoApi.listMessages(props.deviceId),
      nemotoApi.listFavorites(props.deviceId),
    ])
    messages.value = history
    favorites.value = starred
  } catch (err) {
    error.value = getErrorMessage(err, 'Failed to load message history')
  } finally {
    loading.value = false
  }
}

onMounted(async () => {
  setHeader({ title: 'Message History', backRoute: `/nemoto/${props.deviceId}` })
  await ensureLoaded()
  await load()
})
</script>
