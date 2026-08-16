<template>
  <!-- Reachability reads as light; the transport reads as a mono chip. Both
       are quieter than a coloured badge, which frees the accent for actions. -->
  <span v-if="link" class="k-chip" :class="{ 'k-chip--live': link === 'lan' }">
    <span
      class="k-lamp"
      :class="lampClass"
      role="img"
      :aria-label="online ? 'Online' : 'Offline'"
      :title="online ? 'Online' : 'Offline'"
    />
    {{ link === 'lan' ? 'LAN' : 'Cloud' }}
    <UIcon :name="link === 'lan' ? 'i-fa6-solid:wifi' : 'i-fa6-solid:cloud'" class="h-2.5 w-2.5" />
  </span>
</template>

<script setup lang="ts">
import { computed } from 'vue'

const props = withDefaults(
  defineProps<{
    online: boolean
    /** How the app is talking to it right now. Omit to hide the chip. */
    link?: 'lan' | 'cloud' | null
    /** An offline device that should be actively chased reads as a fault. */
    fault?: boolean
  }>(),
  { link: null, fault: false },
)

const lampClass = computed(() => {
  if (props.online) return 'k-lamp--on'
  return props.fault ? 'k-lamp--fault' : 'k-lamp--off'
})
</script>
