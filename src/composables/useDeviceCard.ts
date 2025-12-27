import { computed, type Ref } from 'vue'
import { getStatusLabel, getPowerLabel } from '@/utils/device'

type DeviceWithOnline = {
  online: boolean
}

/**
 * Composable for device card computed properties
 * Reduces duplication across device card components
 */
export function useDeviceCard<T extends DeviceWithOnline>(device: Ref<T>) {
  const statusLabel = computed(() => getStatusLabel(device.value.online))
  const powerLabel = computed(() => getPowerLabel(device.value.online))

  return {
    statusLabel,
    powerLabel,
  }
}
