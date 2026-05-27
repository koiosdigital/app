<template>
  <PageLayout>
    <section class="flex flex-col gap-6 px-5 py-6">
      <!-- Status banner -->
      <Transition
        enter-active-class="transition-all duration-200 ease-out"
        leave-active-class="transition-all duration-150 ease-in"
        enter-from-class="opacity-0 -translate-y-2"
        enter-to-class="opacity-100 translate-y-0"
        leave-from-class="opacity-100 translate-y-0"
        leave-to-class="opacity-0 -translate-y-2"
      >
        <div
          v-if="banner"
          class="rounded-xl p-4"
          :class="
            banner.kind === 'success'
              ? 'border border-green-500/30 bg-green-500/10'
              : 'border border-amber-500/30 bg-amber-500/10'
          "
        >
          <div class="flex items-center gap-3">
            <UIcon
              :name="
                banner.kind === 'success'
                  ? 'i-fa6-solid:circle-check'
                  : 'i-fa6-solid:circle-exclamation'
              "
              class="h-5 w-5"
              :class="banner.kind === 'success' ? 'text-green-400' : 'text-amber-400'"
            />
            <p
              class="flex-1 text-sm"
              :class="banner.kind === 'success' ? 'text-green-200' : 'text-amber-200'"
            >
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

      <!-- Loading state -->
      <div v-if="loadingProfile" class="flex items-center justify-center py-12">
        <UIcon name="i-fa6-solid:spinner" class="h-8 w-8 animate-spin text-white/40" />
      </div>

      <!-- Profile -->
      <UCard v-else class="bg-white/5">
        <template #header>
          <div>
            <p class="text-xs uppercase tracking-[0.3em] text-white/60">Profile</p>
            <p class="text-lg font-medium">Personal information</p>
          </div>
        </template>

        <div class="flex flex-col gap-4">
          <UFormField label="Username">
            <UInput v-model="form.username" disabled class="w-full" />
          </UFormField>
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

        <template #footer>
          <div class="flex flex-wrap justify-end gap-2">
            <UButton color="neutral" variant="ghost" :disabled="savingProfile" @click="resetForm">
              Reset
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

      <!-- Password -->
      <UCard class="bg-white/5">
        <div class="flex flex-col gap-3">
          <div>
            <p class="text-xs uppercase tracking-[0.3em] text-white/60">Password</p>
            <p class="text-lg font-medium">Change your password</p>
            <p class="mt-1 text-sm text-white/60">
              Opens a secure window to confirm your identity, then returns you here.
            </p>
          </div>
          <UButton
            color="neutral"
            variant="soft"
            icon="i-fa6-solid:key"
            class="self-start"
            @click="changePassword"
          >
            Change password
          </UButton>
        </div>
      </UCard>

      <!-- Sessions -->
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
              @click="loadSessions"
            />
          </div>
        </template>

        <div v-if="loadingSessions && !sessions.length" class="flex justify-center py-8">
          <UIcon name="i-fa6-solid:spinner" class="h-6 w-6 animate-spin text-white/40" />
        </div>
        <div v-else-if="!sessions.length" class="py-4 text-center text-sm text-white/60">
          No active sessions.
        </div>
        <ul v-else class="flex flex-col gap-3">
          <li
            v-for="session in sessions"
            :key="session.id"
            class="rounded-lg border border-white/10 bg-white/5 p-3"
          >
            <div class="flex items-start justify-between gap-3">
              <div class="min-w-0 flex-1">
                <div class="flex items-center gap-2">
                  <p class="truncate text-sm font-medium">
                    {{ session.browser || 'Unknown browser' }}
                  </p>
                  <span
                    v-if="session.current"
                    class="rounded-full bg-green-500/20 px-2 py-0.5 text-[10px] uppercase tracking-wider text-green-300"
                  >
                    This device
                  </span>
                </div>
                <p class="mt-0.5 truncate text-xs text-white/60">
                  {{ session.ipAddress || 'Unknown IP' }}
                  <span v-if="session.lastAccess">
                    · Last active {{ formatRelative(session.lastAccess) }}
                  </span>
                </p>
                <p v-if="session.clients?.length" class="mt-1 truncate text-xs text-white/40">
                  {{ session.clients.map((c) => c.clientName || c.clientId).join(', ') }}
                </p>
              </div>
              <UButton
                v-if="!session.current"
                color="error"
                variant="ghost"
                icon="i-fa6-solid:right-from-bracket"
                size="sm"
                :loading="revokingSessionId === session.id"
                @click="revokeSession(session.id)"
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
              variant="soft"
              icon="i-fa6-solid:right-from-bracket"
              :loading="revokingAll"
              @click="revokeAllOther"
            >
              Sign out other sessions ({{ otherSessionCount }})
            </UButton>
          </div>
        </template>
      </UCard>

      <!-- Danger zone -->
      <UCard class="border border-red-500/30 bg-red-500/5">
        <div class="flex flex-col gap-3">
          <div>
            <p class="text-xs uppercase tracking-[0.3em] text-red-300/80">Danger zone</p>
            <p class="text-lg font-medium">Delete your account</p>
            <p class="mt-1 text-sm text-white/60">
              Permanently removes your Koios ID and all associated data. This cannot be undone.
            </p>
          </div>
          <UButton
            color="error"
            variant="soft"
            icon="i-fa6-solid:trash"
            class="self-start"
            @click="deleteModalOpen = true"
          >
            Delete account
          </UButton>
        </div>
      </UCard>
    </section>

    <DangerConfirmModal
      v-model="deleteModalOpen"
      title="Delete your account?"
      :message="`This permanently deletes your Koios ID (${form.username || 'this account'}) and signs you out everywhere. This cannot be undone.`"
      confirm-text="Delete account"
      :loading="deleting"
      :error="deleteError"
      @confirm="confirmDelete"
    />
  </PageLayout>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, reactive } from 'vue'
