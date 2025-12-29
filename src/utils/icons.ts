/**
 * Icon utilities for Font Awesome icons.
 *
 * This app uses Font Awesome 6 icons via Iconify.
 * Icons are bundled locally from @iconify-json/fa6-solid and @iconify-json/fa6-regular.
 *
 * Format: i-{collection}:{icon-name}
 * The colon separates the collection (fa6-solid) from the icon name.
 */

/**
 * Font Awesome icon names used throughout the app.
 * Use these constants instead of hardcoding icon strings.
 */
export const icons = {
  // Navigation
  arrowLeft: 'i-fa6-solid:arrow-left',
  arrowRight: 'i-fa6-solid:arrow-right',
  arrowDown: 'i-fa6-solid:arrow-down',
  arrowUp: 'i-fa6-solid:arrow-up',
  chevronLeft: 'i-fa6-solid:chevron-left',
  chevronRight: 'i-fa6-solid:chevron-right',
  chevronDown: 'i-fa6-solid:chevron-down',
  chevronUp: 'i-fa6-solid:chevron-up',
  externalLink: 'i-fa6-solid:arrow-up-right-from-square',

  // Actions
  check: 'i-fa6-solid:check',
  close: 'i-fa6-solid:xmark',
  plus: 'i-fa6-solid:plus',
  minus: 'i-fa6-solid:minus',
  search: 'i-fa6-solid:magnifying-glass',
  trash: 'i-fa6-solid:trash',
  edit: 'i-fa6-solid:pen',
  copy: 'i-fa6-regular:copy',
  upload: 'i-fa6-solid:upload',
  download: 'i-fa6-solid:download',
  play: 'i-fa6-solid:play',
  stop: 'i-fa6-solid:stop',
  refresh: 'i-fa6-solid:rotate-right',
  settings: 'i-fa6-solid:gear',
  sliders: 'i-fa6-solid:sliders',
  gripVertical: 'i-fa6-solid:grip-vertical',
  ellipsisVertical: 'i-fa6-solid:ellipsis-vertical',
  link: 'i-fa6-solid:link',
  pin: 'i-fa6-solid:thumbtack',

  // Status
  spinner: 'i-fa6-solid:spinner',
  circleCheck: 'i-fa6-solid:circle-check',
  circleXmark: 'i-fa6-solid:circle-xmark',
  circleExclamation: 'i-fa6-solid:circle-exclamation',
  circleInfo: 'i-fa6-solid:circle-info',
  triangleExclamation: 'i-fa6-solid:triangle-exclamation',

  // UI Elements
  info: 'i-fa6-solid:circle-info',
  eye: 'i-fa6-regular:eye',
  eyeSlash: 'i-fa6-regular:eye-slash',
  image: 'i-fa6-regular:image',
  imageSlash: 'i-fa6-solid:image', // No slash variant, use regular
  sun: 'i-fa6-solid:sun',
  moon: 'i-fa6-solid:moon',

  // Users
  user: 'i-fa6-solid:user',
  userPlus: 'i-fa6-solid:user-plus',
  userMinus: 'i-fa6-solid:user-minus',
  userGear: 'i-fa6-solid:user-gear',

  // Communication
  envelope: 'i-fa6-regular:envelope',

  // Devices & Tech
  wifi: 'i-fa6-solid:wifi',
  wifiSlash: 'i-fa6-solid:wifi', // No slash, will need styling
  bluetooth: 'i-fa6-brands:bluetooth-b',
  microchip: 'i-fa6-solid:microchip',
  desktop: 'i-fa6-solid:desktop',
  power: 'i-fa6-solid:power-off',
  key: 'i-fa6-solid:key',
  lock: 'i-fa6-solid:lock',
  shield: 'i-fa6-solid:shield',
  shieldCheck: 'i-fa6-solid:shield-halved',
  radar: 'i-fa6-solid:satellite-dish',
  locationDot: 'i-fa6-solid:location-dot',
  creditCard: 'i-fa6-regular:credit-card',
  clock: 'i-fa6-regular:clock',
  lifeRing: 'i-fa6-regular:life-ring',
  signOut: 'i-fa6-solid:right-from-bracket',
  signIn: 'i-fa6-solid:right-to-bracket',
  hand: 'i-fa6-solid:hand',
  sparkles: 'i-fa6-solid:wand-magic-sparkles',
  sortAZ: 'i-fa6-solid:arrow-down-a-z',
  sortZA: 'i-fa6-solid:arrow-down-z-a',
  boxOpen: 'i-fa6-solid:box-open',

  // Circuit/Device specific
  circuitBoard: 'i-fa6-solid:microchip',
} as const

export type IconName = keyof typeof icons

/**
 * Get a Font Awesome icon name.
 * This is a simple passthrough but provides type safety.
 */
export function getIcon(name: IconName): string {
  return icons[name]
}
