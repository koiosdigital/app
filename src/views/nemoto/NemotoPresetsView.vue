<template>
  <PageLayout :on-refresh="load">
    <DangerConfirmModal
      v-model="showDelete"
      title="Delete Preset"
      :message="`Delete preset “${pendingDelete?.name ?? ''}”? This cannot be undone.`"
      confirm-text="Delete"
      :loading="deleting"
      :error="deleteError"
      @confirm="confirmDelete"
    />

    <div class="flex flex-col gap-4 px-5 py-6">
      <UButton
        color="primary"
        size="lg"
        icon="i-fa6-solid:plus"
        block
        @click="router.push(`/nemoto/${deviceId}/presets/new`)"
      >
        New Preset
      </UButton>

      <UAlert
        v-if="commandMsg"
        :color="commandMsg.color"
        :icon="commandMsg.icon"
        :title="commandMsg.text"
      />

      <div v-if="loading" class="flex items-center justify-center py-16">
        <UIcon name="i-fa6-solid:spinner" class="h-7 w-7 animate-spin text-white/50" />
      </div>

      <UAlert
        v-else-if="error"
        color="error"
        icon="i-fa6-solid:circle-exclamation"
        :title="error"
      />

      <div
        v-else-if="!presets.length"
        class="rounded-lg border border-dashed border-white/20 p-8 text-center text-white/60"
      >
        No presets yet. Create one to get started.
      </div>

      <UCard v-for="preset in presets" v-else :key="preset.presetId" class="bg-white/5">
        <div class="flex items-center justify-between gap-3">
          <div class="min-w-0">
            <p class="truncate font-semibold">{{ preset.name }}</p>
            <p class="text-xs text-white/50">{{ preset.width }} × {{ preset.height }}</p>
          </div>
          <div class="flex shrink-0 items-center gap-1">
            <UButton
              color="primary"
              variant="soft"
              size="sm"
              icon="i-fa6-solid:play"
              :loading="showing === preset.presetId"
              @click="show(preset.presetId)"
            >
              Show
            </UButton>
            <UButton
              color="neutral"
              variant="ghost"
              size="sm"
              square
              icon="i-fa6-solid:pen"
              @click="router.push(`/nemoto/${deviceId}/presets/${preset.presetId}`)"
            />
            <UButton
              color="error"
              variant="ghost"
              size="sm"
              square
              icon="i-fa6-solid:trash"
              @click="askDelete(preset)"
            />
          </div>
        </div>
      </UCard>
    </div>
  </PageLayout>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import PageLayout from '@/layouts/PageLayout.vue'
import DangerConfirmModal from '@/components/DangerConfirmModal.vue'
import { usePageHeader } from '@/composables/usePageHeader'
import { nemotoApi, type NemotoPresetListItem } from '@/lib/api/nemoto'
import { getErrorMessage } from '@/lib/api/errors'

const route = useRoute()
const router = useRouter()
const { setHeader } = usePageHeader()
const deviceId = computed(() => route.params.id as string)

const presets = ref<NemotoPresetListItem[]>([])
const loading = ref(true)
const error = ref<string>()
const showing = ref<number | null>(null)

const showDelete = ref(false)
const pendingDelete = ref<NemotoPresetListItem | null>(null)
const deleting = ref(false)
const deleteError = ref<string>()

const commandMsg = ref<{
  text: string
  color: 'success' | 'warning' | 'error'
  icon: string
} | null>(null)

function flash(text: string, color: 'success' | 'warning' | 'error', icon: string) {
  commandMsg.value = { text, color, icon }
  window.setTimeout(() => (commandMsg.value = null), 4000)
}

function flashDelivered(delivered: boolean, successText: string) {
  if (delivered) {
    flash(successText, 'success', 'i-fa6-solid:circle-check')
  } else {
    flash('Device offline — command not delivered', 'warning', 'i-fa6-solid:triangle-exclamation')
  }
}

async function load() {
  loading.value = true
  error.value = undefined
  try {
    presets.value = await nemotoApi.listPresets(deviceId.value)
  } catch (err) {
    error.value = getErrorMessage(err, 'Failed to load presets')
  } finally {
    loading.value = false
  }
}

async function show(presetId: number) {
  showing.value = presetId
  try {
    const res = await nemotoApi.showPreset(deviceId.value, presetId)
    flashDelivered(res.delivered, 'Preset shown on display')
  } catch (err) {
    flash(getErrorMessage(err, 'Failed to show preset'), 'error', 'i-fa6-solid:circle-exclamation')
  } finally {
    showing.value = null
  }
}

function askDelete(preset: NemotoPresetListItem) {
  pendingDelete.value = preset
  deleteError.value = undefined
  showDelete.value = true
}

async function confirmDelete() {
  if (!pendingDelete.value) return
  deleting.value = true
  deleteError.value = undefined
  try {
    await nemotoApi.deletePreset(deviceId.value, pendingDelete.value.presetId)
    showDelete.value = false
    await load()
  } catch (err) {
    deleteError.value = getErrorMessage(err, 'Failed to delete preset')
  } finally {
    deleting.value = false
  }
}

onMounted(() => {
  setHeader({ title: 'Presets', backRoute: `/nemoto/${deviceId.value}` })
  load()
})
</script>
