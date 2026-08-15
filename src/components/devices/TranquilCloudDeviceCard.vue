<template>
  <BaseDeviceCard
    eyebrow="Sand table"
    :title="displayName"
    subtitle="Control needs the same network"
    @click="emit('open', device.id)"
  >
    <template #header-end>
      <DeviceStatus :online="device.online" link="cloud" />
    </template>

    <template #content>
      <!-- Empty disc: the table is only controllable LAN-direct, so there's no
           live pattern to preview from the cloud. -->
      <div class="w-36">
        <TranquilPatternThumb :src="null" alt="" />
      </div>
    </template>
  </BaseDeviceCard>
</template>

<script setup lang="ts">
import { computed, toRef } from 'vue'
import type { TranquilDevice } from '@/lib/api/mappers/deviceMapper'
import BaseDeviceCard from './BaseDeviceCard.vue'
import DeviceStatus from './DeviceStatus.vue'
import TranquilPatternThumb from '@/components/tranquil/TranquilPatternThumb.vue'

const props = defineProps<{ device: TranquilDevice }>()

const emit = defineEmits<{
  (e: 'open', id: string): void
}>()

const device = toRef(props, 'device')

const displayName = computed(() => device.value.settings?.displayName || device.value.id)
</script>
