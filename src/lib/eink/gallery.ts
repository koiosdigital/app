/**
 * On-phone gallery store for eInk frames.
 *
 * The frame's own flash gallery is tiny (~320 KB on the ESP32), so the full
 * photo library lives here, on the phone, in IndexedDB — one record per photo,
 * holding a panel-sized JPEG (what gets pushed to the frame) plus a small
 * thumbnail for the grid. Records are keyed by the owning device id, so each
 * frame has its own library. Dependency-free (raw IndexedDB) so it works in the
 * web build and the Capacitor WebView alike.
 */

const DB_NAME = 'koios-eink'
const DB_VERSION = 1
const STORE = 'photos'

export interface EinkPhoto {
  id: string
  deviceId: string
  name: string
  createdAt: number
  width: number
  height: number
  /** Panel-sized JPEG pushed to the frame. */
  full: Blob
  /** Small JPEG for the grid. */
  thumb: Blob
}

/** Grid-facing metadata (no full blob) plus an object URL for the thumbnail. */
export interface EinkPhotoMeta {
  id: string
  deviceId: string
  name: string
  createdAt: number
  width: number
  height: number
  thumbUrl: string
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: 'id' })
        store.createIndex('deviceId', 'deviceId', { unique: false })
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

function tx<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(STORE, mode)
        const req = fn(t.objectStore(STORE))
        req.onsuccess = () => resolve(req.result)
        req.onerror = () => reject(req.error)
        t.oncomplete = () => db.close()
      }),
  )
}

// ---------------------------------------------------------------------------
// Image processing (canvas)
// ---------------------------------------------------------------------------

function loadImage(blob: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob)
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      resolve(img)
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('could not decode image'))
    }
    img.src = url
  })
}

/**
 * Fit the image inside maxW x maxH (preserving aspect, never upscaling) and
 * encode JPEG. This matches the frame's own Contain fit, so what the user sees
 * in the grid is what the panel shows.
 *
 * The frame can only buffer a bounded JPEG in RAM (its decoder needs random
 * access, and a 2 MB-PSRAM board can't hold a big JPEG next to the 960 KB
 * framebuffer). That's fine: the panel only renders 6 dithered colors, so a
 * low-quality (small) JPEG looks identical on the panel to a high-quality one.
 * So when `maxBytes` is set we step the quality down until the file fits.
 */
async function resizeToJpeg(
  source: HTMLImageElement,
  maxW: number,
  maxH: number,
  quality: number,
  maxBytes?: number,
): Promise<{ blob: Blob; width: number; height: number }> {
  const scale = Math.min(maxW / source.width, maxH / source.height, 1)
  const width = Math.max(1, Math.round(source.width * scale))
  const height = Math.max(1, Math.round(source.height * scale))

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('canvas 2d context unavailable')
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, width, height)
  ctx.drawImage(source, 0, 0, width, height)

  const encode = (q: number) =>
    new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', q))

  let q = quality
  let blob = await encode(q)
  while (maxBytes && blob && blob.size > maxBytes && q > 0.35) {
    q = Math.max(0.35, q - 0.1)
    blob = await encode(q)
  }
  if (!blob) throw new Error('JPEG encode failed')
  return { blob, width, height }
}

// The frame now streams the JPEG straight off the socket (no in-RAM buffer),
// so quality is what matters: send a high-quality panel image. The cap is just
// a generous guard against a pathologically large file, not a tight budget.
const MAX_PANEL_JPEG_BYTES = 1500 * 1024

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Resize a picked image to the panel size + a thumbnail and store both under
 * the given device. Returns the new photo's metadata.
 */
export async function addPhoto(
  deviceId: string,
  file: File,
  panel: { width: number; height: number },
): Promise<EinkPhotoMeta> {
  const img = await loadImage(file)
  const full = await resizeToJpeg(img, panel.width, panel.height, 0.92, MAX_PANEL_JPEG_BYTES)
  const thumb = await resizeToJpeg(img, 400, 400, 0.8)

  const record: EinkPhoto = {
    id: crypto.randomUUID(),
    deviceId,
    name: file.name || 'photo.jpg',
    createdAt: Date.now(),
    width: full.width,
    height: full.height,
    full: full.blob,
    thumb: thumb.blob,
  }
  await tx('readwrite', (s) => s.put(record))
  return toMeta(record)
}

function toMeta(p: EinkPhoto): EinkPhotoMeta {
  return {
    id: p.id,
    deviceId: p.deviceId,
    name: p.name,
    createdAt: p.createdAt,
    width: p.width,
    height: p.height,
    thumbUrl: URL.createObjectURL(p.thumb),
  }
}

/** List a device's photos (newest first), each with a fresh thumbnail URL. */
export async function listPhotos(deviceId: string): Promise<EinkPhotoMeta[]> {
  const all = await tx<EinkPhoto[]>('readonly', (s) => s.index('deviceId').getAll(deviceId))
  return all.sort((a, b) => b.createdAt - a.createdAt).map(toMeta)
}

/** The panel-sized JPEG for a photo, to push to the frame. */
export async function getFullBlob(id: string): Promise<Blob | null> {
  const rec = await tx<EinkPhoto | undefined>('readonly', (s) => s.get(id))
  return rec ? rec.full : null
}

export async function deletePhoto(id: string): Promise<void> {
  await tx('readwrite', (s) => s.delete(id))
}
