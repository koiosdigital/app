<template>
  <!-- Live: render the page. -->
  <slot v-if="state === 'ready'" />

  <!-- Bound but the socket is (re)connecting: keep the page (it still has
       state) and show a strip. Sub-pages that can't render without the
       connection pass `blocking`. -->
  <template v-else-if="state === 'connecting' && !blocking">
    <div class="connecting">
      <span class="k-lamp k-lamp--ember connecting__lamp" aria-hidden="true" />
      Reconnecting to the table…
      <button type="button" class="connecting__retry" @click="$emit('retry')">Retry</button>
    </div>
    <slot />
  </template>

  <div v-else-if="state === 'connecting' || state === 'resuming'" class="gate">
    <span class="k-lamp k-lamp--ember connecting__lamp" aria-hidden="true" />
    <p class="k-eyebrow">{{ state === 'resuming' ? 'Finding your table' : 'Reconnecting' }}</p>
    <p class="max-w-[32ch] text-sm text-muted">
      {{
        state === 'resuming'
          ? 'Looking for the table on your network…'
          : 'The table dropped off for a moment. Reconnecting…'
      }}
    </p>
    <UButton color="neutral" variant="soft" size="sm" @click="$emit('retry')">Retry now</UButton>
  </div>

  <div v-else-if="state === 'offline'" class="gate">
    <span class="k-lamp k-lamp--off" aria-hidden="true" />
    <p class="k-eyebrow">Table offline</p>
    <p class="max-w-[32ch] text-sm text-muted">
      The table isn't connected to the internet right now. Commands will resume when it comes back.
    </p>
    <UButton color="neutral" variant="soft" size="sm" @click="$emit('retry')">Check again</UButton>
  </div>

  <div v-else class="gate">
    <span class="k-lamp k-lamp--off" aria-hidden="true" />
    <p class="k-eyebrow">Not reachable</p>
    <p class="max-w-[32ch] text-sm text-muted">
      The table is controlled over your local network and wasn't found. Make sure you're on the
      same Wi-Fi, then try again or open it from the device list.
    </p>
    <div class="flex gap-2">
      <UButton color="primary" variant="soft" size="sm" @click="$emit('retry')">Try again</UButton>
      <UButton color="neutral" variant="ghost" size="sm" @click="router.replace('/')">
        Go to devices
      </UButton>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useRouter } from 'vue-router'
import type { TranquilSessionState } from '@/composables/useTranquilSession'

defineProps<{
  state: TranquilSessionState
  /** Hide the page while reconnecting (pages that can't show stale state). */
  blocking?: boolean
}>()
defineEmits<{ retry: [] }>()

const router = useRouter()
</script>

<style scoped>
.gate {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding: 4rem 1.25rem;
  text-align: center;
}

.connecting {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 9px 12px;
  font-family: var(--font-mono);
  font-size: 11.5px;
  letter-spacing: 0.02em;
  color: var(--k-ember-hi);
  background: rgb(231 145 20 / 0.08);
  border-bottom: 1px solid rgb(231 145 20 / 0.18);
}
.connecting__lamp {
  animation: state-pulse 1.4s ease-in-out infinite;
}
.connecting__retry {
  margin-left: 6px;
  text-decoration: underline;
  text-underline-offset: 2px;
}
@keyframes state-pulse {
  0%,
  100% {
    transform: scale(1);
    opacity: 1;
  }
  50% {
    transform: scale(0.6);
    opacity: 0.45;
  }
}
</style>
