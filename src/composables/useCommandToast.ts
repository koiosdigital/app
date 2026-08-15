import { getErrorMessage } from '@/lib/api/errors'

/**
 * Feedback for one-shot device commands.
 *
 * The rule this encodes: a transient result — "sent", "cleared", "not
 * delivered" — is a toast, because it describes something that already
 * happened and does not need to stay on screen. Inline alerts are reserved for
 * state that persists, like a list that failed to load. Previously each Nemoto
 * view kept its own `commandMsg` ref plus a four-second timer, which pushed the
 * page's content down and then let it snap back up.
 */
export function useCommandToast() {
  const toast = useToast()

  const ok = (title: string, description?: string) =>
    toast.add({ title, description, color: 'success', icon: 'i-fa6-solid:circle-check' })

  const warn = (title: string, description?: string) =>
    toast.add({ title, description, color: 'warning', icon: 'i-fa6-solid:triangle-exclamation' })

  const fail = (err: unknown, fallback: string) =>
    toast.add({
      title: getErrorMessage(err, fallback),
      color: 'error',
      icon: 'i-fa6-solid:circle-exclamation',
    })

  /**
   * Commands are queued for the device, so "accepted" and "arrived" are
   * different outcomes and the user needs to be told which they got.
   */
  const delivered = (wasDelivered: boolean, successTitle: string) =>
    wasDelivered
      ? ok(successTitle)
      : warn('Device offline', 'The command was not delivered. It will need sending again.')

  return { ok, warn, fail, delivered }
}
