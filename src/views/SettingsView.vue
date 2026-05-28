<template>
  <PageLayout :on-refresh="refreshAll">
    <section class="flex flex-col gap-6 px-5 py-6 pb-12">
      <!-- Status banner -->
      <Transition
        enter-active-class="transition-all duration-200 ease-out"
        leave-active-class="transition-all duration-150 ease-in"
        enter-from-class="opacity-0 -translate-y-2"
        enter-to-class="opacity-100 translate-y-0"
        leave-from-class="opacity-100 translate-y-0"
        leave-to-class="opacity-0 -translate-y-2"
      >
        <div v-if="banner" class="rounded-xl border p-4" :class="bannerStyle.container">
          <div class="flex items-center gap-3">
            <UIcon :name="bannerStyle.icon" class="h-5 w-5 shrink-0" :class="bannerStyle.iconColor" />
            <p class="flex-1 text-sm" :class="bannerStyle.textColor">
              {{ banner.message }}
            </p>
            <UButton
              size="xs"
              color="neutral"
              variant="ghost"
              icon="i-fa6-solid:xmark"
              @click="banner = null"
            />
          </div>
        </div>
      </Transition>

      <!-- Identity hero -->
      <div class="flex items-center gap-4">
        <div
          class="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-primary-500/20 text-lg font-semibold text-primary-200"
        >
          {{ initials || '?' }}
        </div>
        <div class="min-w-0 flex-1">
          <p class="truncate text-lg font-semibold">{{ displayName }}</p>
          <p class="truncate text-sm text-white/60">{{ form.email || form.username || '—' }}</p>
        </div>
        <UButton
          v-if="profileLoaded && !editingProfile"
          color="neutral"
          variant="soft"
          icon="i-fa6-solid:pen"
          size="sm"
          class="ml-2 shrink-0"
          @click="openEdit"
        >
          Edit
        </UButton>
      </div>

      <!-- Profile (revealed by the Edit button on the hero) -->
      <UCard v-if="editingProfile" class="bg-white/5">
        <template #header>
          <div>
            <p class="text-xs uppercase tracking-[0.3em] text-white/60">Profile</p>
            <p class="text-lg font-medium">Personal information</p>
          </div>
        </template>

        <div v-if="loadingProfile && !profileLoaded" class="flex justify-center py-8">
          <UIcon name="i-fa6-solid:spinner" class="h-6 w-6 animate-spin text-white/40" />
        </div>
        <div v-else class="flex flex-col gap-4">
          <UFormField label="First name">
            <UInput v-model="form.firstName" class="w-full" />
          </UFormField>
          <UFormField label="Last name">
            <UInput v-model="form.lastName" class="w-full" />
          </UFormField>
          <UFormField label="Email">
            <div class="flex flex-col gap-1">
              <UInput v-model="form.email" type="email" class="w-full" />
              <p v-if="emailVerified === false" class="text-xs text-amber-300">
                Email is not verified.
              </p>
            </div>
          </UFormField>
        </div>

        <template v-if="profileLoaded" #footer>
          <div class="flex flex-wrap justify-end gap-2">
            <UButton
              color="neutral"
              variant="ghost"
              :disabled="savingProfile"
              @click="cancelEdit"
            >
              Cancel
            </UButton>
            <UButton
              color="primary"
              :loading="savingProfile"
              :disabled="!profileDirty"
              icon="i-fa6-solid:floppy-disk"
              @click="saveProfile"
            >
              Save changes
            </UButton>
          </div>
        </template>
      </UCard>

      <!-- Active sessions -->
      <UCard class="bg-white/5">
        <template #header>
          <div class="flex items-center justify-between gap-3">
            <div>
              <p class="text-xs uppercase tracking-[0.3em] text-white/60">Active sessions</p>
              <p class="text-lg font-medium">Where you're signed in</p>
            </div>
            <UButton
              color="neutral"
              variant="ghost"
              icon="i-fa6-solid:arrows-rotate"
              square
              :loading="loadingSessions"
              :aria-label="'Refresh sessions'"
              @click="loadSessions"
            />
          </div>
        </template>

        <div v-if="loadingSessions && !devices.length" class="flex justify-center py-8">
          <UIcon name="i-fa6-solid:spinner" class="h-5 w-5 animate-spin text-white/40" />
        </div>
        <div v-else-if="!devices.length" class="py-2 text-center text-sm text-white/60">
          No active sessions.
        </div>
        <ul v-else class="flex flex-col gap-2">
          <li
            v-for="(device, idx) in devices"
            :key="deviceKey(device, idx)"
            class="rounded-lg border border-white/10 bg-white/5 p-3"
          >
            <div class="flex items-start justify-between gap-3">
              <div class="min-w-0 flex-1">
                <div class="flex items-center gap-2">
                  <UIcon
                    :name="device.mobile ? 'i-fa6-solid:mobile-screen' : 'i-fa6-solid:desktop'"
                    class="h-4 w-4 shrink-0 text-white/60"
                  />
                  <p class="truncate text-sm font-medium">{{ deviceLabel(device) }}</p>
                  <span
                    v-if="device.current"
                    class="rounded-full bg-green-500/20 px-2 py-0.5 text-[10px] uppercase tracking-wider text-green-300"
                  >
                    This device
                  </span>
                </div>
                <p class="mt-0.5 truncate text-xs text-white/60">
                  {{ device.ipAddress || 'Unknown IP' }}
                  <span v-if="device.lastAccess">
                    · Last active {{ formatRelative(device.lastAccess) }}
                  </span>
                </p>
                <p
                  v-if="device.sessions?.length && allClientsForDevice(device)"
                  class="mt-1 truncate text-xs text-white/40"
                >
                  {{ allClientsForDevice(device) }}
                </p>
              </div>
              <UButton
                v-if="!device.current"
                color="error"
                variant="ghost"
                icon="i-fa6-solid:right-from-bracket"
                size="sm"
                :loading="revokingDeviceId === deviceKey(device, idx)"
                @click="revokeDevice(device, deviceKey(device, idx))"
              >
                Revoke
              </UButton>
            </div>
          </li>
        </ul>

        <template v-if="otherDeviceCount > 0" #footer>
          <div class="flex justify-end">
            <UButton
              color="error"
              variant="ghost"
              size="sm"
              icon="i-fa6-solid:right-from-bracket"
              :loading="revokingAll"
              @click="revokeAllOther"
            >
              Sign out other devices ({{ otherDeviceCount }})
            </UButton>
          </div>
        </template>
      </UCard>

      <!-- Sign out of this device -->
      <UButton
        block
        color="neutral"
        variant="soft"
        icon="i-fa6-solid:right-from-bracket"
        @click="handleLogout"
      >
        Sign out
      </UButton>

      <!-- Danger zone — account deletion has to go through Keycloak's
           delete_account required action; no REST endpoint exists for it. -->
      <UCard class="border border-red-500/30 bg-red-500/5">
        <div class="flex items-start justify-between gap-3">
          <div class="min-w-0">
            <p class="text-xs uppercase tracking-[0.3em] text-red-300/80">Danger zone</p>
            <p class="text-base font-medium">Delete account</p>
            <p class="mt-1 text-sm text-white/60">
              Permanently removes your Koios ID and all associated data. This cannot be undone.
            </p>
          </div>
          <UButton
            color="error"
            variant="soft"
            icon="i-fa6-solid:trash"
            size="sm"
            @click="deleteModalOpen = true"
          >
            Delete
          </UButton>
        </div>
      </UCard>

      <!-- About -->
      <div class="mt-2 flex flex-col gap-3 border-t border-white/5 pt-6">
        <p class="text-xs uppercase tracking-[0.3em] text-white/40">About</p>
        <dl class="grid grid-cols-2 gap-y-2 text-sm">
          <dt class="text-white/50">App</dt>
          <dd class="text-right text-white/80">Koios Digital</dd>
          <dt class="text-white/50">Version</dt>
          <dd class="text-right text-white/80">{{ appVersion }}</dd>
          <dt class="text-white/50">Channel</dt>
          <dd class="text-right capitalize text-white/80">{{ appChannel }}</dd>
        </dl>
        <div class="flex flex-wrap gap-2 pt-2">
          <UButton size="sm" variant="ghost" icon="i-fa6-solid:circle-info" @click="openDocs">
            Support
          </UButton>
          <UButton size="sm" variant="ghost" icon="i-fa6-regular:envelope" @click="contactSupport">
            Contact
          </UButton>
        </div>
      </div>
    </section>

    <DangerConfirmModal
      v-model="deleteModalOpen"
      title="Delete your account?"
      :message="`This permanently deletes your Koios ID (${form.username || 'this account'}) and signs you out everywhere. You'll need to confirm in the next screen.`"
      confirm-text="Continue"
      :loading="startingDelete"
      :error="deleteError"
      @confirm="startDeleteAccount"
    />
  </PageLayout>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, reactive, watch } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useHead } from '@unhead/vue'
