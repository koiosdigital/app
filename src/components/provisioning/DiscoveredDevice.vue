<template>
  <UCard class="border-white/5 bg-white/5 backdrop-blur">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <div>
        <p class="text-xs uppercase tracking-[0.3em] text-white/60">Channel {{ ap.channel }}</p>
        <h3 class="text-xl font-semibold">{{ ap.ssid || 'Hidden SSID' }}</h3>
      </div>
      <UBadge :color="connected ? 'primary' : 'neutral'" variant="soft">
        {{ securityLabel }}
      </UBadge>
    </div>

    <div class="mt-4 grid gap-4 md:grid-cols-3 text-sm text-white/70">
      <div class="flex items-center gap-2">
        <UIcon name="i-lucide-radar" class="h-4 w-4" />
        <span>{{ signalLabel }}</span>
      </div>
      <div class="flex items-center gap-2">
        <UIcon name="i-lucide-wifi" class="h-4 w-4" />
        <span>{{ ap.bssid }}</span>
      </div>
      <div class="flex items-center gap-2">
        <UIcon name="i-lucide-shield" class="h-4 w-4" />
        <span>{{ requiresPassword ? 'Secured' : 'Open' }}</span>
      </div>
    </div>

    <div class="mt-4 space-y-3">
      <UProgress :value="signalStrength" color="primary" size="xs" />
      <div class="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <UInput
          v-if="requiresPassword"
          v-model="password"
          type="password"
          autocomplete="off"
          placeholder="Network password"
          :disabled="connecting || connected"
        />
        <div class="flex items-center gap-2">
          <UButton
            color="primary"
            :loading="connecting"
            :disabled="connected"
            icon="i-lucide-link-2"
            @click="emitConnect"
          >
            {{ connected ? 'Connected' : 'Connect' }}
          </UButton>
          <UButton
            color="neutral"
            variant="ghost"
            icon="i-lucide-copy"
            :disabled="!ap.ssid"
            @click="copySsid"
          >
            Copy SSID
          </UButton>
        </div>
      </div>
    </div>
  </UCard>
</template>

<script setup lang="ts">
import { computed, ref, toRefs, watch } from 'vue'
import { getSecurityLabel, requiresPassword as requiresPasswordFn, getSignalStrength } from '@/utils/wifi'
import type { WifiAP } from '@/stores/ble_prov'

const props = defineProps<{
  ap: WifiAP
  connecting?: boolean
  connected?: boolean
}>()

const emit = defineEmits<{ (e: 'connect', payload: { ap: WifiAP; password?: string }): void }>()

const { ap, connecting: connectingProp, connected: connectedProp } = toRefs(props)
const password = ref('')
const connecting = computed(() => connectingProp?.value ?? false)
const connected = computed(() => connectedProp?.value ?? false)

const signalStrength = computed(() => getSignalStrength(ap.value.rssi))
const signalLabel = computed(() => `${Math.round(signalStrength.value)}% signal`)
const securityLabel = computed(() => getSecurityLabel(ap.value.auth))
const requiresPassword = computed(() => requiresPasswordFn(ap.value.auth))

const emitConnect = () => {
  emit('connect', { ap: ap.value, password: requiresPassword.value ? password.value : undefined })
}

const copySsid = () => {
  if (!ap.value.ssid) return
  navigator.clipboard?.writeText(ap.value.ssid)
}

watch(connected, (connectedNow) => {
  if (connectedNow) {
    password.value = ''
  }
})
</script>
