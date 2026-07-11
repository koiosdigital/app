<template>
  <PageLayout :on-refresh="refresh">
    <!-- The store is the one login-gated Tranquil surface. -->
    <div
      v-if="!authStore.isLoggedIn"
      class="flex flex-col items-center gap-4 px-5 py-16 text-center"
    >
      <UIcon name="i-fa6-solid:store" class="h-8 w-8 text-white/30" />
      <p class="text-white/70">Sign in to browse the pattern store.</p>
      <UButton color="primary" @click="router.push('/login')">Sign in</UButton>
    </div>

    <div v-else class="flex flex-col gap-4 px-5 py-6">
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

      <div v-if="loading && !patterns.length" class="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <USkeleton v-for="i in 6" :key="i" class="aspect-square w-full rounded-lg" />
      </div>

      <div
        v-else-if="!patterns.length && !error"
        class="rounded-lg border border-dashed border-white/20 p-8 text-center text-white/60"
      >
        No patterns in the store yet.
      </div>

      <div v-else class="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <div
          v-for="pattern in patterns"
          :key="pattern.uuid"
          class="overflow-hidden rounded-lg border border-white/10 bg-white/5"
        >
          <TranquilStoreThumb :uuid="pattern.uuid" :alt="pattern.name" />
          <div class="flex flex-col gap-2 p-2">
            <div>
              <p class="truncate text-sm font-medium">{{ pattern.name }}</p>
              <p v-if="pattern.creator" class="truncate text-xs text-white/50">
                {{ pattern.creator }}
              </p>
            </div>
            <UButton
              v-if="downloadPct(pattern.uuid) === undefined"
              color="primary"
              variant="soft"
              size="xs"
              icon="i-fa6-solid:down-to-bracket"
              block
              :disabled="!tranquilLocal.connected"
              @click="addToTable(pattern)"
            >
              Add to table
            </UButton>
            <UButton
              v-else-if="downloadPct(pattern.uuid)! < 100"
              color="primary"
              variant="soft"
              size="xs"
              icon="i-fa6-solid:spinner"
              :ui="{ leadingIcon: 'animate-spin' }"
              block
              disabled
            >
              Sending… {{ downloadPct(pattern.uuid) }}%
            </UButton>
            <UButton
              v-else
              color="success"
              variant="soft"
              size="xs"
              icon="i-fa6-solid:circle-check"
              block
              disabled
            >
              On your table
            </UButton>
          </div>
        </div>
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
import {
  tranquilStore,
  StoreError,
  type StorePattern,
  type StoreErrorKind,
} from '@/lib/tranquil/cloudStore'

const route = useRoute()
const router = useRouter()
const { setHeader } = usePageHeader()
const authStore = useAuthStore()
const tranquilLocal = useTranquilLocalStore()

const routeId = computed(() => route.params.id as string)

const patterns = ref<StorePattern[]>([])
const page = ref(1) // store is 1-based
const totalPages = ref(1)
const loading = ref(false)
const error = ref<string | null>(null)
const errorKind = ref<StoreErrorKind | null>(null)
const notice = ref<string | null>(null)

const hasMore = computed(() => page.value < totalPages.value)

async function fetchPage(next: number) {
  if (!authStore.isLoggedIn) return
  loading.value = true
  error.value = null
  errorKind.value = null
  try {
    const res = await tranquilStore.listPatterns(next, 24)
    patterns.value = next === 1 ? res.data : [...patterns.value, ...res.data]
    page.value = res.pagination.page
    totalPages.value = res.pagination.total_pages
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Failed to load the store'
    errorKind.value = e instanceof StoreError ? e.kind : 'http'
  } finally {
    loading.value = false
  }
}

const refresh = () => fetchPage(1)
const loadMore = () => fetchPage(page.value + 1)

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
    notice.value = `Sending “${pattern.name}” to your table…`
  } catch {
    notice.value = 'Could not reach your table. Try again.'
  }
}

onMounted(() => {
  setHeader({
    title: 'Store',
    backRoute: `/tranquil/local/${encodeURIComponent(routeId.value)}`,
  })
  void refresh()
})
</script>
