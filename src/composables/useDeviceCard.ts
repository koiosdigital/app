import { computed, type Ref } from 'vue'
import { getStatusLabel, getPowerLabel } from '@/utils/device'

type DeviceWithStatus = {
  status: 'online' | 'offline'
  isOn: boolean
}

/**
 * Composable for device card computed properties
 * Reduces duplication across device card components
 */
export function useDeviceCard<T extends DeviceWithStatus>(device: Ref<T>) {
  const statusLabel = computed(() => getStatusLabel(device.value.status))
  const powerLabel = computed(() => getPowerLabel(device.value.isOn))

  return {
    statusLabel,
    powerLabel,
  }
}
