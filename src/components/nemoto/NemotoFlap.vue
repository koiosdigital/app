<template>
  <!-- Unknown flap id: transparent spacer with the same footprint -->
  <div v-if="!def" class="nemoto-flap nemoto-flap--spacer" aria-hidden="true" />
  <!-- Split-flap face: two gradient halves with a divider, matching the
       on-device UI (nemoto-app DisplayCell, dark theme) -->
  <div
    v-else
    class="nemoto-flap"
    :class="{ 'nemoto-flap--color': isColor }"
    :style="isColor ? { '--flap-color': def.color ?? '#000' } : undefined"
    :title="def.label"
  >
    <div class="nemoto-flap__half nemoto-flap__top">
      <span v-if="glyph" class="nemoto-flap__glyph">{{ glyph }}</span>
    </div>
    <div class="nemoto-flap__half nemoto-flap__bottom">
      <span v-if="glyph" class="nemoto-flap__glyph">{{ glyph }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useNemotoFlaps } from '@/composables/useNemotoFlaps'

const props = defineProps<{ id: number }>()

const { byId } = useNemotoFlaps()

const def = computed(() => byId.value.get(props.id) ?? null)
const isColor = computed(() => def.value?.type === 'color')
const glyph = computed(() => (isColor.value ? '' : (def.value?.glyph?.trim() ?? '')))
</script>

<style scoped>
.nemoto-flap {
  position: relative;
  width: 100%;
  aspect-ratio: 11 / 16;
  border-radius: 3px;
  overflow: hidden;
  user-select: none;
  background: #050403;
  color: #f3e9c6;
  font-family: ui-monospace, 'SF Mono', Menlo, monospace;
  font-weight: 700;
  /* Glyph size scales with the cell via container-query units (see cqh below) */
  container-type: size;
}

.nemoto-flap--spacer {
  background: transparent;
}

.nemoto-flap__half {
  position: absolute;
  left: 0;
  width: 100%;
  height: 50%;
  overflow: hidden;
}

.nemoto-flap__top {
  top: 0;
  background: linear-gradient(180deg, #2a241d 0%, #1a1511 100%);
  border-bottom: 1px solid #000;
  box-shadow: inset 0 0 6px rgba(0, 0, 0, 0.55);
}

.nemoto-flap__bottom {
  bottom: 0;
  background: linear-gradient(180deg, #17120e 0%, #0b0806 100%);
  box-shadow: inset 0 0 8px rgba(0, 0, 0, 0.7);
}

.nemoto-flap__glyph {
  position: absolute;
  left: 0;
  width: 100%;
  height: 200%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 62cqh;
  line-height: 1;
  letter-spacing: -0.02em;
  text-transform: uppercase;
  text-shadow:
    0 1px 0 rgba(0, 0, 0, 0.65),
    0 0 10px rgba(243, 233, 198, 0.35);
}

.nemoto-flap__top .nemoto-flap__glyph {
  top: 0;
}
.nemoto-flap__bottom .nemoto-flap__glyph {
  bottom: 0;
}

.nemoto-flap--color .nemoto-flap__top {
  background: linear-gradient(
    180deg,
    color-mix(in oklch, var(--flap-color) 95%, white 5%) 0%,
    color-mix(in oklch, var(--flap-color) 85%, black 15%) 100%
  );
  border-bottom-color: rgba(0, 0, 0, 0.55);
}
.nemoto-flap--color .nemoto-flap__bottom {
  background: linear-gradient(
    180deg,
    color-mix(in oklch, var(--flap-color) 80%, black 20%) 0%,
    color-mix(in oklch, var(--flap-color) 68%, black 32%) 100%
  );
}
</style>