import { Capacitor } from '@capacitor/core'
import { Browser } from '@capacitor/browser'
import { InAppBrowser } from '@capacitor/inappbrowser'
import PageLayout from '@/layouts/PageLayout.vue'
import DangerConfirmModal from '@/components/DangerConfirmModal.vue'
import { usePageHeader } from '@/composables/usePageHeader'
import { useAuthStore } from '@/stores/auth/auth'
import { ENV } from '@/config/environment'
import {
  keycloakAccountApi,
  type AccountProfile,
  type AccountDevice,
} from '@/lib/auth/keycloakAccount'
import { getErrorMessage } from '@/lib/api/errors'

useHead({
  title: 'Settings | Koios Digital',
  meta: [{ name: 'description', content: 'Manage your Koios account and app settings' }],
})

const router = useRouter()
const route = useRoute()
const authStore = useAuthStore()
const { setHeader } = usePageHeader()

const appVersion = ENV.appVersion
const appChannel = ENV.appChannel

// --- Banner ---
type Banner = { kind: 'success' | 'error' | 'info'; message: string }
const banner = ref<Banner | null>(null)

const BANNER_STYLES: Record<
  Banner['kind'],
  { container: string; icon: string; iconColor: string; textColor: string }
> = {
  success: {
    container: 'border-green-500/30 bg-green-500/10',
    icon: 'i-fa6-solid:circle-check',
    iconColor: 'text-green-400',
    textColor: 'text-green-200',
  },
  error: {
    container: 'border-amber-500/30 bg-amber-500/10',
    icon: 'i-fa6-solid:circle-exclamation',
    iconColor: 'text-amber-400',
    textColor: 'text-amber-200',
  },
  info: {
    container: 'border-sky-500/30 bg-sky-500/10',
    icon: 'i-fa6-solid:envelope-circle-check',
    iconColor: 'text-sky-400',
    textColor: 'text-sky-200',
  },
}

