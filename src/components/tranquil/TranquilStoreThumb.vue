<template>
  <TranquilPatternThumb :src="uuid ? tranquilStore.thumbUrl(uuid) : null" :alt="alt" />
</template>

<script setup lang="ts">
import { tranquilStore } from '@/lib/tranquil/cloudStore'
import TranquilPatternThumb from './TranquilPatternThumb.vue'

// A store pattern by uuid. The gated fetch (user bearer → blob) happens in
// TranquilPatternThumb, which recognises store URLs.
defineProps<{ uuid: string; alt?: string }>()
</script>
