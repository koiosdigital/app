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
            <UIcon
              :name="bannerStyle.icon"
              class="h-5 w-5 shrink-0"
              :class="bannerStyle.iconColor"
            />
            <p class="flex-1 text-sm" :class="bannerStyle.textColor">{{ banner.message }}</p>
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
          <p class="truncate text-sm text-white/60">{{ form.email || '—' }}</p>
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

      <div v-if="loadingProfile && !profileLoaded" class="flex justify-center py-8">
        <UIcon name="i-fa6-solid:spinner" class="h-6 w-6 animate-spin text-white/40" />
      </div>

      <template v-else-if="profileLoaded">
        <!-- Profile (name) -->
        <UCard v-if="editingProfile" class="bg-white/5">
          <template #header>
            <div>
              <p class="text-xs uppercase tracking-[0.3em] text-white/60">Profile</p>
              <p class="text-lg font-medium">Personal information</p>
            </div>
          </template>

          <div class="flex flex-col gap-4">
            <UFormField label="First name">
              <UInput v-model="form.firstName" class="w-full" />
            </UFormField>
            <UFormField label="Last name">
              <UInput v-model="form.lastName" class="w-full" />
            </UFormField>
          </div>

          <template #footer>
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

        <!-- Account settings -->
        <UCollapsible v-model:open="accountSettingsOpen">
          <button
            type="button"
            class="flex w-full items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/5 p-4 text-left"
          >
            <div class="flex items-center gap-3">
              <UIcon name="i-fa6-solid:user-gear" class="h-4 w-4 text-white/60" />
              <div>
                <p class="text-base font-medium">Account settings</p>
                <p class="text-xs text-white/50">Email, password, two-factor & sessions</p>
              </div>
            </div>
            <UIcon
              name="i-fa6-solid:chevron-down"
              class="h-4 w-4 shrink-0 text-white/40 transition-transform duration-200"
              :class="{ 'rotate-180': accountSettingsOpen }"
            />
          </button>

          <template #content>
            <div class="flex flex-col gap-6 pt-6">
              <!-- Email -->
              <UCard class="bg-white/5">
                <template #header>
                  <div>
                    <p class="text-xs uppercase tracking-[0.3em] text-white/60">Account</p>
                    <p class="text-lg font-medium">Email address</p>
                  </div>
                </template>

                <div class="flex flex-col gap-3">
                  <div class="flex items-center justify-between gap-3">
                    <div class="min-w-0">
                      <p class="truncate text-sm font-medium">{{ form.email }}</p>
                      <p class="mt-0.5 flex items-center gap-1.5 text-xs">
                        <template v-if="emailVerified">
                          <UIcon
                            name="i-fa6-solid:circle-check"
                            class="h-3.5 w-3.5 text-green-400"
                          />
                          <span class="text-green-300">Verified</span>
                        </template>
                        <template v-else>
                          <UIcon
                            name="i-fa6-solid:circle-exclamation"
                            class="h-3.5 w-3.5 text-amber-400"
                          />
                          <span class="text-amber-300">Not verified</span>
                        </template>
                      </p>
                    </div>
                    <UButton
                      color="neutral"
                      variant="soft"
                      size="sm"
                      icon="i-fa6-solid:pen"
                      @click="openEmailModal"
                    >
                      Change
                    </UButton>
                  </div>
                  <UButton
                    v-if="!emailVerified"
                    color="primary"
                    variant="ghost"
                    size="sm"
                    icon="i-fa6-regular:envelope"
                    :loading="resendingVerification"
                    class="self-start"
                    @click="resendVerification"
                  >
                    Resend verification email
                  </UButton>
                </div>
              </UCard>

              <!-- Password -->
              <UCard v-if="hasPassword" class="bg-white/5">
                <template #header>
                  <div>
                    <p class="text-xs uppercase tracking-[0.3em] text-white/60">Security</p>
                    <p class="text-lg font-medium">Password</p>
                  </div>
                </template>

                <div class="flex flex-col gap-4">
                  <UFormField label="Current password">
                    <UInput v-model="passwordForm.current" type="password" class="w-full" />
                  </UFormField>
                  <UFormField
                    label="New password"
                    hint="At least 10 characters, with upper & lowercase and a number"
                  >
                    <UInput v-model="passwordForm.next" type="password" class="w-full" />
                  </UFormField>
                  <UFormField label="Confirm new password">
                    <UInput v-model="passwordForm.confirm" type="password" class="w-full" />
                  </UFormField>
                </div>

                <template #footer>
                  <div class="flex justify-end">
                    <UButton
                      color="primary"
                      :loading="savingPassword"
                      :disabled="!passwordValid"
                      icon="i-fa6-solid:lock"
                      @click="savePassword"
                    >
                      Update password
                    </UButton>
                  </div>
                </template>
              </UCard>

              <!-- Two-factor -->
              <TwoFactorSection
                ref="twoFactorRef"
                :is-federated="isFederated"
                @notify="showBanner"
                @changed="loadProfile"
              />

              <!-- Active sessions -->
              <UCard class="bg-white/5">
                <template #header>
                  <div class="flex items-center justify-between gap-3">
                    <div>
                      <p class="text-xs uppercase tracking-[0.3em] text-white/60">
                        Active sessions
                      </p>
                      <p class="text-lg font-medium">Where you're signed in</p>
                    </div>
                    <UButton
                      color="neutral"
                      variant="ghost"
                      icon="i-fa6-solid:arrows-rotate"
                      square
                      :loading="loadingSessions"
                      aria-label="Refresh sessions"
                      @click="loadSessions"
                    />
                  </div>
                </template>

                <div v-if="loadingSessions && !sessions.length" class="flex justify-center py-8">
                  <UIcon name="i-fa6-solid:spinner" class="h-5 w-5 animate-spin text-white/40" />
                </div>
                <div v-else-if="!sessions.length" class="py-2 text-center text-sm text-white/60">
                  No active browser sessions.
                </div>
                <ul v-else class="flex flex-col gap-2">
                  <li
                    v-for="session in sessions"
                    :key="session.id"
                    class="rounded-lg border border-white/10 bg-white/5 p-3"
                  >
                    <div class="flex items-start justify-between gap-3">
                      <div class="min-w-0 flex-1">
                        <div class="flex items-center gap-2">
                          <UIcon
                            :name="sessionIcon(session)"
                            class="h-4 w-4 shrink-0 text-white/60"
                          />
                          <p class="truncate text-sm font-medium">{{ sessionLabel(session) }}</p>
                          <span
                            v-if="session.current"
                            class="rounded-full bg-green-500/20 px-2 py-0.5 text-[10px] uppercase tracking-wider text-green-300"
                          >
                            This device
                          </span>
                        </div>
                        <p class="mt-0.5 truncate text-xs text-white/60">
                          <span v-if="session.ipAddress && session.ipAddress !== 'unknown'">
                            {{ session.ipAddress }} ·
                          </span>
                          Last active {{ formatRelativeMs(session.lastActivityAt) }}
                        </p>
                      </div>
                      <UButton
                        v-if="!session.current"
                        color="error"
                        variant="ghost"
                        icon="i-fa6-solid:right-from-bracket"
                        size="sm"
                        :loading="revokingSessionId === session.id"
                        @click="revokeSession(session)"
                      >
                        Revoke
                      </UButton>
                    </div>
                  </li>
                </ul>

                <template v-if="otherSessionCount > 0" #footer>
                  <div class="flex justify-end">
                    <UButton
                      color="error"
                      variant="ghost"
                      size="sm"
                      icon="i-fa6-solid:right-from-bracket"
                      :loading="revokingAll"
                      @click="revokeOtherSessions"
                    >
                      Sign out other sessions ({{ otherSessionCount }})
                    </UButton>
                  </div>
                </template>
              </UCard>
            </div>
          </template>
        </UCollapsible>
      </template>

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
          <template v-if="isNative">
            <dt class="text-white/50">Current bundle</dt>
            <dd class="break-all text-right font-mono text-xs/5 text-white/80">
              {{ currentBundleId ?? 'Built-in' }}
            </dd>
            <dt class="text-white/50">Pending bundle</dt>
            <dd class="break-all text-right font-mono text-xs/5 text-white/80">
              {{ nextBundleId ?? '—' }}
            </dd>
            <dt class="text-white/50">Update channel</dt>
            <dd class="text-right text-white/80">{{ updateChannel ?? 'production' }}</dd>
            <dt class="text-white/50">Device ID</dt>
            <dd class="flex min-w-0 items-center justify-end gap-1 text-white/80">
              <span class="truncate font-mono text-xs">{{ updateDeviceId ?? '—' }}</span>
              <UButton
                v-if="updateDeviceId"
                size="xs"
                color="neutral"
                variant="ghost"
                icon="i-fa6-regular:copy"
                square
                aria-label="Copy device ID"
                @click="copyDeviceId"
              />
            </dd>
          </template>
        </dl>
        <div v-if="isNative" class="flex flex-wrap items-center gap-2">
          <UButton
            size="sm"
            color="neutral"
            variant="soft"
            icon="i-fa6-solid:arrows-rotate"
            :loading="checkingUpdate"
            @click="checkForUpdates"
          >
            Check for updates
          </UButton>
          <UButton
            v-if="pendingBundleId"
            size="sm"
            color="primary"
            variant="soft"
            icon="i-fa6-solid:rotate-left"
            :loading="reloadingUpdate"
            @click="reloadNow"
          >
            Reload to apply
          </UButton>
        </div>
        <p v-if="pendingBundleId" class="text-xs text-white/50">
          Update <span class="font-mono">{{ pendingBundleId }}</span> downloaded. It applies on the
          next app launch, or reload now.
        </p>
        <div class="flex flex-wrap gap-2 pt-2">
          <UButton size="sm" variant="ghost" icon="i-fa6-solid:circle-info" @click="openDocs">
            Support
          </UButton>
          <UButton size="sm" variant="ghost" icon="i-fa6-regular:envelope" @click="contactSupport">
            Contact
          </UButton>
        </div>
      </div>

      <!-- Danger zone — deactivates (soft, reversible) the Koios account -->
      <UCard v-if="profileLoaded" class="border border-red-500/30 bg-red-500/5">
        <div class="flex items-start justify-between gap-3">
          <div class="min-w-0">
            <p class="text-xs uppercase tracking-[0.3em] text-red-300/80">Danger zone</p>
            <p class="text-base font-medium">Deactivate account</p>
            <p class="mt-1 text-sm text-white/60">
              Signs you out everywhere and disables your Koios ID. Contact support to reactivate.
            </p>
          </div>
          <UButton
            color="error"
            variant="soft"
            icon="i-fa6-solid:user-slash"
            size="sm"
            @click="openDeactivate"
          >
            Deactivate
          </UButton>
        </div>
      </UCard>
    </section>

    <!-- Change email modal -->
    <UModal v-model:open="emailModalOpen">
      <template #header>
        <div class="flex items-center gap-3">
          <UIcon name="i-fa6-regular:envelope" class="h-5 w-5 text-primary-300" />
          <h3 class="text-lg font-semibold">Change email</h3>
        </div>
      </template>
      <template #body>
        <div class="space-y-4">
          <UAlert
            v-if="emailError"
            color="error"
            icon="i-fa6-solid:circle-exclamation"
            :title="emailError"
          />
          <UFormField label="New email address">
            <UInput v-model="emailForm.email" type="email" class="w-full" autofocus />
          </UFormField>
          <UFormField v-if="hasPassword" label="Current password">
            <UInput v-model="emailForm.password" type="password" class="w-full" />
          </UFormField>
          <p class="text-xs text-white/50">
            We'll send a verification link to the new address. Your current address stays active
            until it's confirmed.
          </p>
        </div>
      </template>
      <template #footer>
        <div class="flex justify-end gap-3">
          <UButton
            color="neutral"
            variant="ghost"
            :disabled="savingEmail"
            @click="emailModalOpen = false"
          >
            Cancel
          </UButton>
          <UButton
            color="primary"
            :loading="savingEmail"
            :disabled="!emailFormValid"
            @click="saveEmail"
          >
            Update email
          </UButton>
        </div>
      </template>
    </UModal>

    <!-- Deactivate modal -->
    <UModal v-model:open="deactivateOpen">
      <template #header>
        <div class="flex items-center gap-3">
          <UIcon name="i-fa6-solid:triangle-exclamation" class="h-5 w-5 text-red-400" />
          <h3 class="text-lg font-semibold">Deactivate your account?</h3>
        </div>
      </template>
      <template #body>
        <div class="space-y-4">
          <UAlert
            v-if="deactivateError"
            color="error"
            icon="i-fa6-solid:circle-exclamation"
            :title="deactivateError"
          />
          <p class="text-sm text-white/70">
            This signs you out on every device and disables your Koios ID ({{ form.email }}). You'll
            need to contact support to reactivate it.
          </p>
          <UFormField v-if="hasPassword" label="Confirm your password">
            <UInput v-model="deactivatePassword" type="password" class="w-full" autofocus />
          </UFormField>
        </div>
      </template>
      <template #footer>
        <div class="flex justify-end gap-3">
          <UButton
            color="neutral"
            variant="ghost"
            :disabled="deactivating"
            @click="deactivateOpen = false"
          >
            Cancel
          </UButton>
          <UButton
            color="error"
            :loading="deactivating"
            :disabled="hasPassword && !deactivatePassword"
            @click="confirmDeactivate"
          >
            Deactivate
          </UButton>
        </div>
      </template>
    </UModal>
  </PageLayout>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, reactive, useTemplateRef } from 'vue'
