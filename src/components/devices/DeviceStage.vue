<template>
  <!-- The hero every device page opens with: the thing itself, lit, with one
       line naming what it is showing. Shared so a Matrx, a Nemoto and a sand
       table are framed identically instead of three near-misses. -->
  <section class="stage" :class="{ 'stage--lit': lit }" :style="{ '--bloom': bloom }">
    <div class="stage__label">
      <p class="k-eyebrow">{{ eyebrow }}</p>
      <slot name="badge" />
    </div>

    <div class="stage__display" :style="{ width }">
      <slot />
    </div>

    <div v-if="title || meta" class="stage__caption">
      <p v-if="title" class="stage__title">{{ title }}</p>
      <p v-if="meta" class="k-num stage__meta">{{ meta }}</p>
    </div>

    <div v-if="$slots.actions" class="stage__actions">
      <slot name="actions" />
    </div>
  </section>
</template>

<script setup lang="ts">
withDefaults(
  defineProps<{
    eyebrow: string
    title?: string
    meta?: string
    /** The device is emitting light — spill some of it onto the page. */
    lit?: boolean
    bloom?: string
    /** Width of the display itself. Phone-first: nearly full-bleed, capped on desktop. */
    width?: string
  }>(),
  {
    title: undefined,
    meta: undefined,
    lit: false,
    bloom: 'rgb(231 145 20 / 0.16)',
    width: 'min(88vw, 520px)',
  },
)
</script>

<style scoped>
.stage {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 14px;
  padding: 22px 16px 24px;
  border-bottom: 1px solid var(--k-line-soft);
  overflow: hidden;
}

.stage::before {
  content: '';
  position: absolute;
  inset: -40% 0 auto;
  height: 100%;
  pointer-events: none;
  opacity: 0;
  transition: opacity 0.5s var(--k-ease);
  background: radial-gradient(58% 46% at 50% 50%, var(--bloom), transparent 72%);
}
.stage--lit::before {
  opacity: 1;
}

.stage__label {
  position: relative;
  display: flex;
  align-items: center;
  gap: 8px;
}

.stage__display {
  position: relative;
  max-width: 100%;
}

.stage__caption {
  position: relative;
  text-align: center;
}

.stage__title {
  font-size: 15px;
  font-weight: 600;
  letter-spacing: -0.015em;
  color: var(--ui-text-highlighted);
}

.stage__meta {
  margin-top: 2px;
  font-size: 11.5px;
  color: var(--ui-text-muted);
}

.stage__actions {
  position: relative;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  gap: 8px;
}
</style>
