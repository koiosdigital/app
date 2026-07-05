// 5- or 6-field cron parser with timezone-aware next-fire computation.
// Ported verbatim from nemoto-app (src/lib/cron.ts) so schedule editing
// behaves identically in the cloud app and the on-device UI.
//
// Field layout (6-field, with seconds):  S  M  H  DOM  MON  DOW
// Field layout (5-field):                   M  H  DOM  MON  DOW   (server prepends `0 ` for seconds)
//
// Supported per field:
//   *               any value
//   N               literal
//   A-B             range, inclusive
//   A-B/N or */N    step
//   N,M,...         list of any of the above
//
// DOM/DOW interaction follows standard cron: if both are restricted
// (not `*`), a day matches when EITHER matches. If only one is restricted,
// only that one constrains.

export type CronField = {
  /** Allowed integer values within this field's bounds. */
  values: Set<number>
  /** True when the field is `*` (no constraint). */
  any: boolean
}

export type CronSpec = {
  seconds: CronField
  minutes: CronField
  hours: CronField
  dom: CronField
  month: CronField
  dow: CronField
  /** Original input, trimmed. */
  raw: string
  /** Always 6-field (seconds prepended if needed). */
  normalized: string
  /** True when the input had 6 fields (the user explicitly set seconds). */
  hasSeconds: boolean
}

const BOUNDS = {
  seconds: { min: 0, max: 59 },
  minutes: { min: 0, max: 59 },
  hours: { min: 0, max: 23 },
  dom: { min: 1, max: 31 },
  month: { min: 1, max: 12 },
  // Accept 0-7 in input; both 0 and 7 mean Sunday. We normalize 7 → 0.
  dow: { min: 0, max: 7 },
} as const

const MONTH_NAMES: Record<string, number> = {
  JAN: 1,
  FEB: 2,
  MAR: 3,
  APR: 4,
  MAY: 5,
  JUN: 6,
  JUL: 7,
  AUG: 8,
  SEP: 9,
  OCT: 10,
  NOV: 11,
  DEC: 12,
}
const DOW_NAMES: Record<string, number> = {
  SUN: 0,
  MON: 1,
  TUE: 2,
  WED: 3,
  THU: 4,
  FRI: 5,
  SAT: 6,
}

function resolveAlias(token: string, kind: keyof typeof BOUNDS): number {
  const upper = token.toUpperCase()
  if (kind === 'month' && upper in MONTH_NAMES) return MONTH_NAMES[upper]
  if (kind === 'dow' && upper in DOW_NAMES) return DOW_NAMES[upper]
  const n = Number(token)
  if (!Number.isInteger(n)) throw new Error(`bad value: "${token}"`)
  return n
}

function parseField(raw: string, kind: keyof typeof BOUNDS): CronField {
  const { min, max } = BOUNDS[kind]
  const values = new Set<number>()
  const any = raw === '*' || raw === '*/1'

  for (const part of raw.split(',')) {
    const [rangePart, stepPart] = part.split('/')
    const step = stepPart === undefined ? 1 : Number(stepPart)
    if (!Number.isInteger(step) || step < 1) {
      throw new Error(`bad step in "${part}"`)
    }

    let lo: number, hi: number
    if (rangePart === '*') {
      lo = min
      hi = max
    } else if (rangePart.includes('-')) {
      const [a, b] = rangePart.split('-')
      lo = resolveAlias(a, kind)
      hi = resolveAlias(b, kind)
    } else {
      lo = hi = resolveAlias(rangePart, kind)
    }

    if (lo < min || hi > max || lo > hi) {
      throw new Error(`out of range: "${part}" (allowed ${min}-${max})`)
    }
    for (let v = lo; v <= hi; v += step) values.add(v)
  }

  // Normalize Sunday: cron allows 0 or 7; collapse to 0.
  if (kind === 'dow' && values.has(7)) {
    values.delete(7)
    values.add(0)
  }

  return { values, any }
}

export function parseCron(input: string): CronSpec {
  const raw = input.trim()
  if (!raw) throw new Error('empty cron expression')
  const parts = raw.split(/\s+/)
  if (parts.length !== 5 && parts.length !== 6) {
    throw new Error(`expected 5 or 6 fields, got ${parts.length}`)
  }
  const hasSeconds = parts.length === 6
  const [s, m, h, dom, mon, dow] = hasSeconds ? parts : ['0', ...parts]

  const spec: CronSpec = {
    seconds: parseField(s, 'seconds'),
    minutes: parseField(m, 'minutes'),
    hours: parseField(h, 'hours'),
    dom: parseField(dom, 'dom'),
    month: parseField(mon, 'month'),
    dow: parseField(dow, 'dow'),
    raw,
    normalized: `${s} ${m} ${h} ${dom} ${mon} ${dow}`,
    hasSeconds,
  }
  return spec
}

