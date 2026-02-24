<template>
  <div>
    <!-- Value set: show summary badge -->
    <div
      v-if="isSet"
      class="flex items-center justify-between rounded-lg border border-white/10 bg-white/5 px-3 py-1"
    >
      <div class="flex items-center gap-2 min-w-0">
        <UIcon name="i-fa6-solid:draw-polygon" class="h-4 w-4 shrink-0 text-primary-400" />
        <span class="truncate text-sm text-white/80 max-w-32 lg:max-w-48">
          {{ parsedDescription || 'GeoJSON area' }}
        </span>
      </div>
      <button type="button" class="shrink-0 rounded p-1 hover:bg-white/10" @click="clearValue">
        <UIcon name="i-fa6-solid:xmark" class="h-4 w-4 text-red-400" />
      </button>
    </div>

    <!-- No value: show draw button -->
    <UButton
      v-else
      color="neutral"
      variant="soft"
      icon="i-fa6-solid:draw-polygon"
      @click="openPicker"
    >
      Draw Area
    </UButton>

    <p v-if="error" class="mt-1 text-xs text-red-400">{{ error }}</p>

    <!-- Map picker modal -->
    <UModal v-model:open="isOpen" :ui="{ width: 'sm:max-w-xl' }">
      <template #content>
        <div class="flex h-[75vh] flex-col bg-zinc-900">
          <!-- Header -->
          <div class="flex items-center gap-3 border-b border-white/10 px-4 py-3">
            <UButton
              color="neutral"
              variant="ghost"
              icon="i-fa6-solid:xmark"
              square
              size="sm"
              @click="isOpen = false"
            />
            <p class="font-medium text-white">Draw Area</p>
          </div>

          <!-- Stepper (only when collect_point) -->
          <div v-if="collectPoint" class="px-4 pt-3">
            <UStepper v-model="activeStep" :items="stepperItems" size="sm" color="primary" />
          </div>

          <!-- Status text -->
          <div class="px-4 py-2 text-xs text-white/60">
            {{ statusText }}
          </div>

          <!-- Map -->
          <div class="flex-1">
            <GoogleMap
              :api-key="apiKey"
              :libraries="['marker']"
              :center="mapCenter"
              :zoom="mapZoom"
              :disable-default-ui="true"
              :zoom-control="true"
              gesture-handling="greedy"
              background-color="#09090b"
              map-id="koios-geojson-picker"
              style="width: 100%; height: 100%"
              @click="onMapClick"
            >
              <!-- Placed point marker -->
              <AdvancedMarker v-if="point" :options="{ position: point }" />

              <!-- Completed polygon -->
              <Polygon v-if="closed && vertices.length >= 3" :options="polygonOptions" />

              <!-- In-progress polyline -->
              <Polyline v-if="!closed && vertices.length >= 2" :options="polylineOptions" />

              <!-- Vertex markers -->
              <AdvancedMarker
                v-for="(v, i) in vertices"
                :key="'v-' + i"
                :options="{ position: v }"
                :pin-options="vertexPinOptions(i)"
              />
            </GoogleMap>
          </div>

          <!-- Footer -->
          <div class="flex flex-wrap items-center gap-2 border-t border-white/10 p-3">
            <UButton
              v-if="collectPoint && activeStep === 'point'"
              color="neutral"
              variant="soft"
              icon="i-fa6-solid:location-crosshairs"
              :loading="locating"
              @click="useCurrentLocation"
            >
              Use Current Location
            </UButton>

            <UButton v-if="!closed && vertices.length >= 3" color="primary" @click="closePolygon">
              Close Polygon
            </UButton>

            <UButton
              v-if="collectPoint && vertices.length > 0 && !closed"
              color="neutral"
              variant="soft"
              @click="clearPolygon"
            >
              Restart Polygon
            </UButton>

            <UButton
              v-if="vertices.length > 0 || point"
              color="neutral"
              variant="soft"
              icon="i-fa6-solid:trash"
              @click="clearAll"
            >
              Clear All
            </UButton>

            <div class="flex-1" />

            <UButton v-if="canConfirm" color="primary" :loading="geocoding" @click="confirmDrawing">
              Confirm
            </UButton>
          </div>
        </div>
      </template>
    </UModal>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, defineAsyncComponent } from 'vue'
