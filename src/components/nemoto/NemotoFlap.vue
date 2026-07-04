<template>
  <div
    class="nemoto-flap"
    :class="{ 'nemoto-flap--color': isColor, 'nemoto-flap--blank': isBlank }"
    :style="cellStyle"
    :title="def?.label"
  >
    <span v-if="!isColor && !isBlank" class="nemoto-flap__glyph">{{ glyph }}</span>
  </div>
</template>

<script setup lang="ts">
import { computed, type CSSProperties } from 'vue'
import { useNemotoFlaps } from '@/composables/useNemotoFlaps'

const props = defineProps<{ id: number }>()

const { byId } = useNemotoFlaps()

const def = computed(() => byId.value.get(props.id) ?? null)
const isColor = computed(() => def.value?.type === 'color')
const isBlank = computed(() => !def.value || def.value.type === 'blank')
const glyph = computed(() => def.value?.glyph ?? '')

const cellStyle = computed<CSSProperties | undefined>(() =>
  isColor.value && def.value?.color ? { background: def.value.color } : undefined,
)
</script>

<style scoped>
.nemoto-flap {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  aspect-ratio: 2 / 3;
  background: #18181b;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 2px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  text-transform: uppercase;
  color: #fafafa;
  line-height: 1;
  overflow: hidden;
  user-select: none;
}

.nemoto-flap--blank {
  background: #09090b;
}

.nemoto-flap--color {
  border-color: rgba(255, 255, 255, 0.15);
}

.nemoto-flap__glyph {
  font-size: min(72%, 1.5rem);
}
</style>