// ---------- timezone-aware wall-clock helpers ----------

type Wall = { y: number; mo: number; dom: number; h: number; m: number; s: number }

function wallFromDate(d: Date, tz: string): Wall {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  })
  const parts = fmt.formatToParts(d)
  const get = (t: string) => parseInt(parts.find((p) => p.type === t)!.value, 10)
  let h = get('hour')
  // Some Intl impls return 24 instead of 0 at midnight under hour12: false.
  if (h === 24) h = 0
  return {
    y: get('year'),
    mo: get('month'),
    dom: get('day'),
    h,
    m: get('minute'),
    s: get('second'),
  }
}

function wallToSynth(w: Wall): Date {
  return new Date(Date.UTC(w.y, w.mo - 1, w.dom, w.h, w.m, w.s))
}

/** Treat a synthetic wall-clock Date (UTC components = TZ wall clock) as a real
 *  UTC instant. Iterates a couple of times to settle DST offsets. */
function synthToReal(synth: Date, tz: string): Date {
  let guess = new Date(synth.getTime())
  for (let i = 0; i < 3; i++) {
    const wall = wallFromDate(guess, tz)
    const wallSynth = wallToSynth(wall).getTime()
    const offset = wallSynth - guess.getTime()
    guess = new Date(synth.getTime() - offset)
  }
  return guess
}

// ---------- next fire ----------

function smallestAtLeast(field: CronField, start: number, max: number): number | null {
  for (let v = start; v <= max; v++) if (field.values.has(v)) return v
  return null
}

function smallestInField(field: CronField): number {
  return Math.min(...field.values)
}

function dayOK(spec: CronSpec, dom: number, dow: number): boolean {
  const dowMatch = spec.dow.values.has(dow)
  const domMatch = spec.dom.values.has(dom)
  if (spec.dom.any && spec.dow.any) return true
  if (spec.dom.any) return dowMatch
  if (spec.dow.any) return domMatch
  return domMatch || dowMatch
}

/** Next moment AFTER `after` (exclusive) when the cron spec matches.
 *  Returns null if no match within ~5 years. */
export function nextFire(spec: CronSpec, after: Date = new Date(), tz?: string): Date | null {
  const zone = tz ?? Intl.DateTimeFormat().resolvedOptions().timeZone
  // Convert real UTC moment -> synth (UTC components = TZ wall clock).
  const wall = wallFromDate(after, zone)
  let t = wallToSynth(wall)
  // Step forward minimally past `after`.
  t = new Date(t.getTime() + (spec.hasSeconds ? 1000 : 60_000))
  // Snap to second/minute boundary depending on field granularity.
  if (spec.hasSeconds) {
    t.setUTCMilliseconds(0)
  } else {
    t.setUTCMilliseconds(0)
    t.setUTCSeconds(0)
  }

  // Field-level greedy advance. Cap at ~5 years for safety.
  const HARD_CAP = 5 * 366 * 24 * 60
  for (let safety = 0; safety < HARD_CAP; safety++) {
    const month = t.getUTCMonth() + 1
    if (!spec.month.values.has(month)) {
      // Jump to first day 00:00:00 of next allowed month.
      const nextMonth = smallestAtLeast(spec.month, month + 1, 12)
      if (nextMonth === null) {
        t = new Date(Date.UTC(t.getUTCFullYear() + 1, smallestInField(spec.month) - 1, 1))
      } else {
        t = new Date(Date.UTC(t.getUTCFullYear(), nextMonth - 1, 1))
      }
      continue
    }
    const dom = t.getUTCDate()
    const dow = t.getUTCDay()
    if (!dayOK(spec, dom, dow)) {
      // Advance by one day at midnight.
      t = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), dom + 1))
      continue
    }
    const hour = t.getUTCHours()
    if (!spec.hours.values.has(hour)) {
      const next = smallestAtLeast(spec.hours, hour + 1, 23)
      if (next === null) {
        t = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), dom + 1))
      } else {
        t = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), dom, next))
      }
      continue
    }
    const min = t.getUTCMinutes()
    if (!spec.minutes.values.has(min)) {
      const next = smallestAtLeast(spec.minutes, min + 1, 59)
      if (next === null) {
        t = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), dom, hour + 1))
      } else {
        t = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), dom, hour, next))
      }
      continue
    }
    const sec = t.getUTCSeconds()
    if (!spec.seconds.values.has(sec)) {
      const next = smallestAtLeast(spec.seconds, sec + 1, 59)
      if (next === null) {
        t = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), dom, hour, min + 1))
      } else {
        t = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), dom, hour, min, next))
      }
      continue
    }
    // All fields matched. Convert synth back to real UTC.
    return synthToReal(t, zone)
  }
  return null
}

