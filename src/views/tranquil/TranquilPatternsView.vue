<template>
  <PageLayout :on-refresh="refresh">
    <input
      ref="fileInput"
      type="file"
      class="hidden"
      accept=".thr,.thrb,.txt"
      @change="onFileChosen"
    />

    <div v-if="!isActive" class="flex flex-col items-center gap-4 px-5 py-16 text-center">
      <UIcon name="i-fa6-solid:wifi" class="h-8 w-8 text-white/30" />
      <p class="text-white/70">This table isn't connected. Open it from your device list.</p>
      <UButton color="primary" variant="soft" @click="router.replace('/')">Go to devices</UButton>
    </div>

    <!-- pb clears the fixed bottom tab bar -->
    <div v-else class="flex flex-col gap-4 px-5 pt-6 pb-28">
      <UAlert v-if="error" color="error" icon="i-fa6-solid:circle-exclamation" :title="error" />

      <div
        v-if="uploading"
        class="flex items-center gap-2 rounded-lg border border-primary-500/20 bg-primary-500/10 px-3 py-2 text-sm text-primary-300"
      >
        <UIcon name="i-fa6-solid:spinner" class="h-4 w-4 animate-spin" />
        Uploading pattern…
      </div>

      <div v-if="loading && !patterns.length" class="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <USkeleton v-for="i in 6" :key="i" class="aspect-square w-full rounded-lg" />
      </div>

      <div
        v-else-if="!patterns.length"
        class="rounded-lg border border-dashed border-white/20 p-8 text-center text-white/60"
      >
        No patterns on this table yet. Upload one, or add from the store.
      </div>

      <div v-else class="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <button
          v-for="pattern in patterns"
          :key="pattern.uuid"
          type="button"
          class="flex flex-col gap-1.5 text-left"
          @click="openDetail(pattern)"
        >
          <TranquilPatternThumb :src="thumbUrl(pattern.uuid)" :alt="pattern.name" />
          <p class="w-full truncate text-sm">{{ pattern.name }}</p>
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
    </div>

    <TranquilTabBar />
  </PageLayout>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, useTemplateRef } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import PageLayout from '@/layouts/PageLayout.vue'
import { usePageHeader } from '@/composables/usePageHeader'
import { useTranquilLocalStore } from '@/stores/tranquilLocal'
import { formatTranquilError } from '@/lib/tranquil/local/errors'
import type { Pattern } from '@/lib/tranquil/local/types'
import TranquilPatternThumb from '@/components/tranquil/TranquilPatternThumb.vue'
import TranquilTabBar from '@/components/tranquil/TranquilTabBar.vue'

const route = useRoute()
const router = useRouter()
const { setHeader } = usePageHeader()
const store = useTranquilLocalStore()

const routeId = computed(() => route.params.id as string)
const isActive = computed(() => store.activeDevice?.id === routeId.value)

const patterns = ref<Pattern[]>([])
const page = ref(0) // local device is 0-based
const totalPages = ref(1)
const loading = ref(false)
const uploading = ref(false)
const error = ref<string | null>(null)
const fileInput = useTemplateRef<HTMLInputElement>('fileInput')

const hasMore = computed(() => page.value + 1 < totalPages.value)

function thumbUrl(uuid: string): string {
  const base = store.baseUrl()
  return base ? `${base}/api/pattern_thumbs/${uuid}.png` : ''
}

async function fetchPage(next: number) {
  if (!isActive.value) return
  loading.value = true
  error.value = null
  try {
    const res = await store.api().patterns.list(next, 24)
    patterns.value = next === 0 ? res.patterns : [...patterns.value, ...res.patterns]
    page.value = res.pagination.page
    totalPages.value = res.pagination.total_pages
  } catch (e) {
    error.value = formatTranquilError(e)
  } finally {
    loading.value = false
  }
}

const refresh = () => fetchPage(0)
const loadMore = () => fetchPage(page.value + 1)

function openDetail(pattern: Pattern) {
  router.push(`/tranquil/local/${encodeURIComponent(routeId.value)}/patterns/${pattern.uuid}`)
}

function triggerUpload() {
  fileInput.value?.click()
}

async function onFileChosen(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (!file) return
  uploading.value = true
  error.value = null
  try {
    await store.api().patterns.upload(file)
    // Firmware processes the upload asynchronously; refetch shortly after.
    await refresh()
  } catch (err) {
    error.value = formatTranquilError(err)
  } finally {
    uploading.value = false
    if (fileInput.value) fileInput.value.value = ''
  }
}

onMounted(() => {
  setHeader({
    title: 'Patterns',
    backRoute: `/tranquil/local/${encodeURIComponent(routeId.value)}`,
    actions: [{ icon: 'i-fa6-solid:upload', onClick: triggerUpload }],
  })
  void refresh()
})
</script>