import { useRouter } from 'vue-router'
import { useHead } from '@unhead/vue'
import { Capacitor } from '@capacitor/core'
import { App as CapacitorApp } from '@capacitor/app'
import { LiveUpdate } from '@capawesome/capacitor-live-update'
import { InAppBrowser } from '@capacitor/inappbrowser'
import PageLayout from '@/layouts/PageLayout.vue'
import TwoFactorSection from '@/components/account/TwoFactorSection.vue'
import { usePageHeader } from '@/composables/usePageHeader'
import { useAuthStore } from '@/stores/auth/auth'
import { ENV } from '@/config/environment'
import { koiosAccountApi, type AccountSession } from '@/lib/auth/koiosAccount'
import { getErrorMessage } from '@/lib/api/errors'

useHead({
  title: 'Settings | Koios Digital',
  meta: [{ name: 'description', content: 'Manage your Koios account and app settings' }],
})

const router = useRouter()
const authStore = useAuthStore()
const { setHeader } = usePageHeader()

const isNative = Capacitor.isNativePlatform()

// On native the installed binary is the source of truth for the version; the
// ENV constant is only the web fallback (see loadNativeBuildInfo).
const appVersion = ref<string>(ENV.appVersion)
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

// --- Account settings disclosure ---
const accountSettingsOpen = ref(false)

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
const emailVerified = ref(false)
const hasPassword = ref(false)
const isFederated = ref(false)
const form = reactive({ firstName: '', lastName: '', email: '' })
const originalForm = reactive({ firstName: '', lastName: '' })