export function nextFires(
  spec: CronSpec,
  count: number,
  after: Date = new Date(),
  tz?: string,
): Date[] {
  const out: Date[] = []
  let cursor = after
  for (let i = 0; i < count; i++) {
    const next = nextFire(spec, cursor, tz)
    if (!next) break
    out.push(next)
    cursor = next
  }
  return out
}

// ---------- describe ----------

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTH_LABELS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
]

function sortedValues(f: CronField): number[] {
  return [...f.values].sort((a, b) => a - b)
}

function isFullRange(f: CronField, kind: keyof typeof BOUNDS): boolean {
  if (f.any) return true
  const { min, max } = BOUNDS[kind]
  // dow accepts 0-7 with 7 collapsed to 0, so the full set is 0..6 for dow
  const realMax = kind === 'dow' ? 6 : max
  for (let v = min; v <= realMax; v++) if (!f.values.has(v)) return false
  return true
}

function detectStep(f: CronField, kind: keyof typeof BOUNDS): number | null {
  const vals = sortedValues(f)
  if (vals.length < 2) return null
  const { min, max } = BOUNDS[kind]
  const realMax = kind === 'dow' ? 6 : max
  const step = vals[1] - vals[0]
  if (step < 2) return null
  for (let i = 1; i < vals.length; i++) {
    if (vals[i] - vals[i - 1] !== step) return null
  }
  if (vals[0] !== min) return null
  if (vals[vals.length - 1] + step <= realMax) return null
  return step
}

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd']
  const v = n % 100
  return n + (s[(v - 20) % 10] || s[v] || s[0])
}

function fmtTime(h: number, m: number, s: number): string {
  const hh = h % 12 === 0 ? 12 : h % 12
  const mm = m.toString().padStart(2, '0')
  const ampm = h < 12 ? 'AM' : 'PM'
  if (s === 0) return `${hh}:${mm} ${ampm}`
  return `${hh}:${mm}:${s.toString().padStart(2, '0')} ${ampm}`
}

function listJoin(parts: string[]): string {
  if (parts.length <= 1) return parts.join('')
  if (parts.length === 2) return `${parts[0]} and ${parts[1]}`
  return `${parts.slice(0, -1).join(', ')}, and ${parts[parts.length - 1]}`
}

export function describeCron(spec: CronSpec): string {
  const { seconds: S, minutes: M, hours: H, dom: D, month: MO, dow: W } = spec

  // --- shortcut: "every minute" / "every N minutes" / "every second" ---
  if (
    isFullRange(MO, 'month') &&
    isFullRange(D, 'dom') &&
    isFullRange(W, 'dow') &&
    isFullRange(H, 'hours')
  ) {
    if (isFullRange(M, 'minutes') && isFullRange(S, 'seconds')) {
      return 'Every second'
    }
    if (isFullRange(M, 'minutes') && S.values.size === 1 && S.values.has(0)) {
      return 'Every minute'
    }
    const minStep = detectStep(M, 'minutes')
    if (minStep && S.values.size === 1 && S.values.has(0)) {
      return `Every ${minStep} minutes`
    }
    if (M.values.size === 1 && M.values.has(0) && S.values.size === 1 && S.values.has(0)) {
      return 'Every hour, on the hour'
    }
    const hourStep = detectStep(H, 'hours')
    if (hourStep && M.values.size === 1 && S.values.size === 1) {
      return `Every ${hourStep} hours at :${[...M.values][0].toString().padStart(2, '0')}`
    }
  }

  // --- single fire time per matching day ---
  const singleHour = H.values.size === 1
  const singleMin = M.values.size === 1
  const singleSec = S.values.size === 1
  if (singleHour && singleMin && singleSec) {
    const [h] = [...H.values]
    const [m] = [...M.values]
    const [s] = [...S.values]
    const time = fmtTime(h, m, s)

    // Daily
    if (isFullRange(D, 'dom') && isFullRange(W, 'dow') && isFullRange(MO, 'month')) {
      return `Every day at ${time}`
    }
    // Weekly: dow restricted, dom unrestricted
    if (isFullRange(D, 'dom') && !W.any && isFullRange(MO, 'month')) {
      const days = sortedValues(W).map((d) => DAY_LABELS[d])
      // Special label for weekdays / weekends
      const set = [...W.values].sort().join(',')
      if (set === '1,2,3,4,5') return `Every weekday at ${time}`
      if (set === '0,6') return `Every weekend at ${time}`
      return `Every ${listJoin(days)} at ${time}`
    }
    // Monthly: dom restricted, dow unrestricted
    if (!D.any && isFullRange(W, 'dow') && isFullRange(MO, 'month')) {
      const days = sortedValues(D).map(ordinal)
      return `On the ${listJoin(days)} of every month at ${time}`
    }
    // Specific months
    if (!MO.any && isFullRange(D, 'dom') && isFullRange(W, 'dow')) {
      const months = sortedValues(MO).map((m) => MONTH_LABELS[m - 1])
      return `Every day in ${listJoin(months)} at ${time}`
    }
  }

  // --- fallback structured text ---
  const bits: string[] = []
  if (singleHour && singleMin && singleSec) {
    bits.push(`at ${fmtTime([...H.values][0], [...M.values][0], [...S.values][0])}`)
  } else {
    if (!isFullRange(M, 'minutes')) {
      const step = detectStep(M, 'minutes')
      bits.push(
        step
          ? `every ${step} minutes`
          : `at minute${M.values.size > 1 ? 's' : ''} ${sortedValues(M).join(', ')}`,
      )
    }
    if (!isFullRange(H, 'hours')) {
      bits.push(`hour${H.values.size > 1 ? 's' : ''} ${sortedValues(H).join(', ')}`)
    }
  }
  if (!isFullRange(D, 'dom')) {
    bits.push(`day${D.values.size > 1 ? 's' : ''} ${sortedValues(D).map(ordinal).join(', ')}`)
  }
  if (!isFullRange(W, 'dow')) {
    bits.push(listJoin(sortedValues(W).map((d) => DAY_LABELS[d])))
  }
  if (!isFullRange(MO, 'month')) {
    bits.push(`in ${listJoin(sortedValues(MO).map((m) => MONTH_LABELS[m - 1]))}`)
  }
  return bits.length ? bits.join(', ') : spec.raw
}

