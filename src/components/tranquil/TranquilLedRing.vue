<template>
  <!-- Live LED strip, projected as a glowing ring of dots inside the preview.
       Fills its (relatively-positioned) parent; purely decorative. -->
  <canvas
    ref="canvasEl"
    class="pointer-events-none absolute inset-0 h-full w-full opacity-60 mix-blend-screen"
    aria-hidden="true"
  />
</template>

<script setup lang="ts">
import { onMounted, onUnmounted, useTemplateRef, watch } from 'vue'
import { useTranquilLocalStore } from '@/stores/tranquilLocal'
import {
  createPixdriverPreview,
  type PixdriverPreview,
  type LedPreviewState,
} from '@/lib/tranquil/pixdriver/runtime'

const store = useTranquilLocalStore()
const canvasEl = useTemplateRef<HTMLCanvasElement>('canvasEl')

let preview: PixdriverPreview | null = null
let raf = 0
let ro: ResizeObserver | null = null
let cssW = 0
let cssH = 0
let disposed = false

// Skip painting near-black LEDs so an "off" strip shows nothing (not a dark ring).
const MIN_LUMA = 12

function resize() {
  const canvas = canvasEl.value
  if (!canvas) return
  const rect = canvas.getBoundingClientRect()
  const dpr = Math.min(window.devicePixelRatio || 1, 2)
  cssW = rect.width
  cssH = rect.height
  canvas.width = Math.round(cssW * dpr)
  canvas.height = Math.round(cssH * dpr)
  const ctx = canvas.getContext('2d')
  if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
}

function paint() {
  raf = requestAnimationFrame(paint)
  const canvas = canvasEl.value
  const ctx = canvas?.getContext('2d')
  if (!canvas || !ctx || !preview || cssW === 0) return

  const frame = preview.frame()
  const n = preview.ledCount
  ctx.clearRect(0, 0, cssW, cssH)

  const cx = cssW / 2
  const cy = cssH / 2
  const R = Math.min(cssW, cssH) / 2

  ctx.save()
  // Confine the light to the sand bed; the canvas is screen-blended over the
  // pattern beneath, so this reads as colored light washing onto the sand.
  ctx.beginPath()
  ctx.arc(cx, cy, R, 0, 2 * Math.PI)
  ctx.clip()
  ctx.globalCompositeOperation = 'lighter' // adjacent LEDs blend smoothly

  // Each LED casts a soft cone of light from the rim toward (and past) the
  // centre. Sample sparsely: many overlapping additive blobs pile up in the
  // middle, so keep the count low and the per-blob alpha gentle — the large
  // soft blobs still overlap into a continuous wash.
  const blobR = R * 1.35 // reaches the centre with a faint tail
  const step = Math.max(1, Math.round(n / 24))
  for (let i = 0; i < n; i += step) {
    let r = frame[i * 4]
    let g = frame[i * 4 + 1]
    let b = frame[i * 4 + 2]
    const w = frame[i * 4 + 3]
    // Fold the RGBW white channel in as warm white (gently — it brightens).
    if (w) {
      r = Math.min(255, r + w * 0.6)
      g = Math.min(255, g + w * 0.55)
      b = Math.min(255, b + w * 0.4)
    }
    if (r + g + b < MIN_LUMA) continue

    // index 0 at top, clockwise (per-model start/direction calibration TODO).
    const angle = -Math.PI / 2 + (2 * Math.PI * i) / n
    const px = cx + R * Math.cos(angle)
    const py = cy + R * Math.sin(angle)
    const grad = ctx.createRadialGradient(px, py, 0, px, py, blobR)
    // Rim-weighted falloff: bright at the LED, faint by the middle.
    grad.addColorStop(0, `rgba(${r | 0},${g | 0},${b | 0},0.16)`)
    grad.addColorStop(0.4, `rgba(${r | 0},${g | 0},${b | 0},0.04)`)
    grad.addColorStop(1, 'rgba(0,0,0,0)')
    ctx.fillStyle = grad
    ctx.fillRect(px - blobR, py - blobR, blobR * 2, blobR * 2)
  }
  ctx.restore()
}

async function start() {
  if (disposed || !store.activeDevice) return
  try {
    const api = store.api()
    const [config, channel] = await Promise.all([api.led.getConfig(), api.led.getChannel(0)])
    const led = config.channels[0]
    if (!led || led.num_leds <= 0) return // no strip → nothing to draw

    preview = await createPixdriverPreview(led.num_leds, led.type.toUpperCase().includes('RGBW'))
    if (disposed) {
      preview.dispose()
      preview = null
      return
    }
    applyState(channel)
    resize()
    ro = new ResizeObserver(resize)
    if (canvasEl.value) ro.observe(canvasEl.value)
    raf = requestAnimationFrame(paint)
  } catch {
    // Preview is best-effort — a missing wasm / offline strip just renders nothing.
  }
}

function applyState(channel: {
  effect_id: string
  color: string
  brightness: number
  speed: number
  on: boolean
}) {
  const state: LedPreviewState = {
    effectId: channel.effect_id,
    color: channel.color || '#ffffff',
    brightness: channel.brightness,
    speed: channel.speed,
    on: channel.on,
  }
  preview?.setState(state)
}

function stop() {
  cancelAnimationFrame(raf)
  raf = 0
  ro?.disconnect()
  ro = null
  preview?.dispose()
  preview = null
}

onMounted(start)
onUnmounted(() => {
  disposed = true
  stop()
})

// If the connection is re-established (e.g. reconnect), restart the preview.
watch(
  () => store.activeDevice?.id,
  () => {
    stop()
    disposed = false
    void start()
  },
)
</script>