const bannerStyle = computed(() => BANNER_STYLES[banner.value?.kind ?? 'success'])

function showBanner(kind: Banner['kind'], message: string) {
  banner.value = { kind, message }
  // Auto-dismiss success banners after 4s; keep info and error visible until
  // the user dismisses them (info messages typically carry an action item).
  if (kind === 'success') {
    setTimeout(() => {
      if (banner.value?.message === message) banner.value = null
    }, 4000)
  }
}

// --- Profile ---
const loadingProfile = ref(false)
const profileLoaded = ref(false)
const savingProfile = ref(false)
const editingProfile = ref(false)
const emailVerified = ref<boolean | undefined>(undefined)
const form = reactive({ username: '', firstName: '', lastName: '', email: '' })
const originalForm = reactive({ username: '', firstName: '', lastName: '', email: '' })

const profileDirty = computed(
  () =>
    form.firstName !== originalForm.firstName ||
    form.lastName !== originalForm.lastName ||
    form.email !== originalForm.email,
)

const displayName = computed(() => {
  const full = `${form.firstName} ${form.lastName}`.trim()
  return full || form.username || 'Your account'
})

const initials = computed(() => {
  const f = form.firstName.trim()[0]
  const l = form.lastName.trim()[0]
  if (f || l) return `${f ?? ''}${l ?? ''}`.toUpperCase()
  const u = form.username.trim()[0]
  return u ? u.toUpperCase() : ''
})

function applyProfile(profile: AccountProfile) {
  form.username = profile.username ?? ''
  form.firstName = profile.firstName ?? ''
  form.lastName = profile.lastName ?? ''
  form.email = profile.email ?? ''
  emailVerified.value = profile.emailVerified
  Object.assign(originalForm, { ...form })
}

async function loadProfile() {
  loadingProfile.value = true
  try {
    const profile = await keycloakAccountApi.getProfile()
    applyProfile(profile)
    profileLoaded.value = true
  } catch (error) {
    showBanner('error', getErrorMessage(error, 'Failed to load profile'))
  } finally {
    loadingProfile.value = false
  }
}

