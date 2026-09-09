/**
 * Icon registration - must be imported FIRST before any UI components.
 *
 * Boot registers only the icons the app statically references
 * (`src/icons.generated.json`, produced by `scripts/build-icons.mjs`) - a few
 * hundred glyphs instead of the full Font Awesome 6 collections, which cost
 * ~1.5 MB of JSON parse on every cold start.
 *
 * The Matrx app schemas name icons at runtime (`utils/schemaIcons.ts`), so the
 * complete solid collection is still loaded - lazily, in the background, once
 * the first paint is done - to keep those working offline.
 *
 * Icon naming convention for Nuxt UI:
 * - Use "i-fa6-solid:icon-name" format (colon before icon name)
 * - The "i-" prefix is stripped by UIcon, resulting in "fa6-solid:icon-name"
 */
import { addCollection, type IconifyJSON } from '@iconify/vue'

import subset from './icons.generated.json'

for (const collection of subset as unknown as IconifyJSON[]) {
  addCollection(collection)
}

// Full solid set for runtime-named (schema) icons. Deferred past first paint;
// `requestIdleCallback` where available, else a short timeout.
function loadFullSolid() {
  import('@iconify-json/fa6-solid/icons.json')
    .then((mod) => addCollection((mod.default ?? mod) as IconifyJSON))
    .catch((err) => console.warn('[Icons] Full fa6-solid load failed', err))
}

if (typeof window !== 'undefined') {
  const idle = (window as Window & { requestIdleCallback?: (cb: () => void) => number })
    .requestIdleCallback
  if (idle) idle(loadFullSolid)
  else setTimeout(loadFullSolid, 1500)
}
