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
      <div>
        <p v-if="eyebrow" class="text-xs uppercase tracking-wide text-white/50">{{ eyebrow }}</p>
        <h1 class="text-2xl font-semibold">{{ title }}</h1>
        <p v-if="description" class="text-sm text-white/70">{{ description }}</p>
      </div>
    </header>
    <div class="rounded-2xl bg-white/5 border border-white/10 p-4">
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