function openEdit() {
  // Snapshot the latest server-confirmed values before letting the user
  // type, so Cancel restores cleanly.
  Object.assign(originalForm, { ...form })
  editingProfile.value = true
}

function cancelEdit() {
  Object.assign(form, originalForm)
  editingProfile.value = false
}

async function saveProfile() {
  if (savingProfile.value) return
  const emailChanged =
    form.email.trim().toLowerCase() !== originalForm.email.trim().toLowerCase()

  savingProfile.value = true
  try {
    await keycloakAccountApi.updateProfile({
      firstName: form.firstName,
      lastName: form.lastName,
      email: form.email,
    })
    Object.assign(originalForm, { ...form })
    editingProfile.value = false
    if (emailChanged) {
      showBanner(
        'info',
        `Check ${form.email} to confirm your new email address. Until you confirm, your old address stays active.`,
      )
    } else {
      showBanner('success', 'Profile updated.')
    }
    // Refresh to pick up server-normalised values (e.g. emailVerified flip
    // after an email change).
    await loadProfile()
  } catch (error) {
    showBanner('error', getErrorMessage(error, 'Failed to update profile'))
  } finally {
    savingProfile.value = false
  }
}

// --- Devices / sessions ---
// Keycloak aggregates user sessions per physical device under /sessions/devices.
// Each device may contain multiple sessions (e.g. multiple browser tabs or an
// online + offline session pair from offline_access).
const devices = ref<AccountDevice[]>([])
const loadingSessions = ref(false)
const revokingDeviceId = ref<string | null>(null)
const revokingAll = ref(false)

const otherDeviceCount = computed(() => devices.value.filter((d) => !d.current).length)

function deviceKey(device: AccountDevice, index: number): string {
  return device.id || device.sessions[0]?.id || `device-${index}`
}

function deviceLabel(device: AccountDevice): string {
  const parts: string[] = []
  if (device.browser) parts.push(device.browser)
  const os = device.os
    ? `${device.os}${device.osVersion && device.osVersion !== 'Unknown' ? ' ' + device.osVersion : ''}`
    : ''
  if (os) parts.push(os)
  return parts.join(' · ') || device.device || 'Unknown device'
}

function allClientsForDevice(device: AccountDevice): string {
  const names = new Set<string>()
  for (const s of device.sessions ?? []) {
    for (const c of s.clients ?? []) {
      const name = c.clientName || c.clientId
      if (name) names.add(name)
    }
  }
  return [...names].join(', ')
}

async function loadSessions() {
  loadingSessions.value = true
  try {
    devices.value = await keycloakAccountApi.listDevices()
  } catch (error) {
    showBanner('error', getErrorMessage(error, 'Failed to load sessions'))
  } finally {
    loadingSessions.value = false
  }
}

async function revokeDevice(device: AccountDevice, key: string) {
  revokingDeviceId.value = key
  try {
    // Sign out every session associated with this device — Keycloak doesn't
    // expose a per-device delete, only per-session.
    await Promise.all(device.sessions.map((s) => keycloakAccountApi.revokeSession(s.id)))
    devices.value = devices.value.filter((d) => d !== device)
    showBanner('success', 'Device signed out.')
  } catch (error) {
    showBanner('error', getErrorMessage(error, 'Failed to revoke device'))
  } finally {
    revokingDeviceId.value = null
  }
}

async function revokeAllOther() {
  revokingAll.value = true
  try {
    await keycloakAccountApi.revokeAllOtherSessions()
    devices.value = devices.value.filter((d) => d.current)
    showBanner('success', 'Other devices signed out.')
  } catch (error) {
    showBanner('error', getErrorMessage(error, 'Failed to revoke sessions'))
  } finally {
    revokingAll.value = false
  }
}

// --- Sign out / about ---
async function handleLogout() {
  // Local tokens are cleared even if the remote backchannel logout fails, so
  // always route to /login regardless of outcome.
  try {
    await authStore.logout()
  } catch (error) {
    console.warn('Logout reported an error', error)
  } finally {
    router.replace('/login')
  }
}

function openDocs() {
  InAppBrowser.openInExternalBrowser({ url: ENV.supportUrl })
}

function contactSupport() {
  window.location.href = `mailto:${ENV.supportEmail}`
}