const profileDirty = computed(
  () => form.firstName !== originalForm.firstName || form.lastName !== originalForm.lastName,
)

const displayName = computed(() => {
  const full = `${form.firstName} ${form.lastName}`.trim()
  return full || 'Your account'
})

const initials = computed(() => {
  const f = form.firstName.trim()[0]
  const l = form.lastName.trim()[0]
  if (f || l) return `${f ?? ''}${l ?? ''}`.toUpperCase()
  const e = form.email.trim()[0]
  return e ? e.toUpperCase() : ''
})

async function loadProfile() {
  loadingProfile.value = true
  try {
    const { user } = await koiosAccountApi.getMe()
    form.firstName = user.firstName ?? ''
    form.lastName = user.lastName ?? ''
    form.email = user.email ?? ''
    emailVerified.value = user.emailVerified
    hasPassword.value = user.hasPassword
    isFederated.value = user.isFederated
    Object.assign(originalForm, { firstName: form.firstName, lastName: form.lastName })
    profileLoaded.value = true
  } catch (error) {
    showBanner('error', getErrorMessage(error, 'Failed to load account'))
  } finally {
    loadingProfile.value = false
  }
}

function openEdit() {
  Object.assign(originalForm, { firstName: form.firstName, lastName: form.lastName })
  editingProfile.value = true
}