import { Geolocation } from '@capacitor/geolocation'
import type { components } from '@/types/api'
import { ENV } from '@/config/environment'
import { appsApi } from '@/lib/api/apps'

const GoogleMap = defineAsyncComponent(() => import('vue3-google-map').then((m) => m.GoogleMap))
const AdvancedMarker = defineAsyncComponent(() =>
  import('vue3-google-map').then((m) => m.AdvancedMarker),
)
const Polygon = defineAsyncComponent(() => import('vue3-google-map').then((m) => m.Polygon))
const Polyline = defineAsyncComponent(() => import('vue3-google-map').then((m) => m.Polyline))

interface LatLng {
  lat: number
  lng: number
}

type GeoJSONField = components['schemas']['AppSchemaGeoJSONFieldDto']

const props = defineProps<{
  field: GeoJSONField
  value: unknown
  error?: string
  appId: string
}>()

const emit = defineEmits<{
  (e: 'update:value', value: string): void
}>()

const apiKey = ENV.googleMapsApiKey()

const stepperItems = [
  { value: 'point', title: 'Set Point', icon: 'i-fa6-solid:location-dot' as const },
  { value: 'polygon', title: 'Draw Polygon', icon: 'i-fa6-solid:draw-polygon' as const },
]

// Modal state
const isOpen = ref(false)
const geocoding = ref(false)

// Drawing state
const activeStep = ref<string | number>('point')
const locating = ref(false)
const point = ref<LatLng | null>(null)
const vertices = ref<LatLng[]>([])
const closed = ref(false)

// Map state
const mapCenter = ref<LatLng>({ lat: 37.7749, lng: -122.4194 })
const mapZoom = ref(4)

const collectPoint = computed(() => props.field.collect_point ?? false)

// --- Parsed value from props ---

interface ParsedGeoJSON {
  description: string
  point: LatLng | null
  vertices: LatLng[]
}

const parsedValue = computed<ParsedGeoJSON | null>(() => {
  if (!props.value) return null
  try {
    const parsed = JSON.parse(String(props.value))
    if (parsed.type !== 'FeatureCollection' || !parsed.features) return null

    let pt: LatLng | null = null
    let verts: LatLng[] = []

    for (const feature of parsed.features) {
      if (!feature.geometry) continue
      if (feature.geometry.type === 'Point') {
        const [lng, lat] = feature.geometry.coordinates
        pt = { lat, lng }
      } else if (feature.geometry.type === 'Polygon') {
        const ring = feature.geometry.coordinates[0]
        verts = ring.slice(0, -1).map((c: number[]) => ({ lat: c[1], lng: c[0] }))
      }
    }

    return { description: parsed.description || '', point: pt, vertices: verts }
  } catch {
    return null
  }
})

const isSet = computed(() => parsedValue.value !== null)
const parsedDescription = computed(() => parsedValue.value?.description || '')

// --- Map options ---

const polygonOptions = computed(() => ({
  paths: vertices.value,
  strokeColor: '#6366f1',
  strokeWeight: 2,
  strokeOpacity: 0.8,
  fillColor: '#6366f1',
  fillOpacity: 0.15,
  clickable: false,
}))

const polylineOptions = computed(() => ({
  path: vertices.value,
  strokeColor: '#6366f1',
  strokeWeight: 2,
  strokeOpacity: 0.8,
  clickable: false,
}))

function vertexPinOptions(index: number) {
  const isFirst = index === 0 && vertices.value.length >= 3 && !closed.value
  return {
    scale: 0.6,
    background: isFirst ? '#22c55e' : '#6366f1',
    borderColor: isFirst ? '#16a34a' : '#4f46e5',
    glyphColor: '#ffffff',
  }
}

// --- Status text ---

const statusText = computed(() => {
  if (collectPoint.value && activeStep.value === 'point') {
    return 'Click the map to set your location point'
  }
  if (closed.value) {
    return `Polygon complete (${vertices.value.length} vertices)`
  }
  if (vertices.value.length === 0) {
    return 'Click on the map to start drawing a polygon'
  }
  if (vertices.value.length < 3) {
    return `Click to add more points (${vertices.value.length}/3 minimum)`
  }
  return 'Click to add points, or press "Close Polygon" to finish'
})

