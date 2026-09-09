#!/usr/bin/env node
/**
 * Build the icon subset the app registers at boot.
 *
 * `src/icons.ts` used to `addCollection()` the ENTIRE Font Awesome 6 solid /
 * regular / brands collections (~1.5 MB of JSON, parsed synchronously on every
 * cold start) for the ~150 icons the app actually references. This script
 * scans the source for `i-fa6-<set>:<name>` references (plus the Nuxt UI
 * default-icon map in vite.config.ts) and writes just those icons - aliases
 * resolved - to `src/icons.generated.json`, in the IconifyJSON shape
 * `addCollection` expects.
 *
 * Icons named at runtime (the Matrx schema icons, `utils/schemaIcons.ts`) are
 * not in the subset; `src/icons.ts` lazy-loads the full solid collection in
 * the background for those.
 *
 * Run: `pnpm generate:icons` (also wired into `dev` / `build`).
 */
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const root = join(dirname(fileURLToPath(import.meta.url)), '..')

const SETS = {
  'fa6-solid': '@iconify-json/fa6-solid/icons.json',
  'fa6-regular': '@iconify-json/fa6-regular/icons.json',
  'fa6-brands': '@iconify-json/fa6-brands/icons.json',
  lucide: '@iconify-json/lucide/icons.json',
}

// Walk src/ + vite.config.ts and collect every "i-<set>:<name>" token.
function* walk(dir) {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry)
    const st = statSync(p)
    if (st.isDirectory()) {
      if (entry === 'node_modules' || entry === 'protobufs') continue
      yield* walk(p)
    } else if (/\.(vue|ts|js|mjs|json)$/.test(entry) && !p.endsWith('icons.generated.json')) {
      yield p
    }
  }
}

const used = new Map(Object.keys(SETS).map((set) => [set, new Set()]))
const re = /\bi-(fa6-solid|fa6-regular|fa6-brands|lucide):([a-z0-9][a-z0-9-]*)/g
const files = [...walk(join(root, 'src')), join(root, 'vite.config.ts')]
for (const file of files) {
  const text = readFileSync(file, 'utf8')
  for (const m of text.matchAll(re)) used.get(m[1]).add(m[2])
}

// Nuxt UI resolves a few icons internally by name (loading spinner, chevrons,
// close) - make sure they're present even if no template mentions them.
for (const name of ['spinner', 'chevron-down', 'chevron-right', 'xmark', 'check', 'circle-info']) {
  used.get('fa6-solid').add(name)
}

const collections = []
let total = 0
const missing = []
for (const [set, pkg] of Object.entries(SETS)) {
  const full = require(pkg)
  const names = used.get(set)
  if (names.size === 0) continue
  const icons = {}
  const aliases = {}
  for (const name of names) {
    if (full.icons[name]) {
      icons[name] = full.icons[name]
    } else if (full.aliases?.[name]) {
      const alias = full.aliases[name]
      aliases[name] = alias
      if (full.icons[alias.parent]) icons[alias.parent] = full.icons[alias.parent]
    } else {
      missing.push(`${set}:${name}`)
    }
  }
  const out = { prefix: set, icons }
  if (Object.keys(aliases).length) out.aliases = aliases
  for (const key of ['width', 'height', 'lastModified']) {
    if (full[key] !== undefined) out[key] = full[key]
  }
  collections.push(out)
  total += Object.keys(icons).length
}

if (missing.length) {
  console.warn(`build-icons: ${missing.length} referenced icons not found: ${missing.join(', ')}`)
}

const outPath = join(root, 'src', 'icons.generated.json')
writeFileSync(outPath, JSON.stringify(collections) + '\n')
console.log(`build-icons: wrote ${total} icons across ${collections.length} collections -> src/icons.generated.json`)
