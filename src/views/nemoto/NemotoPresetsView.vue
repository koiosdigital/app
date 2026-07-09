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
      <div class="flex gap-2">
        <UButton
          color="primary"
          size="lg"
          icon="i-fa6-solid:plus"
          class="flex-1"
          @click="router.push(`/nemoto/${deviceId}/presets/new`)"
        >
          New Preset
        </UButton>
        <UButton
          color="neutral"
          variant="soft"
          size="lg"
          icon="i-fa6-solid:globe"
          class="flex-1"
          @click="openNewUrl"
        >
          New URL Preset
        </UButton>
      </div>

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
            <div class="flex items-center gap-2">
              <p class="truncate font-semibold">{{ preset.name }}</p>
              <UBadge
                v-if="preset.source === 'url'"
                color="primary"
                variant="soft"
                size="sm"
                icon="i-fa6-solid:globe"
              >
                URL
              </UBadge>
            </div>
            <p v-if="preset.source === 'url'" class="truncate text-xs text-white/50">
              {{ preset.url }}
            </p>
            <p v-else class="text-xs text-white/50">
              {{ preset.width }} × {{ preset.height }}
            </p>
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
              @click="editPreset(preset)"
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

    <!-- URL preset create / edit -->
    <UModal v-model:open="urlModalOpen">
      <template #content>
        <UCard>
          <template #header>
            <h3 class="text-lg font-semibold">
              {{ urlEditingId != null ? 'Edit URL Preset' : 'New URL Preset' }}
            </h3>
          </template>

          <div class="max-h-[65vh] space-y-5 overflow-y-auto">
            <p class="text-sm text-white/60">
              The display fetches this URL when the preset is shown or scheduled.
              It must return a 2-D array of flap ids (0–63) matching the board, or
              <span class="font-mono">204 No Content</span> to leave the display
              unchanged.
            </p>

            <UFormField label="Name">
              <UInput v-model="urlForm.name" placeholder="Weather feed" size="lg" :maxlength="31" />
            </UFormField>

            <UFormField label="URL">
              <UInput
                v-model="urlForm.url"
                placeholder="https://…"
                size="lg"
                :maxlength="512"
                @keyup.enter="runPreview"
              />
            </UFormField>

            <div class="flex items-center gap-3">
              <UButton
                color="neutral"
                variant="soft"
                icon="i-fa6-solid:eye"
                :loading="preview.status === 'loading'"
                :disabled="!urlValid"
                @click="runPreview"
              >
                Preview
              </UButton>
              <span class="text-xs text-white/40">Fetched by your browser</span>
            </div>

            <!-- Preview outcomes -->
            <UAlert
              v-if="preview.status === 'empty'"
              color="neutral"
              icon="i-fa6-solid:circle-info"
              title="204 No Content"
              description="The board would keep its current display."
            />
            <UAlert
              v-else-if="preview.status === 'error'"
              color="warning"
              icon="i-fa6-solid:triangle-exclamation"
              :title="preview.message"
            />
            <div
              v-else-if="preview.status === 'ok'"
              class="rounded-lg border border-white/10 bg-black/40 p-3"
            >
              <NemotoFlapGrid :flaps="preview.rows" />
            </div>
          </div>

          <template #footer>
            <div class="flex justify-end gap-2">
              <UButton color="neutral" variant="ghost" @click="urlModalOpen = false">
                Cancel
              </UButton>
              <UButton
                color="primary"
                :loading="savingUrl"
                :disabled="!canSaveUrl || savingUrl"
                @click="saveUrl"
              >
                {{ urlEditingId != null ? 'Save' : 'Create' }}
              </UButton>
            </div>
            <UAlert
              v-if="urlSaveError"
              color="error"
              icon="i-fa6-solid:circle-exclamation"
              :title="urlSaveError"
              class="mt-3"
            />
          </template>
        </UCard>
      </template>
    </UModal>
  </PageLayout>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import PageLayout from '@/layouts/PageLayout.vue'
