/**
 * Icon registration - must be imported FIRST before any UI components.
 * This registers Font Awesome icon collections with @iconify/vue for offline use.
 *
 * Icon naming convention for Nuxt UI:
 * - Use "i-fa6-solid:icon-name" format (colon before icon name)
 * - The "i-" prefix is stripped by UIcon, resulting in "fa6-solid:icon-name"
 * - Iconify then looks up the icon using the prefix "fa6-solid" and name "icon-name"
 */
import { addCollection } from '@iconify/vue'

// Import icon collections - these contain the prefix (e.g., "fa6-solid") and all icons
import fa6Solid from '@iconify-json/fa6-solid/icons.json'
import fa6Regular from '@iconify-json/fa6-regular/icons.json'
import fa6Brands from '@iconify-json/fa6-brands/icons.json'

// Register collections before any component renders
addCollection(fa6Solid)
addCollection(fa6Regular)
addCollection(fa6Brands)

console.log('[Icons] Registered Font Awesome 6 collections for offline use')