function cancelEdit() {
  Object.assign(form, originalForm)
  editingProfile.value = false
}

async function saveProfile() {
  if (savingProfile.value) return
  savingProfile.value = true
  try {
    await koiosAccountApi.updateProfile({ firstName: form.firstName, lastName: form.lastName })
    Object.assign(originalForm, { firstName: form.firstName, lastName: form.lastName })
    editingProfile.value = false
    showBanner('success', 'Profile updated.')
  } catch (error) {
    showBanner('error', getErrorMessage(error, 'Failed to update profile'))
  } finally {
    savingProfile.value = false
  }
}

// --- Email ---
const emailModalOpen = ref(false)
const savingEmail = ref(false)
const emailError = ref('')
const emailForm = reactive({ email: '', password: '' })
const resendingVerification = ref(false)

const emailFormValid = computed(() => {
  const emailOk = /.+@.+\..+/.test(emailForm.email.trim())
  return emailOk && (!hasPassword.value || emailForm.password.length > 0)
})

function openEmailModal() {
  emailForm.email = ''
  emailForm.password = ''
  emailError.value = ''
  emailModalOpen.value = true
}

async function saveEmail() {
  if (savingEmail.value) return
  emailError.value = ''
  savingEmail.value = true
  try {
    await koiosAccountApi.changeEmail({
      email: emailForm.email.trim(),
      currentPassword: hasPassword.value ? emailForm.password : undefined,
    })
    emailModalOpen.value = false
    showBanner('info', `Check ${emailForm.email.trim()} to verify your new address.`)
    await loadProfile()
  } catch (error) {
    emailError.value = getErrorMessage(error, 'Failed to change email')
  } finally {
    savingEmail.value = false
  }
}