import DangerConfirmModal from '@/components/DangerConfirmModal.vue'
import NemotoFlapGrid from '@/components/nemoto/NemotoFlapGrid.vue'
import { usePageHeader } from '@/composables/usePageHeader'
import { useNemotoFlaps } from '@/composables/useNemotoFlaps'
import { nemotoApi, type NemotoPresetListItem } from '@/lib/api/nemoto'
import { getErrorMessage } from '@/lib/api/errors'

const route = useRoute()
const router = useRouter()
const { setHeader } = usePageHeader()
const { ensureLoaded } = useNemotoFlaps()
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

function editPreset(preset: NemotoPresetListItem) {
  if (preset.source === 'url') {
    openEditUrl(preset)
    return
  }
  router.push(`/nemoto/${deviceId.value}/presets/${preset.presetId}`)
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

// ---------------------------------------------------------------------------
// URL preset create / edit (+ in-browser preview)
// ---------------------------------------------------------------------------

const urlModalOpen = ref(false)
const urlEditingId = ref<number | null>(null)
const urlForm = reactive({ name: '', url: '' })
const savingUrl = ref(false)
const urlSaveError = ref<string>()

type Preview =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'empty' } // 204 No Content
  | { status: 'error'; message: string }
  | { status: 'ok'; rows: number[][] }

const preview = ref<Preview>({ status: 'idle' })

const urlValid = computed(() => /^https?:\/\//i.test(urlForm.url.trim()))
const canSaveUrl = computed(() => urlForm.name.trim().length > 0 && urlValid.value)

function openNewUrl() {
  urlEditingId.value = null
  urlForm.name = ''
  urlForm.url = ''
  preview.value = { status: 'idle' }
  urlSaveError.value = undefined
  urlModalOpen.value = true
}

function openEditUrl(preset: NemotoPresetListItem) {
  urlEditingId.value = preset.presetId
  urlForm.name = preset.name
  urlForm.url = preset.url ?? ''
  preview.value = { status: 'idle' }
  urlSaveError.value = undefined
  urlModalOpen.value = true
}

async function runPreview() {
  if (!urlValid.value) return
  preview.value = { status: 'loading' }
  try {
    // The browser fetches the URL directly. The board's own fetch is NOT
    // subject to CORS — this preview is, so cross-origin failures are expected
    // for servers that don't opt in.
    const res = await fetch(urlForm.url.trim(), { headers: { Accept: 'application/json' } })
    if (res.status === 204) {
      preview.value = { status: 'empty' }
      return
    }
    if (!res.ok) {
      preview.value = { status: 'error', message: `Server returned HTTP ${res.status}.` }
      return
    }
    const data = await res.json()
    if (
      !Array.isArray(data) ||
      data.length === 0 ||
      !Array.isArray(data[0]) ||
      !data.every(
        (row: unknown) =>
          Array.isArray(row) &&
          row.length === (data[0] as unknown[]).length &&
          row.every((c) => typeof c === 'number' && c >= 0 && c <= 63),
      )
    ) {
      preview.value = {
        status: 'error',
        message: 'Expected a rectangular 2-D array of flap ids (0–63).',
      }
      return
    }
    preview.value = { status: 'ok', rows: data as number[][] }
  } catch {
    preview.value = {
      status: 'error',
      message:
        'Fetch failed — usually CORS. The board fetches this URL server-side (no CORS); the browser preview needs the URL to allow cross-origin GET.',
    }
  }
}

async function saveUrl() {
  if (!canSaveUrl.value) return
  savingUrl.value = true
  urlSaveError.value = undefined
  const body = { name: urlForm.name.trim(), url: urlForm.url.trim() }
  try {
    if (urlEditingId.value != null) {
      await nemotoApi.updatePreset(deviceId.value, urlEditingId.value, body)
    } else {
      await nemotoApi.createPreset(deviceId.value, body)
    }
    urlModalOpen.value = false
    await load()
  } catch (err) {
    urlSaveError.value = getErrorMessage(err, 'Failed to save URL preset')
  } finally {
    savingUrl.value = false
  }
}

onMounted(() => {
  setHeader({ title: 'Presets', backRoute: `/nemoto/${deviceId.value}` })
  ensureLoaded()
  load()
})
</script>
