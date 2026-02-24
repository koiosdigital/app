<template>
  <div>
    <!-- Trigger button to open modal -->
    <button
      type="button"
      class="flex w-full items-center justify-between rounded-lg border border-white/10 bg-white/5 px-3 py-2.5 text-left transition hover:bg-white/10"
      @click="openModal"
    >
      <span :class="value ? 'text-white' : 'text-white/50'">
        {{ displayValue || field.name || 'Search...' }}
      </span>
      <UIcon name="i-fa6-solid:magnifying-glass" class="h-4 w-4 text-white/50" />
    </button>

    <p v-if="error" class="mt-1 text-xs text-red-400">{{ error }}</p>

    <!-- Search Modal -->
    <UModal v-model:open="isOpen" :ui="{ width: 'sm:max-w-lg' }">
      <template #content>
        <div class="flex h-[70vh] flex-col bg-zinc-900">
          <!-- Header with search input -->
          <div class="border-b border-white/10 p-4">
            <div class="flex items-center gap-3">
              <UButton
                color="neutral"
                variant="ghost"
                icon="i-fa6-solid:arrow-left"
                square
                size="sm"
                @click="isOpen = false"
              />
              <UInput
                ref="searchInputRef"
                v-model="searchQuery"
                :placeholder="field.name || 'Search...'"
                :loading="searching"
                icon="i-fa6-solid:magnifying-glass"
                autofocus
                class="flex-1"
                size="lg"
                @update:model-value="debouncedSearch"
              />
            </div>
          </div>

          <!-- Results list -->
          <div class="flex-1 overflow-y-auto">
            <!-- Loading state -->
            <div
              v-if="searching && results.length === 0"
              class="flex items-center justify-center py-12"
            >
              <UIcon name="i-fa6-solid:spinner" class="h-6 w-6 animate-spin text-white/50" />
            </div>

            <!-- Empty state -->
            <div
              v-else-if="!searching && searchQuery && results.length === 0"
              class="flex flex-col items-center justify-center py-12 text-center"
            >
              <UIcon name="i-fa6-solid:magnifying-glass-x" class="h-8 w-8 text-white/30" />
              <p class="mt-2 text-sm text-white/50">No results found</p>
            </div>

            <!-- Initial state -->
            <div
              v-else-if="!searchQuery && results.length === 0"
              class="flex flex-col items-center justify-center py-12 text-center"
            >
              <UIcon name="i-fa6-solid:magnifying-glass" class="h-8 w-8 text-white/30" />
              <p class="mt-2 text-sm text-white/50">Type to search</p>
            </div>

            <!-- Results -->
            <div v-else class="divide-y divide-white/5">
              <button
                v-for="result in results"
                :key="result.value"
                type="button"
                class="flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-white/5"
                :class="{ 'bg-primary-500/10': result.value === value }"
                @click="selectResult(result)"
              >
                <UIcon
                  v-if="result.value === value"
                  name="i-fa6-solid:check"
                  class="h-4 w-4 text-primary-400"
                />
                <div :class="{ 'pl-7': result.value !== value }">
                  <p class="font-medium text-white">
                    {{ result.text || result.display || result.value }}
                  </p>
                  <p v-if="result.display && result.text" class="text-xs text-white/50">
                    {{ result.display }}
                  </p>
                </div>
              </button>
            </div>
          </div>

          <!-- Footer with clear option -->
          <div v-if="value" class="border-t border-white/10 p-3">
            <UButton color="neutral" variant="ghost" size="sm" block @click="clearSelection">
              Clear selection
            </UButton>
          </div>
        </div>
      </template>
    </UModal>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, nextTick } from 'vue'
import type { components } from '@/types/api'
import { appsApi } from '@/lib/api/apps'
import { debounce } from '@/utils/debounce'

type TypeaheadField = components['schemas']['AppSchemaTypeaheadFieldDto']
type Option = components['schemas']['AppSchemaOptionDto']

const props = defineProps<{
  field: TypeaheadField
  value: unknown
  error?: string
  appId: string
  formValues?: Record<string, unknown>
}>()

const emit = defineEmits<{
  (e: 'update:value', value: string): void
}>()

function buildConfig(): Record<string, string> {
  const config: Record<string, string> = {}
  if (props.formValues) {
    for (const [k, v] of Object.entries(props.formValues)) {
      if (v != null) config[k] = String(v)
    }
  }
  return config
}

const isOpen = ref(false)
const searchQuery = ref('')
const searching = ref(false)
const results = ref<Option[]>([])
const searchInputRef = ref<{ inputRef?: HTMLInputElement } | null>(null)

const displayValue = computed(() => {
  if (!props.value) return ''
  // Check if we have the result in our cache
  const found = results.value.find((r) => r.value === props.value)
  if (found) return found.text || found.display || found.value
  // Try to parse if it's JSON
  try {
    const parsed = JSON.parse(String(props.value))
    return parsed.text || parsed.display || String(props.value)
  } catch {
    return String(props.value)
  }
})

function openModal() {
  isOpen.value = true
  searchQuery.value = ''
  results.value = []
  // Focus input after modal opens
  nextTick(() => {
    searchInputRef.value?.inputRef?.focus()
  })
}

async function search(query: string) {
  if (!query || !props.field.handler) {
    results.value = []
    return
  }

  searching.value = true

  try {
    const response = await appsApi.callHandler(props.appId, props.field.handler, buildConfig(), query)

    if (response?.result) {
      // Result is JSON string of options array
      try {
        const parsed = JSON.parse(response.result)
        results.value = Array.isArray(parsed) ? parsed : []
      } catch {
        results.value = []
      }
    }
  } catch (err) {
    console.error('Typeahead search error:', err)
    results.value = []
  } finally {
    searching.value = false
  }
}

const debouncedSearch = debounce((query: string) => search(query), 300)

function selectResult(result: Option) {
  emit('update:value', result.value)
  isOpen.value = false
}

function clearSelection() {
  emit('update:value', '')
  isOpen.value = false
}
</script>