async function resendVerification() {
  resendingVerification.value = true
  try {
    await koiosAccountApi.resendVerification()
    showBanner('info', `Verification email sent to ${form.email}.`)
  } catch (error) {
    showBanner('error', getErrorMessage(error, 'Failed to resend verification'))
  } finally {
    resendingVerification.value = false
  }
}

// --- Password ---
const savingPassword = ref(false)
const passwordForm = reactive({ current: '', next: '', confirm: '' })

const passwordValid = computed(() => {
  const p = passwordForm.next
  const strong = p.length >= 10 && /[a-z]/.test(p) && /[A-Z]/.test(p) && /[0-9]/.test(p)
  return !!passwordForm.current && strong && passwordForm.next === passwordForm.confirm
})

async function savePassword() {
  if (savingPassword.value || !passwordValid.value) return
  savingPassword.value = true
  try {
    await koiosAccountApi.changePassword({
      currentPassword: passwordForm.current,
      newPassword: passwordForm.next,
    })
    passwordForm.current = ''
    passwordForm.next = ''
    passwordForm.confirm = ''
    showBanner('success', 'Password updated.')
  } catch (error) {
    showBanner('error', getErrorMessage(error, 'Failed to update password'))
  } finally {
    savingPassword.value = false
  }
}

// --- Two-factor (child component) ---
const twoFactorRef = useTemplateRef<{ reload: () => Promise<void> }>('twoFactorRef')

// --- Sessions ---
const sessions = ref<AccountSession[]>([])
const loadingSessions = ref(false)
const revokingSessionId = ref<string | null>(null)
const revokingAll = ref(false)

const otherSessionCount = computed(() => sessions.value.filter((s) => !s.current).length)

async function loadSessions() {
  loadingSessions.value = true
  try {
    const { sessions: list } = await koiosAccountApi.listSessions()
    sessions.value = list
  } catch (error) {
    showBanner('error', getErrorMessage(error, 'Failed to load sessions'))
  } finally {
    loadingSessions.value = false
  }
}

async function revokeSession(session: AccountSession) {
  revokingSessionId.value = session.id
  try {
    const { revokedCurrent } = await koiosAccountApi.revokeSession(session.id)
    sessions.value = sessions.value.filter((s) => s.id !== session.id)
    if (revokedCurrent) {
      await handleLogout()
      return
    }
    showBanner('success', 'Session signed out.')
  } catch (error) {
    showBanner('error', getErrorMessage(error, 'Failed to revoke session'))
  } finally {
    revokingSessionId.value = null
  }
}

async function revokeOtherSessions() {
  revokingAll.value = true
  try {
    await koiosAccountApi.revokeOtherSessions()
    sessions.value = sessions.value.filter((s) => s.current)
    showBanner('success', 'Other sessions signed out.')
  } catch (error) {
    showBanner('error', getErrorMessage(error, 'Failed to revoke sessions'))
  } finally {
    revokingAll.value = false
  }
}

function sessionIcon(session: AccountSession): string {
  const ua = session.userAgent?.toLowerCase() ?? ''
  const mobile = /iphone|android|ipad|mobile/.test(ua)
  return mobile ? 'i-fa6-solid:mobile-screen' : 'i-fa6-solid:desktop'
}

