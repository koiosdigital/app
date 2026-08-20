<template>
  <UModal v-model:open="open">
    <template #header>
      <div class="flex items-center gap-3">
        <UIcon name="i-fa6-solid:bookmark" class="h-5 w-5 text-primary" />
        <h3 class="text-lg font-semibold">Save as preset</h3>
      </div>
    </template>

    <template #body>
      <div class="flex flex-col gap-4">
        <!-- Show what is actually being saved. The frame came from somewhere
             else on the page, and by the time this dialog is open that source
             is usually scrolled out of sight. -->
        <div v-if="flaps?.length" class="k-bezel w-full">
          <NemotoFlapGrid :flaps="flaps" />
        </div>

        <UFormField label="Name" help="Presets sync to the board and can be run on a schedule.">
          <UInput
            v-model="name"
            placeholder="Back in 5"
            size="lg"
            autofocus
            class="w-full"
            @keydown.enter="save"
          />
        </UFormField>

        <UAlert v-if="error" color="error" icon="i-fa6-solid:circle-exclamation" :title="error" />
      </div>
    </template>

    <template #footer>
      <div class="flex justify-end gap-3">
        <UButton color="neutral" variant="ghost" :disabled="saving" @click="open = false">
          Cancel
        </UButton>
        <UButton color="primary" :loading="saving" :disabled="!canSave" @click="save">
          Save preset
        </UButton>
      </div>
    </template>
  </UModal>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import NemotoFlapGrid from './NemotoFlapGrid.vue'
import { nemotoApi, type NemotoPreset } from '@/lib/api/nemoto'
import { getErrorMessage } from '@/lib/api/errors'
import { useCommandToast } from '@/composables/useCommandToast'

const props = withDefaults(
  defineProps<{
    deviceId: string
    /** The frame to save. Null while the caller has nothing selected. */
    flaps?: number[][] | null
    /** Prefills the name field — a suggestion, not a decision. */
    suggestedName?: string
  }>(),
  { flaps: null, suggestedName: '' },
)

const emit = defineEmits<{ saved: [preset: NemotoPreset] }>()

const open = defineModel<boolean>('open', { required: true })

const command = useCommandToast()

const name = ref('')
const saving = ref(false)
const error = ref<string>()

const canSave = computed(() => !!name.value.trim() && !!props.flaps?.length)

// Reset on each opening: a dialog that reopens holding the previous attempt's
// name and error reads as broken.
watch(open, (isOpen) => {
  if (!isOpen) return
  name.value = props.suggestedName
  error.value = undefined
  saving.value = false
})

async function save() {
  if (!canSave.value || saving.value) return

  saving.value = true
  error.value = undefined
  try {
    const preset = await nemotoApi.createPreset(props.deviceId, {
      name: name.value.trim(),
      flaps: props.flaps!,
    })
    emit('saved', preset)
    open.value = false
    command.ok('Preset saved', `“${preset.name}” is on the board's preset list.`)
  } catch (err) {
    // Inline, not a toast: the dialog stays open so the name can be fixed.
    error.value = getErrorMessage(err, 'Failed to save preset')
  } finally {
    saving.value = false
  }
}
</script>
