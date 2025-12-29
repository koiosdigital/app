<template>
  <div class="space-y-3">
    <!-- Current image preview -->
    <div v-if="value" class="relative inline-block">
      <img
        :src="imageDataUrl"
        alt="Uploaded image"
        class="max-h-32 rounded border border-white/10"
      />
      <button
        type="button"
        class="absolute -top-2 -right-2 rounded-full bg-red-500 p-1 hover:bg-red-600"
        @click="clearImage"
      >
        <UIcon name="i-fa6-solid:xmark" class="h-3 w-3 text-white" />
      </button>
    </div>

    <!-- Upload button -->
    <div v-else>
      <input
        ref="fileInput"
        type="file"
        accept="image/png"
        class="hidden"
        @change="handleFileSelect"
      />
      <UButton color="neutral" variant="soft" icon="i-fa6-solid:upload" @click="fileInput?.click()">
        Upload PNG
      </UButton>
    </div>

    <p v-if="error" class="text-xs text-red-400">{{ error }}</p>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import type { components } from '@/types/api'

type PNGField = components['schemas']['AppSchemaPNGFieldDto']

const props = defineProps<{
  field: PNGField
  value: unknown
  error?: string
}>()

const emit = defineEmits<{
  (e: 'update:value', value: string): void
}>()

const fileInput = ref<HTMLInputElement>()

const imageDataUrl = computed(() => {
  if (!props.value) return ''
  // Value is base64 encoded PNG
  if (String(props.value).startsWith('data:')) {
    return String(props.value)
  }
  return `data:image/png;base64,${props.value}`
})

function handleFileSelect(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0]
  if (!file) return

  const reader = new FileReader()
  reader.onload = (e) => {
    const result = e.target?.result as string
    // Remove data URL prefix, just send base64
    const base64 = result.replace(/^data:image\/png;base64,/, '')
    emit('update:value', base64)
  }
  reader.readAsDataURL(file)
}

function clearImage() {
  emit('update:value', '')
  if (fileInput.value) {
    fileInput.value.value = ''
  }
}
</script>
