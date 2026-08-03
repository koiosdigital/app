<template>
  <div class="space-y-4">
    <div class="flex items-center justify-between">
      <h3 class="text-sm font-medium text-white/50 uppercase tracking-wider">Sharing</h3>
      <UButton
        size="xs"
        color="primary"
        variant="soft"
        icon="i-fa6-solid:user-plus"
        :loading="loading"
        @click="showInviteModal = true"
      >
        Invite
      </UButton>
    </div>

    <!-- Loading shares -->
    <div v-if="loading" class="flex justify-center py-4">
      <UIcon name="i-fa6-solid:spinner" class="h-5 w-5 animate-spin text-white/50" />
    </div>

    <!-- Sharing error -->
    <UAlert v-else-if="error" color="error" icon="i-fa6-solid:circle-exclamation" :title="error" />

    <!-- No shares -->
    <p v-else-if="!sharedUsers.length && !pendingInvites.length" class="text-sm text-white/50 py-2">
      This device isn't shared with anyone yet.
    </p>

    <!-- Shared users list -->
    <div v-else class="space-y-2">
      <!-- Pending invites -->
      <div
        v-for="invite in pendingInvites"
        :key="invite.id"
        class="flex items-center justify-between py-2 px-3 bg-white/5 rounded-lg"
      >
        <div class="flex items-center gap-3 min-w-0">
          <div
            class="flex-shrink-0 h-8 w-8 rounded-full bg-amber-500/20 flex items-center justify-center"
          >
            <UIcon name="i-fa6-regular:envelope" class="h-4 w-4 text-amber-400" />
          </div>
          <div class="min-w-0">
            <p class="text-sm text-white/70 truncate">{{ invite.email }}</p>
            <p class="text-xs text-amber-400">Pending invite</p>
          </div>
        </div>
        <UButton
          size="xs"
          color="neutral"
          variant="ghost"
          icon="i-fa6-solid:xmark"
          aria-label="Cancel invite"
          @click="askCancelInvite(invite)"
        />
      </div>

      <!-- Shared users -->
      <div
        v-for="user in sharedUsers"
        :key="user.userId"
        class="flex items-center justify-between py-2 px-3 bg-white/5 rounded-lg"
      >
        <div class="flex items-center gap-3 min-w-0">
          <div
            class="flex-shrink-0 h-8 w-8 rounded-full bg-primary-500/20 flex items-center justify-center"
          >
            <UIcon name="i-fa6-solid:user" class="h-4 w-4 text-primary-400" />
          </div>
          <div class="min-w-0">
            <p class="text-sm text-white/70 truncate">{{ user.userId }}</p>
            <p class="text-xs text-white/50">Shared {{ formatDate(user.sharedAt) }}</p>
          </div>
        </div>
        <UButton
          size="xs"
          color="error"
          variant="ghost"
          icon="i-fa6-solid:user-minus"
          aria-label="Revoke access"
          @click="askRevokeAccess(user)"
        />
      </div>
    </div>

    <!-- Invite Modal -->
    <UModal v-model:open="showInviteModal">
      <template #content>
        <UCard>
          <template #header>
            <div class="flex items-center gap-3">
              <UIcon name="i-fa6-solid:user-plus" class="h-5 w-5 text-primary-400" />
              <h3 class="text-lg font-semibold">Invite to Share</h3>
            </div>
          </template>

          <div class="space-y-4">
            <p class="text-sm text-white/70">
              Enter the email address of the person you want to share this device with. They'll
              receive an invitation email.
            </p>
            <UInput
              v-model="inviteEmail"
              type="email"
              placeholder="email@example.com"
              size="lg"
              :disabled="sendingInvite"
            />
            <UAlert
              v-if="inviteError"
              color="error"
              icon="i-fa6-solid:circle-exclamation"
              :title="inviteError"
            />
          </div>

          <template #footer>
            <div class="flex justify-end gap-3">
              <UButton
                color="neutral"
                variant="ghost"
                :disabled="sendingInvite"
                @click="showInviteModal = false"
              >
                Cancel
              </UButton>
              <UButton
                color="primary"
                :loading="sendingInvite"
                :disabled="!inviteEmail || sendingInvite"
                @click="sendInvite"
              >
                Send Invite
              </UButton>
            </div>
          </template>
        </UCard>
      </template>
    </UModal>

    <!-- Cancel invite confirmation -->
    <DangerConfirmModal
      v-model="showCancelInvite"
      title="Cancel invite?"
      :message="`This will cancel the invitation to ${inviteToCancel?.email ?? ''}.`"
      confirm-text="Cancel invite"
      :loading="cancelingInvite"
      :error="cancelInviteError"
      @confirm="confirmCancelInvite"
    />

    <!-- Revoke access confirmation -->
    <DangerConfirmModal
      v-model="showRevokeAccess"
      title="Revoke access?"
      :message="`This will revoke ${userToRevoke?.userId ?? ''}'s access to the device.`"
      confirm-text="Revoke"
      :loading="revokingUser"
      :error="revokeError"
      @confirm="confirmRevokeAccess"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { devicesApi, type ShareUser, type ShareInvite } from '@/lib/api/devices'
