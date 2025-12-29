<template>
  <div class="space-y-3">
    <!-- Geolocation button -->
    <UButton
      color="neutral"
      variant="soft"
      icon="i-fa6-solid:location-dot"
      :loading="locating"
      @click="getLocation"
    >
      Use Current Location
    </UButton>

    <!-- Manual input -->
    <div class="grid grid-cols-2 gap-3">
      <div class="space-y-1">
        <label class="text-xs text-white/60">Latitude</label>
        <UInput
          :model-value="parsedLocation.lat"
          placeholder="0.0"
          type="number"
          step="any"
          @update:model-value="updateLat"
        />
      </div>
      <div class="space-y-1">
        <label class="text-xs text-white/60">Longitude</label>
        <UInput
          :model-value="parsedLocation.lng"
          placeholder="0.0"
          type="number"
          step="any"
          @update:model-value="updateLng"
        />
      </div>
    </div>

    <p v-if="locationError" class="text-xs text-red-400">{{ locationError }}</p>
    <p v-if="error" class="text-xs text-red-400">{{ error }}</p>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import type { components } from '@/types/api'

type LocationField = components['schemas']['AppSchemaLocationFieldDto']

const props = defineProps<{
  field: LocationField
  value: unknown
  error?: string
}>()

const emit = defineEmits<{
  (e: 'update:value', value: string): void
}>()

const locating = ref(false)
const locationError = ref<string>()

// Location is stored as JSON: {"lat":"...","lng":"...","timezone":"..."}
const parsedLocation = computed(() => {
  if (!props.value) return { lat: '', lng: '' }
  try {
    const parsed = JSON.parse(String(props.value))
    return {
      lat: parsed.lat || '',
      lng: parsed.lng || '',
    }
  } catch {
    return { lat: '', lng: '' }
  }
})

function buildLocationValue(lat: string, lng: string, timezone?: string) {
  return JSON.stringify({
    lat,
    lng,
    timezone: timezone || Intl.DateTimeFormat().resolvedOptions().timeZone,
  })
}

function updateLat(val: string) {
  emit('update:value', buildLocationValue(val, parsedLocation.value.lng))
}

function updateLng(val: string) {
  emit('update:value', buildLocationValue(parsedLocation.value.lat, val))
}

async function getLocation() {
  if (!navigator.geolocation) {
    locationError.value = 'Geolocation not supported'
    return
  }

  locating.value = true
  locationError.value = undefined

  try {
    const position = await new Promise<GeolocationPosition>((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(resolve, reject, {
        enableHighAccuracy: true,
        timeout: 10000,
      })
    })

    emit(
      'update:value',
      buildLocationValue(position.coords.latitude.toFixed(6), position.coords.longitude.toFixed(6)),
    )
  } catch (err) {
    locationError.value =
      err instanceof GeolocationPositionError ? err.message : 'Failed to get location'
  } finally {
    locating.value = false
  }
}
</script>
