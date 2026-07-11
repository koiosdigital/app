<template>
  <div>
    <!-- Color circle trigger -->
    <button
      type="button"
      class="h-9 w-9 rounded-full border-2 border-white/20 transition hover:scale-110"
      :style="{ backgroundColor: modelValue || '#ffffff' }"
      @click="isOpen = true"
    />

    <!-- Color picker modal (same UX as the matrx schema color field) -->
    <UModal v-model:open="isOpen" :ui="{ width: 'sm:max-w-sm' }">
      <template #content>
        <div class="flex flex-col bg-zinc-900">
          <!-- Header -->
          <div class="flex items-center gap-3 border-b border-white/10 px-4 py-3">
            <UButton
              color="neutral"
              variant="ghost"
              icon="i-fa6-solid:xmark"
              square
              size="sm"
              @click="isOpen = false"
            />
            <p class="font-medium text-white">Pick Color</p>
          </div>

          <!-- Color picker area -->
          <div class="flex flex-col items-center gap-4 p-4">
            <!-- Chrome-style color picker -->
            <div class="color-picker-wrapper w-full">
              <Chrome
                :model-value="draftColor"
                :disable-alpha="true"
                :disable-fields="true"
                @update:model-value="onPickerChange"
              />
            </div>

            <!-- Presets -->
            <div class="w-full">
              <p class="mb-2 text-xs font-medium tracking-wide text-white/50 uppercase">Presets</p>
              <div class="flex flex-wrap gap-2">
                <button
                  v-for="preset in presets"
                  :key="preset"
                  type="button"
                  class="h-8 w-8 rounded-full border-2 transition hover:scale-110"
                  :class="draftColor === preset ? 'border-white' : 'border-transparent'"
                  :style="{ backgroundColor: preset }"
                  @click="draftColor = preset"
                />
              </div>
            </div>
          </div>

          <!-- Footer -->
          <div class="flex items-center justify-end gap-2 border-t border-white/10 p-3">
            <UButton color="neutral" variant="soft" @click="isOpen = false">Cancel</UButton>
            <UButton color="primary" @click="confirmColor">Confirm</UButton>
          </div>
        </div>
      </template>
    </UModal>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import { Chrome } from '@ckpack/vue-color'

const props = withDefaults(
  defineProps<{
    modelValue: string
    presets?: string[]
  }>(),
  {
    presets: () => [
      '#ffffff', // White
      '#ffb46b', // Warm white
      '#ff0000', // Red
      '#ff7f00', // Orange
      '#ffee00', // Yellow
      '#00ff00', // Green
      '#00ffff', // Cyan
      '#0000ff', // Blue
      '#8b00ff', // Purple
      '#ff00aa', // Pink
    ],
  },
)

const emit = defineEmits<{
  (e: 'update:modelValue', value: string): void
}>()

const isOpen = ref(false)
const draftColor = ref('#ffffff')

/** Seed draft state when modal opens */
watch(isOpen, (open) => {
  if (open) {
    draftColor.value = (props.modelValue || '#ffffff').toLowerCase()
  }
})

function onPickerChange(val: { hex: string }) {
  draftColor.value = val.hex.toLowerCase()
}

function confirmColor() {
  emit('update:modelValue', draftColor.value)
  isOpen.value = false
}
</script>

<style scoped>
/* Override vue-color Chrome picker to fit dark theme and fill width */
.color-picker-wrapper :deep(.vc-chrome) {
  width: 100%;
  background-color: transparent;
  box-shadow: none;
  border-radius: 0;
}
</style>