import { getErrorMessage } from '@/lib/api/errors'
import DangerConfirmModal from '@/components/DangerConfirmModal.vue'

// Owner-only sharing management for a device: shared users, pending invites,
// and the invite-by-email modal. Self-contained — parents just render it
// behind their own `isOwner` check.
const props = defineProps<{
  deviceId: string
}>()

const toast = useToast()

const loading = ref(false)
const error = ref<string>()
const sharedUsers = ref<ShareUser[]>([])
const pendingInvites = ref<ShareInvite[]>([])
const showInviteModal = ref(false)
const inviteEmail = ref('')
const inviteError = ref<string>()
const sendingInvite = ref(false)

// Cancel-invite confirmation state
const showCancelInvite = ref(false)
const inviteToCancel = ref<ShareInvite | null>(null)
const cancelingInvite = ref(false)
const cancelInviteError = ref<string>()

// Revoke-access confirmation state
const showRevokeAccess = ref(false)
const userToRevoke = ref<ShareUser | null>(null)
const revokingUser = ref(false)
const revokeError = ref<string>()

async function loadShares() {
  loading.value = true
  error.value = undefined

  try {
    const shares = await devicesApi.getShares(props.deviceId)
    sharedUsers.value = shares.sharedUsers
    pendingInvites.value = shares.pendingInvites
  } catch (err) {
    error.value = getErrorMessage(err, 'Failed to load sharing info')
  } finally {
    loading.value = false
  }
}

async function sendInvite() {
  if (!inviteEmail.value) return

  sendingInvite.value = true
  inviteError.value = undefined

  try {
    await devicesApi.createShareInvite(props.deviceId, inviteEmail.value)
    inviteEmail.value = ''
    showInviteModal.value = false
    await loadShares()
  } catch (err) {
    inviteError.value = getErrorMessage(err, 'Failed to send invite')
  } finally {
    sendingInvite.value = false
  }
}

function askCancelInvite(invite: ShareInvite) {
  inviteToCancel.value = invite
  cancelInviteError.value = undefined
  showCancelInvite.value = true
}

async function confirmCancelInvite() {
  if (!inviteToCancel.value) return
  cancelingInvite.value = true
  cancelInviteError.value = undefined

  try {
    await devicesApi.cancelShareInvite(props.deviceId, inviteToCancel.value.id)
    showCancelInvite.value = false
    inviteToCancel.value = null
    await loadShares()
  } catch (err) {
    cancelInviteError.value = getErrorMessage(err, 'Failed to cancel invite')
    toast.add({ title: cancelInviteError.value, color: 'error' })
  } finally {
    cancelingInvite.value = false
  }
}

function askRevokeAccess(user: ShareUser) {
  userToRevoke.value = user
  revokeError.value = undefined
  showRevokeAccess.value = true
}

async function confirmRevokeAccess() {
  if (!userToRevoke.value) return
  revokingUser.value = true
  revokeError.value = undefined

  try {
    await devicesApi.revokeShare(props.deviceId, userToRevoke.value.userId)
    showRevokeAccess.value = false
    userToRevoke.value = null
    await loadShares()
  } catch (err) {
    revokeError.value = getErrorMessage(err, 'Failed to revoke access')
    toast.add({ title: revokeError.value, color: 'error' })
  } finally {
    revokingUser.value = false
  }
}

function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString()
}

onMounted(loadShares)
</script>
