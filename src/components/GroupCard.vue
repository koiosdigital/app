<template>
  <UCard class="border-white/10 bg-white/5 backdrop-blur">
    <template #header>
      <div class="flex flex-wrap items-center justify-between gap-3">
        <div class="flex items-center gap-3">
          <UIcon :name="groupIcon" class="h-6 w-6 text-white/80" />
          <div>
            <p class="text-xs uppercase tracking-[0.3em] text-white/60">Koios group</p>
            <h2 class="text-xl font-semibold">{{ group.name }}</h2>
          </div>
        </div>
        <div class="flex items-center gap-2">
          <UBadge color="primary" variant="soft">{{ onlineLabel }}</UBadge>
          <UBadge v-if="offlineCount" color="neutral" variant="soft">{{ offlineLabel }}</UBadge>
        </div>
      </div>
    </template>

    <div class="divide-y divide-white/10">
      <GroupedDeviceItem
        v-for="device in group.devices"
        :key="device.id"
        :device="device"
        @settings="emit('open', group.id)"
      />
    </div>

    <template #footer>
      <div class="flex items-center justify-between text-sm text-white/70">
        <span>{{ group.devices.length }} devices</span>
        <UButton
          size="sm"
          color="primary"
          variant="ghost"
          icon="i-lucide-external-link"
          @click="emit('open', group.id)"
        >
          View group
        </UButton>
      </div>
    </template>
  </UCard>
</template>

<script setup lang="ts">
import { computed, toRef } from 'vue'

import GroupedDeviceItem from './GroupedDeviceItem.vue'

type GroupDevice = {
  id: string
  name: string
  online: boolean
  location: string
}

type DeviceGroup = {
  id: string
  name: string
  icon: string
  devices: GroupDevice[]
}

const props = defineProps<{ group: DeviceGroup }>()
const emit = defineEmits<{ (e: 'open', id: string): void }>()

const group = toRef(props, 'group')

const onlineCount = computed(
  () => group.value.devices.filter((device) => device.online).length
)
const offlineCount = computed(() => group.value.devices.length - onlineCount.value)

const onlineLabel = computed(() => `${onlineCount.value} online`)
const offlineLabel = computed(() => `${offlineCount.value} offline`)
const groupIcon = computed(() => group.value.icon || 'i-lucide-circuit-board')
</script>
