<template>
  <article
    class="k-device-card"
    :class="{ 'is-lit': lit }"
    :style="{ '--bloom': bloom }"
    role="button"
    tabindex="0"
    :aria-label="title"
    @click="$emit('click')"
    @keydown.enter.prevent="$emit('click')"
    @keydown.space.prevent="$emit('click')"
  >
    <!-- Header: mono eyebrow, name, then the one line of state that matters -->
    <div class="k-device-card__head">
      <div class="k-device-card__identity">
        <p class="k-eyebrow">{{ eyebrow }}</p>
        <h3 class="k-device-card__title">{{ title }}</h3>
        <p class="k-device-card__sub k-num">{{ subtitle }}</p>
      </div>
      <!-- Named parts, not anonymous wrappers: the roster layout promotes each
           of these to its own grid column at wide widths. -->
      <div class="k-device-card__status">
        <slot name="header-end" />
      </div>
    </div>

    <!-- Stage: the device's own display, framed -->
    <div class="k-device-card__stage">
      <slot name="content" />
    </div>

    <!-- Footer: actions live behind a hairline so a thumb never confuses
         "open the device" with "turn the device off". -->
    <div v-if="$slots.actions" class="k-device-card__foot">
      <slot name="actions" />
    </div>
  </article>
</template>

<script setup lang="ts">
withDefaults(
  defineProps<{
    eyebrow: string
    title: string
    subtitle: string
    /** Device is on and emitting light — the card glows with it. */
    lit?: boolean
    /** Colour of the light this device family throws. */
    bloom?: string
  }>(),
  {
    lit: false,
    bloom: 'rgb(231 145 20 / 0.13)',
  },
)

defineEmits<{
  (e: 'click'): void
}>()
</script>

<style scoped>
.k-device-card {
  position: relative;
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
  text-align: left;
  cursor: pointer;
  border: 1px solid var(--k-line);
  border-radius: 14px;
  background: linear-gradient(180deg, var(--k-panel-2), var(--k-panel));
  box-shadow: var(--k-bezel);
  transition:
    border-color 0.2s var(--k-ease),
    transform 0.14s var(--k-ease),
    box-shadow 0.2s var(--k-ease);
}

/* The light the object throws, present only while it is on. */
.k-device-card::after {
  content: '';
  position: absolute;
  inset: 0;
  pointer-events: none;
  opacity: 0;
  transition: opacity 0.35s var(--k-ease);
  background: radial-gradient(90% 55% at 50% 118%, var(--bloom), transparent 70%);
}
.k-device-card.is-lit::after {
  opacity: 1;
}

@media (hover: hover) {
  .k-device-card:hover {
    border-color: #3a322b;
    box-shadow: var(--k-bezel), var(--k-lift);
  }
}

/* Touch feedback — the card presses in rather than lighting up. */
.k-device-card:active {
  transform: scale(0.99);
}

.k-device-card:focus-visible {
  outline: 2px solid var(--k-ember);
  outline-offset: 2px;
}

.k-device-card__head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding: 14px 14px 10px;
}

.k-device-card__identity {
  min-width: 0;
  flex: 1;
}

.k-device-card__status {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 6px;
}

.k-device-card__title {
  margin-top: 3px;
  font-size: 17px;
  font-weight: 600;
  letter-spacing: -0.02em;
  color: var(--ui-text-highlighted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.k-device-card__sub {
  margin-top: 2px;
  font-size: 11.5px;
  color: var(--ui-text-muted);
}

.k-device-card__stage {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 4px 14px 14px;
}

.k-device-card__foot {
  position: relative;
  margin-top: auto;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 8px 10px 8px 14px;
  border-top: 1px solid var(--k-line-soft);
  background: rgb(0 0 0 / 0.22);
}
</style>
