/**
 * kd_pixdriver WASM preview runtime.
 *
 * Loads the Emscripten build of the LED effect engine (vendored from the
 * kd_pixdriver v1.0.0 release under /public/pixdriver) and drives a single
 * `PixelPreview` so the app can render the table's LED strip live in-browser.
 *
 * Phase 1: the wasm is a bundled static asset. Phase 2 will resolve it per
 * device commit (GET /api/led/config `.version`) and cache by SHA; the loader
 * below is the seam for that.
 */

const SCRIPT_URL = '/pixdriver/pixel_preview.js'
const WASM_DIR = '/pixdriver/'

/** Minimal typing of the embind surface we use. */
interface PixelPreviewInstance {
  setEffect(id: string): void
  setColor(r: number, g: number, b: number, w: number): void
  setBrightness(brightness: number): void
  setSpeed(speed: number): void
  setRandomSeed(seed: number): void
  tick(): void
  reset(): void
  getFrameData(): Uint8Array
  getLedCount(): number
  delete(): void
}

interface PixelModule {
  PixelPreview: new (
    ledCount: number,
    isRgbw: boolean,
    updateRateHz: number,
  ) => PixelPreviewInstance
  getVersion(): string
}

type PixelFactory = (opts?: { locateFile?: (path: string) => string }) => Promise<PixelModule>

let modulePromise: Promise<PixelModule> | null = null

function loadFactory(): Promise<PixelFactory> {
  const w = window as unknown as { createPixelPreview?: PixelFactory }
  if (w.createPixelPreview) return Promise.resolve(w.createPixelPreview)

  return new Promise<PixelFactory>((resolve, reject) => {
    const done = () =>
      w.createPixelPreview
        ? resolve(w.createPixelPreview)
        : reject(new Error('pixdriver: factory missing after load'))

    const existing = document.querySelector<HTMLScriptElement>('script[data-pixdriver]')
    if (existing) {
      existing.addEventListener('load', done, { once: true })
      existing.addEventListener('error', () => reject(new Error('pixdriver: script error')), {
        once: true,
      })
      return
    }
    const s = document.createElement('script')
    s.src = SCRIPT_URL
    s.async = true
    s.dataset.pixdriver = '1'
    s.onload = done
    s.onerror = () => reject(new Error('pixdriver: failed to load script'))
    document.head.appendChild(s)
  })
}

/** Load the wasm module once (cached for the app lifetime). */
export function loadPixdriver(): Promise<PixelModule> {
  if (!modulePromise) {
    modulePromise = loadFactory().then((factory) =>
      factory({ locateFile: (path) => `${WASM_DIR}${path}` }),
    )
    // Let a failed load retry on the next call.
    modulePromise.catch(() => {
      modulePromise = null
    })
  }
  return modulePromise
}

export interface LedPreviewState {
  effectId: string
  /** `#rrggbb` from the firmware LED channel. */
  color: string
  /** 0-255. */
  brightness: number
  /** Firmware channel speed (1-255); mapped to the engine's 1-10. */
  speed: number
  on: boolean
}

function hexToRgb(hex: string): [number, number, number] {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim())
  if (!m) return [255, 255, 255]
  const n = parseInt(m[1], 16)
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff]
}

// Engine speed is 1..10; the firmware channel exposes 1..255.
function mapSpeed(speed: number): number {
  return Math.max(1, Math.min(10, Math.round((speed / 255) * 10)))
}

/**
 * One driven LED strip preview. Owns an embind object — call `dispose()` on
 * teardown (embind objects are not garbage-collected).
 */
export class PixdriverPreview {
  readonly ledCount: number
  private inst: PixelPreviewInstance

  constructor(mod: PixelModule, ledCount: number, isRgbw: boolean) {
    this.ledCount = ledCount
    this.inst = new mod.PixelPreview(ledCount, isRgbw, 60)
    this.inst.setRandomSeed(0x51ac)
  }

  setState(s: LedPreviewState) {
    const [r, g, b] = hexToRgb(s.color)
    this.inst.setColor(r, g, b, 0)
    // Brightness is baked into the frame, so drive it here rather than in paint.
    this.inst.setBrightness(s.on ? s.brightness : 0)
    this.inst.setSpeed(mapSpeed(s.speed))
    this.inst.setEffect(s.effectId || 'SOLID')
  }

  /** Advance one frame and return the RGBA buffer (4 bytes/LED, 4th = white). */
  frame(): Uint8Array {
    this.inst.tick()
    // Re-fetch every frame: it's a view into the wasm heap, which can move when
    // memory grows (ALLOW_MEMORY_GROWTH=1).
    return this.inst.getFrameData()
  }

  dispose() {
    this.inst.delete()
  }
}

/** Create a driven preview matching a device's LED channel (count + RGBW). */
export async function createPixdriverPreview(
  ledCount: number,
  isRgbw: boolean,
): Promise<PixdriverPreview> {
  const mod = await loadPixdriver()
  return new PixdriverPreview(mod, ledCount, isRgbw)
}