// ---------- template builders for the editor UI ----------

export type CronTemplate =
  | { kind: 'every_minutes'; n: number }
  | { kind: 'hourly'; minute: number }
  | { kind: 'daily'; hour: number; minute: number }
  | { kind: 'weekly'; days: number[]; hour: number; minute: number }
  | { kind: 'monthly'; dayOfMonth: number; hour: number; minute: number }
  | { kind: 'custom'; cron: string }

export function buildCron(t: CronTemplate): string {
  switch (t.kind) {
    case 'every_minutes':
      return t.n === 1 ? '* * * * *' : `*/${t.n} * * * *`
    case 'hourly':
      return `${t.minute} * * * *`
    case 'daily':
      return `${t.minute} ${t.hour} * * *`
    case 'weekly': {
      const days = [...t.days].sort((a, b) => a - b).join(',') || '*'
      return `${t.minute} ${t.hour} * * ${days}`
    }
    case 'monthly':
      return `${t.minute} ${t.hour} ${t.dayOfMonth} * *`
    case 'custom':
      return t.cron
  }
}

/** Best-effort reverse: classify a cron string into the simplest template that
 *  generates an equivalent expression. Returns 'custom' for anything else. */
export function detectTemplate(cron: string): CronTemplate {
  let spec: CronSpec
  try {
    spec = parseCron(cron)
  } catch {
    return { kind: 'custom', cron }
  }
  const { seconds: S, minutes: M, hours: H, dom: D, month: MO, dow: W } = spec
  const sec0 = S.values.size === 1 && S.values.has(0)
  const allDom = isFullRange(D, 'dom')
  const allMon = isFullRange(MO, 'month')
  const allDow = isFullRange(W, 'dow')

  if (!sec0) return { kind: 'custom', cron: spec.normalized }

  // every_minutes
  if (allDom && allMon && allDow && isFullRange(H, 'hours')) {
    if (isFullRange(M, 'minutes')) return { kind: 'every_minutes', n: 1 }
    const step = detectStep(M, 'minutes')
    if (step) return { kind: 'every_minutes', n: step }
  }
  // hourly
  if (allDom && allMon && allDow && isFullRange(H, 'hours') && M.values.size === 1) {
    return { kind: 'hourly', minute: [...M.values][0] }
  }
  // daily
  if (allDom && allMon && allDow && H.values.size === 1 && M.values.size === 1) {
    return { kind: 'daily', hour: [...H.values][0], minute: [...M.values][0] }
  }
  // weekly
  if (allDom && allMon && !W.any && H.values.size === 1 && M.values.size === 1) {
    return {
      kind: 'weekly',
      days: sortedValues(W),
      hour: [...H.values][0],
      minute: [...M.values][0],
    }
  }
  // monthly
  if (allMon && allDow && D.values.size === 1 && H.values.size === 1 && M.values.size === 1) {
    return {
      kind: 'monthly',
      dayOfMonth: [...D.values][0],
      hour: [...H.values][0],
      minute: [...M.values][0],
    }
  }
  return { kind: 'custom', cron: spec.normalized }
}
