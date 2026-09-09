import { ref, watch } from 'vue'
import type { useTranquilSession } from './useTranquilSession'
import { formatTranquilError } from '@/lib/tranquil/local/errors'
import type {
  QuietHours,
  Schedule,
  ScheduleAction,
  ScheduleItem,
  ScheduleRunResult,
} from '@/lib/tranquil/local/types'

export const emptyQuietHours = (): QuietHours => ({
  windows: [],
  stop_playback: false,
  lights_off: false,
})

/** Client-assigned item id: random, nonzero, 32-bit. The device keeps it. */
export function newScheduleId(): number {
  const buf = new Uint32Array(1)
  crypto.getRandomValues(buf)
  return buf[0] || 1
}

const byTime = (a: ScheduleItem, b: ScheduleItem) => a.time_of_day - b.time_of_day

/**
 * Schedule + quiet hours for the active table, over either transport.
 *
 * The device is the source of truth and the list is replaced as a whole on
 * every change, so each mutation here is optimistic (apply, save, revert on
 * failure). On LAN the PUT answers with the saved list; over the cloud only
 * delivery is confirmed and the device's own echo lands in the cloud cache a
 * moment later, so the list is refetched after a short delay. Any push from
 * the device (another client wrote) bumps `libraryVersion.schedule` and
 * triggers a reload.
 */
export function useTranquilSchedule(session: ReturnType<typeof useTranquilSession>) {
  const { store, isActive, isCloud } = session

  const items = ref<ScheduleItem[]>([])
  const quiet = ref<QuietHours>(emptyQuietHours())
  const quietNow = ref(false)
  const timezone = ref<string | undefined>()
  const loading = ref(false)
  const saving = ref(false)
  const loaded = ref(false)
  const error = ref<string | null>(null)

  let reloadTimer: ReturnType<typeof setTimeout> | null = null

  function apply(s: Schedule) {
    items.value = [...s.items].sort(byTime)
    if (s.quiet_hours) quiet.value = s.quiet_hours
    if (s.quiet_now != null) quietNow.value = s.quiet_now
  }

  async function load(): Promise<void> {
    if (!isActive.value) return
    loading.value = !loaded.value
    error.value = null
    try {
      const api = store.api()
      const [sched, info] = await Promise.all([
        api.schedule.get(),
        api.system.getInfo().catch(() => null),
      ])
      apply(sched)
      if (info) {
        quietNow.value = !!info.quiet_hours_active
        timezone.value = info.timezone || undefined
      }
      loaded.value = true
    } catch (e) {
      error.value = formatTranquilError(e)
    } finally {
      loading.value = false
    }
  }

  function scheduleReload(delayMs: number) {
    if (reloadTimer) clearTimeout(reloadTimer)
    reloadTimer = setTimeout(() => {
      reloadTimer = null
      void load()
    }, delayMs)
  }

  async function persist(next: { items?: ScheduleItem[]; quiet_hours?: QuietHours }): Promise<void> {
    const prevItems = items.value
    const prevQuiet = quiet.value
    if (next.items) items.value = [...next.items].sort(byTime)
    if (next.quiet_hours) quiet.value = next.quiet_hours
    saving.value = true
    try {
      const res = await store.api().schedule.set({ items: items.value, quiet_hours: quiet.value })
      if (isCloud) scheduleReload(1500)
      else apply(res)
    } catch (e) {
      items.value = prevItems
      quiet.value = prevQuiet
      throw e
    } finally {
      saving.value = false
    }
  }

  const upsert = (item: ScheduleItem) =>
    persist({
      items: items.value.some((i) => i.id === item.id)
        ? items.value.map((i) => (i.id === item.id ? item : i))
        : [...items.value, item],
    })

  const remove = (id: number) => persist({ items: items.value.filter((i) => i.id !== id) })

  const setEnabled = (id: number, enabled: boolean) =>
    persist({ items: items.value.map((i) => (i.id === id ? { ...i, enabled } : i)) })

  const saveQuietHours = (q: QuietHours) => persist({ quiet_hours: q })

  const run = (action: ScheduleAction, force: boolean): Promise<ScheduleRunResult> =>
    store.api().schedule.run(action, force)

  watch(
    () => store.libraryVersion.schedule,
    () => {
      if (isActive.value) void load()
    },
  )
  watch(isActive, (active) => {
    if (active) void load()
  })

  return {
    items,
    quiet,
    quietNow,
    timezone,
    loading,
    saving,
    error,
    isCloud,
    load,
    upsert,
    remove,
    setEnabled,
    saveQuietHours,
    run,
  }
}