const canConfirm = computed(() => {
  if (collectPoint.value) {
    return point.value !== null && closed.value && vertices.value.length >= 3
  }
  return closed.value && vertices.value.length >= 3
})

// --- Actions ---

async function useCurrentLocation() {
  locating.value = true
  try {
    const position = await Geolocation.getCurrentPosition({
      enableHighAccuracy: true,
      timeout: 10000,
    })

    const pos = { lat: position.coords.latitude, lng: position.coords.longitude }
    point.value = pos
    mapCenter.value = pos
    activeStep.value = 'polygon'
  } catch (err) {
    console.error('Geolocation error:', err)
  } finally {
    locating.value = false
  }
}

function openPicker() {
  if (parsedValue.value) {
    point.value = parsedValue.value.point
    vertices.value = [...parsedValue.value.vertices]
    closed.value = parsedValue.value.vertices.length >= 3
    activeStep.value = 'polygon'

    if (parsedValue.value.vertices.length > 0) {
      mapCenter.value = computeCentroid(parsedValue.value.vertices)
      mapZoom.value = 13
    } else if (parsedValue.value.point) {
      mapCenter.value = parsedValue.value.point
      mapZoom.value = 13
    }
  } else {
    point.value = null
    vertices.value = []
    closed.value = false
    activeStep.value = collectPoint.value ? 'point' : 'polygon'
    mapZoom.value = 4
  }
  isOpen.value = true
}

function onMapClick(event: google.maps.MapMouseEvent) {
  if (!event.latLng) return
  const pos: LatLng = { lat: event.latLng.lat(), lng: event.latLng.lng() }

  if (collectPoint.value && activeStep.value === 'point') {
    point.value = pos
    activeStep.value = 'polygon'
  } else if (activeStep.value === 'polygon' && !closed.value) {
    vertices.value = [...vertices.value, pos]
  }
}

function closePolygon() {
  if (vertices.value.length >= 3) {
    closed.value = true
  }
}

function clearPolygon() {
  vertices.value = []
  closed.value = false
}

function clearAll() {
  point.value = null
  vertices.value = []
  closed.value = false
  activeStep.value = collectPoint.value ? 'point' : 'polygon'
}

function clearValue() {
  emit('update:value', '')
}

function computeCentroid(positions: LatLng[]): LatLng {
  const n = positions.length
  const lat = positions.reduce((sum, p) => sum + p.lat, 0) / n
  const lng = positions.reduce((sum, p) => sum + p.lng, 0) / n
  return { lat, lng }
}

function buildGeoJSONValue(
  pt: LatLng | null,
  positions: LatLng[],
  isClosed: boolean,
  isCollectPoint: boolean,
  description: string,
): string {
  const features: Record<string, unknown>[] = []

  if (isCollectPoint && pt) {
    features.push({
      type: 'Feature',
      properties: { role: 'point' },
      geometry: { type: 'Point', coordinates: [pt.lng, pt.lat] },
    })
  }

  if (isClosed && positions.length >= 3) {
    const coords = positions.map((p) => [p.lng, p.lat])
    coords.push(coords[0])
    features.push({
      type: 'Feature',
      properties: { role: 'polygon' },
      geometry: { type: 'Polygon', coordinates: [coords] },
    })
  }

  if (features.length === 0) return ''

  return JSON.stringify({ type: 'FeatureCollection', description, features })
}

async function confirmDrawing() {
  if (!canConfirm.value) return

  geocoding.value = true
  try {
    const geocodeTarget =
      collectPoint.value && point.value ? point.value : computeCentroid(vertices.value)

    let description = ''
    try {
      const result = await appsApi.geocode(props.appId, geocodeTarget.lat, geocodeTarget.lng)
      description = result.description
    } catch (err) {
      console.error('Geocoding failed:', err)
    }

    const value = buildGeoJSONValue(
      point.value,
      vertices.value,
      closed.value,
      collectPoint.value,
      description,
    )
    emit('update:value', value)
    isOpen.value = false
  } finally {
    geocoding.value = false
  }
}
</script>
