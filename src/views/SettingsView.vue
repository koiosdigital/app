<template>
  <PageLayout>
    <section class="flex flex-col gap-6 px-5 py-6">
      <!-- Action Result Banner -->
      <Transition
        enter-active-class="transition-all duration-200 ease-out"
        leave-active-class="transition-all duration-150 ease-in"
        enter-from-class="opacity-0 -translate-y-2"
        enter-to-class="opacity-100 translate-y-0"
        leave-from-class="opacity-100 translate-y-0"
        leave-to-class="opacity-0 -translate-y-2"
      >
        <div
          v-if="actionResult"
          class="rounded-xl p-4"
          :class="
            actionResult.success
              ? 'border border-green-500/30 bg-green-500/10'
              : 'border border-amber-500/30 bg-amber-500/10'
          "
        >
          <div class="flex items-center gap-3">
            <UIcon
              :name="actionResult.success ? 'i-fa6-solid:circle-check' : 'i-fa6-solid:circle-xmark'"
              class="h-5 w-5"
              :class="actionResult.success ? 'text-green-400' : 'text-amber-400'"
            />
            <p
              class="flex-1 text-sm"
              :class="actionResult.success ? 'text-green-200' : 'text-amber-200'"
            >
              {{ actionResult.message }}
            </p>
            <UButton
              size="xs"
              color="neutral"
              variant="ghost"
              icon="i-fa6-solid:xmark"
              @click="dismissActionResult"
            />
          </div>
        </div>
      </Transition>

      <UCard class="bg-white/5">
        <div class="flex flex-col gap-4">
          <div>
            <p class="text-xs uppercase tracking-[0.3em] text-white/60">Account</p>
            <p class="text-lg font-medium">{{ accountLabel }}</p>
          </div>
          <div class="grid gap-2 sm:grid-cols-2">
            <UButton
              color="neutral"
              variant="soft"
              icon="i-fa6-solid:user-gear"
              @click="updateProfile"
            >
              Manage profile
            </UButton>
            <UButton color="neutral" variant="soft" icon="i-fa6-solid:key" @click="changePassword">
              Change password
            </UButton>
          </div>
          <UButton
            color="primary"
            variant="ghost"
            icon="i-fa6-solid:right-from-bracket"
            @click="handleLogout"
          >
            Log out
          </UButton>
        </div>
      </UCard>

      <UCard class="bg-white/5">
        <div class="space-y-3">
          <div>
            <p class="text-xs uppercase tracking-[0.3em] text-white/60">About</p>
            <p class="text-lg font-medium">Koios Digital App</p>
          </div>
          <ul class="space-y-2 text-sm text-white/70">
            <li class="flex items-center justify-between">
              <span>Version</span>
              <span>{{ appVersion }}</span>
            </li>
            <li class="flex items-center justify-between">
              <span>Build channel</span>
              <span class="capitalize">{{ appChannel }}</span>
            </li>
          </ul>
          <div class="flex flex-wrap gap-2">
            <UButton variant="soft" icon="i-fa6-solid:circle-info" @click="openDocs"
              >Support</UButton
            >
            <UButton variant="soft" icon="i-fa6-regular:envelope" @click="contactSupport"
              >Contact</UButton
            >
          </div>
        </div>
      </UCard>
    </section>
  </PageLayout>
</template>

<script setup lang="ts">
import { computed, ref, onMounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useHead } from '@unhead/vue'
import PageLayout from '@/layouts/PageLayout.vue'
import { usePageHeader } from '@/composables/usePageHeader'
import { useAuthStore } from '@/stores/auth/auth'
import { ENV } from '@/config/environment'
import { goToKeycloakAction, type KeycloakAction } from '@/lib/auth/keycloakActions'

useHead({
  title: 'Settings | Koios Digital',
  meta: [{ name: 'description', content: 'Manage your Koios account settings' }],
})

const authStore = useAuthStore()
const router = useRouter()
const route = useRoute()
const { setHeader } = usePageHeader()

const accountLabel = computed(() =>
  authStore.isLoggedIn ? 'Signed in with Koios ID' : 'Not signed in',
)

const appVersion = ENV.appVersion
const appChannel = ENV.appChannel

// Keycloak action result handling
type ActionResult = { success: boolean; message: string }
const actionResult = ref<ActionResult | null>(null)

const ACTION_MESSAGES: Record<KeycloakAction, { success: string; cancelled: string }> = {
  UPDATE_PASSWORD: {
    success: 'Your password has been updated successfully.',
    cancelled: 'Password change was cancelled.',
  },
  UPDATE_PROFILE: {
    success: 'Your profile has been updated successfully.',
    cancelled: 'Profile update was cancelled.',
  },
  delete_account: {
    success: 'Your account has been deleted.',
    cancelled: 'Account deletion was cancelled.',
  },
}

function handleActionResult() {
  const kcAction = route.query.kc_action as KeycloakAction | undefined
  const kcActionStatus = route.query.kc_action_status as string | undefined

  if (kcAction && kcActionStatus) {
    const messages = ACTION_MESSAGES[kcAction]
    if (messages) {
      const success = kcActionStatus === 'success'
      actionResult.value = {
        success,
        message: success ? messages.success : messages.cancelled,
      }
    }
    // Clear query params from URL
    router.replace({ path: '/settings', query: {} })
  }
}

function dismissActionResult() {
  actionResult.value = null
}

onMounted(() => {
  setHeader({
    title: 'Settings',
    backRoute: '/',
  })
  handleActionResult()
})

const updateProfile = () => {
  goToKeycloakAction('UPDATE_PROFILE')
}

const changePassword = () => {
  goToKeycloakAction('UPDATE_PASSWORD')
}

const openDocs = () => {
  window.open(ENV.supportUrl, '_blank')
}

const contactSupport = () => {
  window.location.href = `mailto:${ENV.supportEmail}`
}

const handleLogout = async () => {
  await authStore.logout()
  router.replace('/login')
}
</script>