// --- Delete account (kc_action flow) ---
const deleteModalOpen = ref(false)
const startingDelete = ref(false)
const deleteError = ref<string | undefined>()

function generateRandomString(length: number): string {
  const array = new Uint8Array(length)
  crypto.getRandomValues(array)
  return Array.from(array, (b) => b.toString(16).padStart(2, '0')).join('')
}

async function generatePKCE(): Promise<{ verifier: string; challenge: string }> {
  const verifier = generateRandomString(32)
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))
  const challenge = btoa(String.fromCharCode(...new Uint8Array(hash)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
  return { verifier, challenge }
}

async function startDeleteAccount() {
  if (startingDelete.value) return
  deleteError.value = undefined
  const idToken = authStore.getIdToken()?.trim()
  if (!idToken || idToken === 'undefined' || idToken === 'null') {
    deleteError.value = 'Please sign out and sign back in, then try again.'
    return
  }

  startingDelete.value = true
  try {
    const { oauth } = ENV
    // Match the login OAuth flow: custom scheme on native (registered with
    // ASWebAuthenticationSession and Keycloak), universal link on web.
    const redirectUri = Capacitor.isNativePlatform()
      ? oauth.nativeRedirectUrl
      : `${window.location.origin}${oauth.redirectPath}`

    const pkce = await generatePKCE()
    const state = generateRandomString(16)
    sessionStorage.setItem('oidc_pkce_verifier', pkce.verifier)
    sessionStorage.setItem('oidc_state', state)

    const authUrl = new URL(`${oauth.authority}/protocol/openid-connect/auth`)
    authUrl.searchParams.set('client_id', oauth.clientId)
    authUrl.searchParams.set('redirect_uri', redirectUri)
    authUrl.searchParams.set('response_type', 'code')
    authUrl.searchParams.set('scope', oauth.scope)
    authUrl.searchParams.set('state', state)
    authUrl.searchParams.set('code_challenge', pkce.challenge)
    authUrl.searchParams.set('code_challenge_method', 'S256')
    authUrl.searchParams.set('kc_action', 'delete_account')
    authUrl.searchParams.set('id_token_hint', idToken)

    // Open the browser FIRST — only close the confirm modal once the launch
    // succeeded, otherwise an error from Browser.open would be invisible.
    if (Capacitor.isNativePlatform()) {
      await Browser.open({ url: authUrl.toString() })
      deleteModalOpen.value = false
    } else {
      // Top-level redirect — page is unloading, no need to close the modal.
      window.location.href = authUrl.toString()
    }
  } catch (error) {
    deleteError.value = error instanceof Error ? error.message : 'Failed to start delete flow'
  } finally {
    startingDelete.value = false
  }
}

/**
 * Consume kc_action result whenever the route query changes. The watcher
 * (not onMounted) covers the common native case where the user returns to
 * an already-mounted SettingsView via the appUrlOpen → router.replace path.
 */
async function consumeDeleteResult() {
  const action = route.query.kc_action
  const status = route.query.kc_action_status
  if (action !== 'delete_account' || typeof status !== 'string') return

  // Drop the query params so a refresh doesn't re-trigger.
  await router.replace({ path: '/settings', query: {} })

  // Dismiss the confirm modal regardless of outcome.
  deleteModalOpen.value = false
  deleteError.value = undefined

  if (status === 'success') {
    showBanner('success', 'Your account has been deleted.')
    try {
      await authStore.logout()
    } catch (error) {
      console.warn('Logout after account deletion failed', error)
    } finally {
      router.replace('/login')
    }
  } else {
    showBanner('error', 'Account deletion was cancelled.')
  }
}

watch(
  () => [route.query.kc_action, route.query.kc_action_status] as const,
  () => consumeDeleteResult(),
)

// --- Refresh-all (pull-to-refresh) ---
async function refreshAll() {
  await Promise.all([loadProfile(), loadSessions()])
}

// --- Util ---
function formatRelative(epochSeconds: number): string {
  const now = Date.now()
  const then = epochSeconds * 1000
  const diff = Math.max(0, now - then)
  const minutes = Math.floor(diff / 60_000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 30) return `${days}d ago`
  return new Date(then).toLocaleDateString()
}

onMounted(() => {
  setHeader({ title: 'Settings', backRoute: '/' })
  consumeDeleteResult()
  loadProfile()
  loadSessions()
})
</script>