import { useRouter } from 'vue-router'
import { useHead } from '@unhead/vue'
import PageLayout from '@/layouts/PageLayout.vue'
import DangerConfirmModal from '@/components/DangerConfirmModal.vue'
import { usePageHeader } from '@/composables/usePageHeader'
import { useAuthStore } from '@/stores/auth/auth'
import {
  keycloakAccountApi,
  type AccountProfile,
  type AccountSession,
} from '@/lib/auth/keycloakAccount'
import { goToKeycloakAction } from '@/lib/auth/keycloakActions'
import { getErrorMessage } from '@/lib/api/errors'

useHead({
  title: 'Account | Koios Digital',
  meta: [{ name: 'description', content: 'Manage your Koios account' }],
})

const router = useRouter()
const authStore = useAuthStore()
const { setHeader } = usePageHeader()

type Banner = { kind: 'success' | 'error'; message: string }
const banner = ref<Banner | null>(null)
function showBanner(kind: Banner['kind'], message: string) {
  banner.value = { kind, message }
  if (kind === 'success') {
    setTimeout(() => {
      if (banner.value?.message === message) banner.value = null
    }, 4000)
  }
}

// Profile
const loadingProfile = ref(true)
const savingProfile = ref(false)
const emailVerified = ref<boolean | undefined>(undefined)
const form = reactive({ username: '', firstName: '', lastName: '', email: '' })
const originalForm = reactive({ username: '', firstName: '', lastName: '', email: '' })

const profileDirty = computed(
  () =>
    form.firstName !== originalForm.firstName ||
    form.lastName !== originalForm.lastName ||
    form.email !== originalForm.email,
)

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
  } catch (error) {
    showBanner('error', getErrorMessage(error, 'Failed to load profile'))
  } finally {
    loadingProfile.value = false
  }
}

function resetForm() {
  Object.assign(form, originalForm)
}

async function saveProfile() {
  savingProfile.value = true
  try {
    await keycloakAccountApi.updateProfile({
      firstName: form.firstName,
      lastName: form.lastName,
      email: form.email,
    })
    Object.assign(originalForm, { ...form })
    showBanner('success', 'Profile updated.')
    // Refresh to pick up server-normalised values (e.g. emailVerified flip)
    await loadProfile()
  } catch (error) {
    showBanner('error', getErrorMessage(error, 'Failed to update profile'))
  } finally {
    savingProfile.value = false
  }
}

// Password
function changePassword() {
  goToKeycloakAction('UPDATE_PASSWORD')
}

// Sessions
const sessions = ref<AccountSession[]>([])
const loadingSessions = ref(false)
const revokingSessionId = ref<string | null>(null)
const revokingAll = ref(false)

const otherSessionCount = computed(() => sessions.value.filter((s) => !s.current).length)

async function loadSessions() {
  loadingSessions.value = true
  try {
    sessions.value = await keycloakAccountApi.listSessions()
  } catch (error) {
    showBanner('error', getErrorMessage(error, 'Failed to load sessions'))
  } finally {
    loadingSessions.value = false
  }
}

async function revokeSession(id: string) {
  revokingSessionId.value = id
  try {
    await keycloakAccountApi.revokeSession(id)
    sessions.value = sessions.value.filter((s) => s.id !== id)
    showBanner('success', 'Session signed out.')
  } catch (error) {
    showBanner('error', getErrorMessage(error, 'Failed to revoke session'))
  } finally {
    revokingSessionId.value = null
  }
}

async function revokeAllOther() {
  revokingAll.value = true
  try {
    await keycloakAccountApi.revokeAllOtherSessions()
    sessions.value = sessions.value.filter((s) => s.current)
    showBanner('success', 'Other sessions signed out.')
  } catch (error) {
    showBanner('error', getErrorMessage(error, 'Failed to revoke sessions'))
  } finally {
    revokingAll.value = false
  }
}

// Delete account
const deleteModalOpen = ref(false)
const deleting = ref(false)
const deleteError = ref<string | undefined>()

async function confirmDelete() {
  deleting.value = true
  deleteError.value = undefined
  try {
    await keycloakAccountApi.deleteAccount()
    // Clear local tokens and bounce to login. Server has already revoked sessions.
    await authStore.logout()
    router.replace('/login')
  } catch (error) {
    deleteError.value = getErrorMessage(error, 'Failed to delete account')
  } finally {
    deleting.value = false
  }
}

onMounted(() => {
  setHeader({ title: 'Account', backRoute: '/settings' })
  loadProfile()
  loadSessions()
})

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
</script>
