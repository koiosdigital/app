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

          <!-- Step indicator (only when collect_point) -->
          <div
            v-if="collectPoint"
            class="flex items-center gap-4 border-b border-white/10 px-4 py-2"
          >
            <div
              v-for="(label, i) in stepLabels"
              :key="i"
              class="flex items-center gap-1.5 text-xs"
              :class="
                step === i
                  ? 'text-primary-400'
                  : stepCompleted(i)
                    ? 'text-green-400'
                    : 'text-white/40'
              "
            >
              <span
                class="flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold"
                :class="
                  stepCompleted(i)
                    ? 'bg-green-500/20'
                    : step === i
                      ? 'bg-primary-500/20'
                      : 'bg-white/10'
                "
              >
                {{ stepCompleted(i) ? '\u2713' : i + 1 }}
              </span>
              {{ label }}
            </div>
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
const stepLabels = ['Set Point', 'Draw Polygon']

// Modal state
const isOpen = ref(false)
const geocoding = ref(false)

// Drawing state
const step = ref<number>(0)
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
  if (collectPoint.value && step.value === 0) {
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

function stepCompleted(i: number): boolean {
  if (i === 0) return point.value !== null
  if (i === 1) return closed.value
  return false
}

// --- Actions ---

function openPicker() {
  if (parsedValue.value) {
    point.value = parsedValue.value.point
    vertices.value = [...parsedValue.value.vertices]
    closed.value = parsedValue.value.vertices.length >= 3
    step.value = 1

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
    step.value = collectPoint.value ? 0 : 1
    mapZoom.value = 4
  }
  isOpen.value = true
}

function onMapClick(event: google.maps.MapMouseEvent) {
  if (!event.latLng) return
  const pos: LatLng = { lat: event.latLng.lat(), lng: event.latLng.lng() }

  if (collectPoint.value && step.value === 0) {
    point.value = pos
    step.value = 1
  } else if (step.value === 1 && !closed.value) {
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
  step.value = collectPoint.value ? 0 : 1
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
