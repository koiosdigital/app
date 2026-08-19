<template>
  <PageLayout :on-refresh="load">
    <div class="flex flex-col gap-4 px-5 py-6 pb-10">
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

      <div
        v-else-if="!messages.length"
        class="rounded-lg border border-dashed border-white/20 p-8 text-center text-white/60"
      >
        Nothing sent yet. Messages you push to this board show up here.
      </div>

      <template v-else>
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
              <div class="flex shrink-0 items-center gap-2">
                <UBadge v-if="message.sentByMe" color="neutral" variant="soft" size="sm">
                  You
                </UBadge>
                <UBadge v-if="!message.delivered" color="warning" variant="soft" size="sm">
                  Not delivered
                </UBadge>
              </div>
            </div>
          </article>
        </div>

        <!-- Says why the list stops, so a full page doesn't read as "that's
             everything I ever sent". -->
        <p v-if="messages.length >= HISTORY_LIMIT" class="k-eyebrow text-center text-white/40">
          Showing the {{ HISTORY_LIMIT }} most recent
        </p>
      </template>
    </div>
  </PageLayout>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import PageLayout from '@/layouts/PageLayout.vue'
import NemotoFlapGrid from '@/components/nemoto/NemotoFlapGrid.vue'
import SkeletonList from '@/components/SkeletonList.vue'
import { usePageHeader } from '@/composables/usePageHeader'
import { useNemotoFlaps } from '@/composables/useNemotoFlaps'
import { nemotoApi, type NemotoMessage } from '@/lib/api/nemoto'
import { getErrorMessage } from '@/lib/api/errors'
import { formatRelativeTime } from '@/utils/device'

const props = defineProps<{ deviceId: string }>()

/** Matches the cloud's per-device cap; the API will not return more. */
const HISTORY_LIMIT = 50

const { setHeader } = usePageHeader()
// NemotoFlap resolves each id against the flap set, so it must be loaded
// before any preview renders.
const { ensureLoaded } = useNemotoFlaps()

const messages = ref<NemotoMessage[]>([])
const loading = ref(true)
const error = ref<string>()

const absoluteTime = (iso: string) => new Date(iso).toLocaleString()

async function load() {
  error.value = undefined
  try {
    messages.value = await nemotoApi.listMessages(props.deviceId)
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
