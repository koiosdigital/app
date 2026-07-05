// Display transition effects, mirrored from the firmware registry
// (nemoto-fw main/display/display.cpp EFFECTS[]). The cloud API has no
// effects-list endpoint — the set is static per firmware release, so keep
// this in sync when effects are added there.
export type NemotoEffect = {
  id: string
  name: string
  description: string
}

export const NEMOTO_EFFECTS: NemotoEffect[] = [
  { id: 'none', name: 'None', description: 'All modules update simultaneously' },
  { id: 'slide-down', name: 'Slide Down', description: 'Wave starts at top row, cascades down' },
  { id: 'slide-up', name: 'Slide Up', description: 'Wave starts at bottom row, cascades up' },
  {
    id: 'slide-right',
    name: 'Slide Right',
    description: 'Wave starts at left column, moves right',
  },
  { id: 'slide-left', name: 'Slide Left', description: 'Wave starts at right column, moves left' },
  {
    id: 'diag-TL',
    name: 'Diagonal from Top-Left',
    description: 'Wave emanates from the top-left corner',
  },
  {
    id: 'diag-TR',
    name: 'Diagonal from Top-Right',
    description: 'Wave emanates from the top-right corner',
  },
  {
    id: 'diag-BL',
    name: 'Diagonal from Bottom-Left',
    description: 'Wave emanates from the bottom-left corner',
  },
  {
    id: 'diag-BR',
    name: 'Diagonal from Bottom-Right',
    description: 'Wave emanates from the bottom-right corner',
  },
  { id: 'radial-out', name: 'Radial Out', description: 'Wave radiates outward from the center' },
  {
    id: 'radial-in',
    name: 'Radial In',
    description: 'Wave collapses from edges into the center',
  },
  {
    id: 'curtain-h-in',
    name: 'Curtain Close (Columns)',
    description: 'Columns sweep from both edges to the center',
  },
  {
    id: 'curtain-h-out',
    name: 'Curtain Open (Columns)',
    description: 'Columns sweep from the center to both edges',
  },
  {
    id: 'curtain-v-in',
    name: 'Curtain Close (Rows)',
    description: 'Rows sweep from top and bottom to the middle',
  },
  {
    id: 'curtain-v-out',
    name: 'Curtain Open (Rows)',
    description: 'Rows sweep from the middle to top and bottom',
  },
  {
    id: 'checkerboard',
    name: 'Checkerboard',
    description: 'Alternating cells flip in two phases',
  },
  {
    id: 'sparkle',
    name: 'Sparkle',
    description: 'Cells flip in a scattered pseudo-random order',
  },
  {
    id: 'typewriter',
    name: 'Typewriter',
    description: 'Cells flip one by one, left to right, row by row',
  },
  {
    id: 'snake',
    name: 'Snake',
    description: 'Cells flip one by one, zigzagging across rows',
  },
]

/** Items for USelect/USelectMenu dropdowns. */
export const NEMOTO_EFFECT_ITEMS = NEMOTO_EFFECTS.map((e) => ({
  label: e.name,
  value: e.id,
  description: e.description,
}))
