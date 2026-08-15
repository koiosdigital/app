<template>
  <section class="space-y-4">
    <header class="flex items-center gap-3">
      <UButton
        v-if="backEnabled"
        variant="ghost"
        icon="i-fa6-solid:chevron-left"
        size="sm"
        @click="router.back()"
      >
        Back
      </UButton>
      <div class="min-w-0">
        <p v-if="eyebrow" class="k-eyebrow">{{ eyebrow }}</p>
        <h1 class="text-xl font-semibold tracking-tight text-highlighted">
          {{ title }}
        </h1>
        <p v-if="description" class="mt-0.5 text-sm text-muted">{{ description }}</p>
      </div>
    </header>
    <div
      class="rounded-[14px] border border-default bg-muted p-4 shadow-[inset_0_1px_0_rgb(255_255_255/0.055)]"
    >
      <slot />
    </div>
  </section>
</template>

<script setup lang="ts">
import { toRefs } from 'vue'
import { useRouter } from 'vue-router'

const props = withDefaults(
  defineProps<{
    backEnabled?: boolean
    title?: string
    description?: string
    eyebrow?: string
  }>(),
  {
    backEnabled: true,
    title: '',
    description: '',
    eyebrow: undefined,
  },
)

const router = useRouter()

const { backEnabled, title, description, eyebrow } = toRefs(props)
</script>
