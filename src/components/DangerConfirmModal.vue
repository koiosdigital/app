<template>
  <UModal v-model:open="model">
    <template #header>
      <div class="flex items-center gap-3">
        <UIcon name="i-fa6-solid:triangle-exclamation" class="h-5 w-5 text-red-400" />
        <h3 class="text-lg font-semibold">{{ title }}</h3>
      </div>
    </template>
    <template #body>
      <div class="space-y-4">
        <p class="text-sm text-white/70">{{ message }}</p>
        <UAlert v-if="error" color="error" icon="i-fa6-solid:circle-exclamation" :title="error" />
      </div>
    </template>
    <template #footer>
      <div class="flex justify-end gap-3">
        <UButton color="neutral" variant="ghost" :disabled="loading" @click="model = false">
          Cancel
        </UButton>
        <UButton color="error" :loading="loading" @click="$emit('confirm')">
          {{ confirmText }}
        </UButton>
      </div>
    </template>
  </UModal>
</template>

<script setup lang="ts">
const model = defineModel<boolean>({ required: true })

defineProps<{
  title: string
  message: string
  confirmText?: string
  loading?: boolean
  error?: string
}>()

defineEmits<{
  confirm: []
}>()
</script>