function sessionLabel(session: AccountSession): string {
  const ua = session.userAgent ?? ''
  if (!ua || ua === 'unknown') return 'Unknown device'
  const browser = /edg/i.test(ua)
    ? 'Edge'
    : /chrome|crios/i.test(ua)
      ? 'Chrome'
      : /firefox|fxios/i.test(ua)
        ? 'Firefox'
        : /safari/i.test(ua)
          ? 'Safari'
          : null
  const os = /iphone|ipad|ios/i.test(ua)
    ? 'iOS'
    : /android/i.test(ua)
      ? 'Android'
      : /mac os x|macintosh/i.test(ua)
        ? 'macOS'
        : /windows/i.test(ua)
          ? 'Windows'
          : /linux/i.test(ua)
            ? 'Linux'
            : null
  return [browser, os].filter(Boolean).join(' · ') || 'Web session'
}

// --- Deactivate account ---
const deactivateOpen = ref(false)
const deactivating = ref(false)
const deactivateError = ref('')
const deactivatePassword = ref('')

function openDeactivate() {
  deactivatePassword.value = ''
  deactivateError.value = ''
  deactivateOpen.value = true
}

async function confirmDeactivate() {
  if (deactivating.value) return
  deactivateError.value = ''
  deactivating.value = true
  try {
    await koiosAccountApi.deactivate(hasPassword.value ? deactivatePassword.value : undefined)
    deactivateOpen.value = false
    await handleLogout()
  } catch (error) {
    deactivateError.value = getErrorMessage(error, 'Failed to deactivate account')
  } finally {
    deactivating.value = false
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

// --- Live update (OTA, native only) ---
const currentBundleId = ref<string | null>(null)
const nextBundleId = ref<string | null>(null)
const updateChannel = ref<string | null>(null)
const updateDeviceId = ref<string | null>(null)
const pendingBundleId = ref<string | null>(null)
const checkingUpdate = ref(false)
const reloadingUpdate = ref(false)

async function loadNativeBuildInfo() {
  try {
    const info = await CapacitorApp.getInfo()
    appVersion.value = `${info.version} (${info.build})`
  } catch (error) {
    console.warn('Failed to read native app info', error)
  }
}

async function loadUpdateInfo() {
  try {
    const [cur, next, ch, dev] = await Promise.all([
      LiveUpdate.getCurrentBundle(),
      LiveUpdate.getNextBundle(),
      LiveUpdate.getChannel(),
      LiveUpdate.getDeviceId(),
    ])
    currentBundleId.value = cur.bundleId
    nextBundleId.value = next.bundleId
    updateChannel.value = ch.channel
    updateDeviceId.value = dev.deviceId
    // The background auto-sync may already have staged a bundle before this
    // view opened — offer "Reload to apply" for it, not just manual syncs.
    if (next.bundleId && next.bundleId !== cur.bundleId) {
      pendingBundleId.value = next.bundleId
    }
  } catch (error) {
    console.warn('Failed to load live-update info', error)
  }
}

async function checkForUpdates() {
  checkingUpdate.value = true
  try {
    const { nextBundleId: next } = await LiveUpdate.sync()
    if (next) {
      pendingBundleId.value = next
      nextBundleId.value = next
      showBanner('success', 'Update downloaded.')
    } else {
      showBanner('success', 'Already up to date.')
    }
  } catch (error) {
    console.warn('Live-update sync failed', error)
    showBanner('error', 'Update check failed.')
  } finally {
    checkingUpdate.value = false
  }
}

async function reloadNow() {
  reloadingUpdate.value = true
  try {
    // Applies the pending bundle by reloading the web view; on success the
    // page is replaced, so we only clear the spinner on failure.
    await LiveUpdate.reload()
  } catch (error) {
    console.warn('Live-update reload failed', error)
    showBanner('error', 'Could not reload.')
    reloadingUpdate.value = false
  }
}

async function copyDeviceId() {
  if (!updateDeviceId.value) return
  try {
    await navigator.clipboard.writeText(updateDeviceId.value)
    showBanner('success', 'Device ID copied.')
  } catch {
    showBanner('error', 'Could not copy.')
  }
}

// --- Refresh-all (pull-to-refresh) ---
async function refreshAll() {
  await Promise.all([loadProfile(), loadSessions(), twoFactorRef.value?.reload()])
}

// --- Util ---
function formatRelativeMs(epochMs: number): string {
  const diff = Math.max(0, Date.now() - epochMs)
  const minutes = Math.floor(diff / 60_000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 30) return `${days}d ago`
  return new Date(epochMs).toLocaleDateString()
}

onMounted(() => {
  setHeader({ title: 'Settings', backRoute: '/' })
  loadProfile()
  loadSessions()
  if (isNative) {
    loadNativeBuildInfo()
    loadUpdateInfo()
  }
})
</script>
