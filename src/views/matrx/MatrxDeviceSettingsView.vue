<template>
  <div class="flex flex-1 min-h-0 flex-col bg-zinc-950">
    <!-- Header -->
    <header
      class="sticky top-0 z-10 border-b border-white/10 bg-zinc-950/95 backdrop-blur px-5 py-4"
    >
      <div class="flex items-center gap-4">
        <UButton
          color="neutral"
          variant="ghost"
          icon="i-fa6-solid:arrow-left"
          square
          @click="router.back()"
        />
        <h1 class="flex-1 text-xl font-semibold">Device Settings</h1>
        <UButton
          v-if="device"
          color="error"
          variant="ghost"
          icon="i-fa6-solid:trash"
          square
          @click="showDeleteModal = true"
        />
      </div>
    </header>

    <!-- Loading State -->
    <div v-if="loading" class="flex flex-1 items-center justify-center">
      <UIcon name="i-fa6-solid:spinner" class="h-8 w-8 animate-spin text-white/50" />
    </div>

    <!-- Error State -->
    <div v-else-if="error" class="flex flex-1 items-center justify-center p-5">
      <UCard class="w-full max-w-md border border-red-500/20 bg-red-500/10">
        <div class="space-y-4 text-center">
          <UIcon name="i-fa6-solid:circle-exclamation" class="h-12 w-12 text-red-400 mx-auto" />
          <p class="text-red-400">{{ error }}</p>
          <UButton color="neutral" variant="soft" @click="loadDevice">Retry</UButton>
        </div>
      </UCard>
    </div>

    <!-- Settings Content -->
    <div v-else-if="device" class="flex flex-1 flex-col min-h-0">
      <div class="flex-1 min-h-0 overflow-y-auto px-5 py-6 pb-28 space-y-6">
        <!-- Display Name -->
        <div class="space-y-2">
          <label for="display-name" class="block text-sm font-medium text-white/70">
            Display Name
          </label>
          <UInput
            id="display-name"
            v-model="displayName"
            placeholder="Enter device name"
            size="lg"
          />
        </div>

        <!-- Brightness -->
        <div class="space-y-3">
          <div class="flex items-center justify-between">
            <label class="block text-sm font-medium text-white/70">Brightness</label>
            <span class="text-sm text-white/50">{{ brightnessPercent }}%</span>
          </div>
          <input
            type="range"
            min="0"
            max="255"
            v-model.number="screenBrightness"
            :disabled="autoBrightnessEnabled"
            class="w-full h-2 bg-white/10 rounded-lg appearance-none cursor-pointer accent-primary-500 disabled:opacity-50 disabled:cursor-not-allowed"
          />
          <div v-if="autoBrightnessEnabled" class="flex items-center gap-2 text-xs text-white/50">
            <UIcon name="i-fa6-solid:circle-info" class="h-3 w-3" />
            Brightness is controlled automatically
          </div>
        </div>

        <!-- Auto Brightness (only show if device has light sensor) -->
        <div v-if="hasLightSensor" class="space-y-4">
          <div class="flex items-center justify-between py-2">
            <div>
              <span class="text-sm font-medium text-white/70">Auto Brightness</span>
              <p class="text-xs text-white/50">Adjust brightness based on ambient light</p>
            </div>
            <USwitch v-model="autoBrightnessEnabled" />
          </div>

          <!-- Screen Off Lux (only show when auto brightness is enabled) -->
          <div v-if="autoBrightnessEnabled" class="space-y-3 border-t border-white/10 pt-4">
            <div class="flex items-center justify-between">
              <label class="block text-sm font-medium text-white/70">Screen Off Threshold</label>
              <span class="text-sm text-white/50">{{ screenOffLux }} lux</span>
            </div>
            <input
              type="range"
              min="0"
              max="20"
              v-model.number="screenOffLux"
              class="w-full h-2 bg-white/10 rounded-lg appearance-none cursor-pointer accent-primary-500"
            />
            <div class="flex items-start gap-2 text-xs text-white/50">
              <UIcon name="i-fa6-solid:circle-info" class="h-3 w-3 mt-0.5 shrink-0" />
              <span>
                The screen will turn off when ambient light drops below this level. Lower values
                mean the screen stays on in darker conditions.
              </span>
            </div>
          </div>
        </div>

        <!-- Device Info -->
        <div class="border-t border-white/10 pt-6 space-y-3">
          <h3 class="text-sm font-medium text-white/50 uppercase tracking-wider">Device Info</h3>
          <div class="space-y-2 text-sm">
            <div class="flex justify-between">
              <span class="text-white/50">Device ID</span>
              <span class="text-white/70 font-mono text-xs">{{ device.id }}</span>
            </div>
            <div class="flex justify-between">
              <span class="text-white/50">Resolution</span>
              <span class="text-white/70">{{ deviceWidth }}x{{ deviceHeight }} pixels</span>
            </div>
            <div class="flex justify-between">
              <span class="text-white/50">Light Sensor</span>
              <span class="text-white/70">{{ hasLightSensor ? 'Yes' : 'No' }}</span>
            </div>
            <div class="flex justify-between">
              <span class="text-white/50">Status</span>
              <UBadge :color="device.online ? 'success' : 'neutral'" variant="soft">
                {{ device.online ? 'Online' : 'Offline' }}
              </UBadge>
            </div>
          </div>
        </div>

        <!-- Sharing Section (Owner only) -->
        <div v-if="isOwner" class="border-t border-white/10 pt-6 space-y-4">
          <div class="flex items-center justify-between">
            <h3 class="text-sm font-medium text-white/50 uppercase tracking-wider">Sharing</h3>
            <UButton
              size="xs"
              color="primary"
              variant="soft"
              icon="i-fa6-solid:user-plus"
              :loading="sharingLoading"
              @click="showInviteModal = true"
            >
              Invite
            </UButton>
          </div>

          <!-- Loading shares -->
          <div v-if="sharingLoading" class="flex justify-center py-4">
            <UIcon name="i-fa6-solid:spinner" class="h-5 w-5 animate-spin text-white/50" />
          </div>

          <!-- Sharing error -->
          <UAlert
            v-else-if="sharingError"
            color="error"
            icon="i-fa6-solid:circle-exclamation"
            :title="sharingError"
          />

          <!-- No shares -->
          <p
            v-else-if="!sharedUsers.length && !pendingInvites.length"
            class="text-sm text-white/50 py-2"
          >
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
                :loading="cancelingInvite === invite.id"
                @click="cancelInvite(invite.id)"
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
                :loading="revokingUser === user.userId"
                @click="revokeAccess(user.userId)"
              />
            </div>
          </div>
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

      <!-- Delete Confirmation Modal -->
      <DangerConfirmModal
        v-model="showDeleteModal"
        :title="isOwner ? 'Delete Device' : 'Remove Device'"
        :message="
          isOwner
            ? 'Are you sure you want to delete this device? This action cannot be undone. All installations and shared access will be permanently removed.'
            : 'Are you sure you want to remove this device from your account? You will lose access to this shared device.'
        "
        :confirm-text="isOwner ? 'Delete Device' : 'Remove Device'"
        :loading="deleting"
        :error="deleteError"
        @confirm="deleteDevice"
      />
    </div>
  </div>

  <!-- Footer (teleported to app-footer for safe area handling) -->
  <Teleport v-if="device" to="#app-footer">
    <footer class="border-t border-white/10 bg-zinc-950/95 backdrop-blur px-6 py-4">
      <div v-if="saveError" class="mb-3">
        <UAlert color="error" icon="i-fa6-solid:circle-exclamation" :title="saveError" />
      </div>
      <UButton
        color="primary"
        size="lg"
        block
        :loading="saving"
        :disabled="saving || !hasChanges"
        @click="saveSettings"
      >
        Save Changes
      </UButton>
    </footer>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useHead } from '@unhead/vue'
import { jwtDecode } from 'jwt-decode'
import { devicesApi, type ShareUser, type ShareInvite } from '@/lib/api/devices'
import { getErrorMessage } from '@/lib/api/errors'
import type { MatrxDevice } from '@/lib/api/mappers/deviceMapper'
import { useAuthStore } from '@/stores/auth/auth'
import DangerConfirmModal from '@/components/DangerConfirmModal.vue'

const router = useRouter()
const route = useRoute()

const deviceId = computed(() => route.params.id as string)

const device = ref<MatrxDevice | null>(null)
const loading = ref(true)
const error = ref<string>()
const saving = ref(false)
const saveError = ref<string>()

// Sharing state
const sharingLoading = ref(false)
const sharingError = ref<string>()
const sharedUsers = ref<ShareUser[]>([])
const pendingInvites = ref<ShareInvite[]>([])
const showInviteModal = ref(false)
const inviteEmail = ref('')
const inviteError = ref<string>()
const sendingInvite = ref(false)
const cancelingInvite = ref<string>()
const revokingUser = ref<string>()

// Delete state
const showDeleteModal = ref(false)
const deleteError = ref<string>()
const deleting = ref(false)

const isOwner = computed(() => device.value?.accessLevel === 'OWNER')

// Editable settings
const displayName = ref('')
const screenBrightness = ref(200)
const autoBrightnessEnabled = ref(false)
const screenOffLux = ref(3)

// Original values for change detection
const originalDisplayName = ref('')
const originalScreenBrightness = ref(200)
const originalAutoBrightnessEnabled = ref(false)
const originalScreenOffLux = ref(3)

const deviceWidth = computed(() => device.value?.settings?.width ?? 64)
const deviceHeight = computed(() => device.value?.settings?.height ?? 32)
const hasLightSensor = computed(() => device.value?.settings?.hasLightSensor ?? false)

const brightnessPercent = computed(() => Math.round((screenBrightness.value / 255) * 100))

const hasChanges = computed(() => {
  return (
    displayName.value !== originalDisplayName.value ||
    screenBrightness.value !== originalScreenBrightness.value ||
    autoBrightnessEnabled.value !== originalAutoBrightnessEnabled.value ||
    screenOffLux.value !== originalScreenOffLux.value
  )
})

useHead({
  title: 'Device Settings | Koios Digital',
  meta: [{ name: 'description', content: 'Configure your Matrix device settings' }],
})

async function loadDevice() {
  loading.value = true
  error.value = undefined

  try {
    const deviceData = await devicesApi.getDevice(deviceId.value)

    if (!deviceData) {
      error.value = 'Device not found'
      return
    }

    if (deviceData.type !== 'MATRX') {
      error.value = 'This is not a Matrix device'
      return
    }

    device.value = deviceData as MatrxDevice

    // Initialize form values
    const settings = device.value.settings
    displayName.value = settings?.displayName ?? ''
    screenBrightness.value = settings?.typeSettings?.screenBrightness ?? 200
    autoBrightnessEnabled.value = settings?.typeSettings?.autoBrightnessEnabled ?? false
    screenOffLux.value = settings?.typeSettings?.screenOffLux ?? 3

    // Store original values
    originalDisplayName.value = displayName.value
    originalScreenBrightness.value = screenBrightness.value
    originalAutoBrightnessEnabled.value = autoBrightnessEnabled.value
    originalScreenOffLux.value = screenOffLux.value
  } catch (err) {
    error.value = getErrorMessage(err, 'Failed to load device')
    console.error('Failed to load device:', err)
  } finally {
    loading.value = false
  }
}

async function saveSettings() {
  saving.value = true
  saveError.value = undefined

  try {
    // Build settings update payload
    const displayNameChanged = displayName.value !== originalDisplayName.value
    const typeSettingsChanged =
      screenBrightness.value !== originalScreenBrightness.value ||
      autoBrightnessEnabled.value !== originalAutoBrightnessEnabled.value ||
      screenOffLux.value !== originalScreenOffLux.value

    if (displayNameChanged || typeSettingsChanged) {
      await devicesApi.updateMatrxSettings(deviceId.value, {
        ...(displayNameChanged && { displayName: displayName.value }),
        ...(typeSettingsChanged && {
          typeSettings: {
            screenBrightness: screenBrightness.value,
            autoBrightnessEnabled: autoBrightnessEnabled.value,
            screenOffLux: screenOffLux.value,
          },
        }),
      })
    }

    // Update original values after successful save
    originalDisplayName.value = displayName.value
    originalScreenBrightness.value = screenBrightness.value
    originalAutoBrightnessEnabled.value = autoBrightnessEnabled.value
    originalScreenOffLux.value = screenOffLux.value

    router.back()
  } catch (err) {
    saveError.value = getErrorMessage(err, 'Failed to save settings')
    console.error('Failed to save settings:', err)
  } finally {
    saving.value = false
  }
}

// ==================== Sharing Functions ====================

async function loadShares() {
  if (!isOwner.value) return

  sharingLoading.value = true
  sharingError.value = undefined

  try {
    const shares = await devicesApi.getShares(deviceId.value)
    sharedUsers.value = shares.sharedUsers
    pendingInvites.value = shares.pendingInvites
  } catch (err) {
    sharingError.value = getErrorMessage(err, 'Failed to load sharing info')
  } finally {
    sharingLoading.value = false
  }
}

async function sendInvite() {
  if (!inviteEmail.value) return

  sendingInvite.value = true
  inviteError.value = undefined

  try {
    await devicesApi.createShareInvite(deviceId.value, inviteEmail.value)
    inviteEmail.value = ''
    showInviteModal.value = false
    await loadShares()
  } catch (err) {
    inviteError.value = getErrorMessage(err, 'Failed to send invite')
  } finally {
    sendingInvite.value = false
  }
}

async function cancelInvite(inviteId: string) {
  cancelingInvite.value = inviteId

  try {
    await devicesApi.cancelShareInvite(deviceId.value, inviteId)
    await loadShares()
  } catch (err) {
    sharingError.value = getErrorMessage(err, 'Failed to cancel invite')
  } finally {
    cancelingInvite.value = undefined
  }
}

async function revokeAccess(userId: string) {
  revokingUser.value = userId

  try {
    await devicesApi.revokeShare(deviceId.value, userId)
    await loadShares()
  } catch (err) {
    sharingError.value = getErrorMessage(err, 'Failed to revoke access')
  } finally {
    revokingUser.value = undefined
  }
}

function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString()
}

// ==================== Delete Functions ====================

async function deleteDevice() {
  deleting.value = true
  deleteError.value = undefined

  try {
    if (isOwner.value) {
      await devicesApi.deleteDevice(deviceId.value)
    } else {
      // For shared users, revoke their own access
      // Get user ID from token
      const authStore = useAuthStore()
      const token = await authStore.getAccessToken()
      if (token) {
        const decoded = jwtDecode<{ sub: string }>(token)
        await devicesApi.revokeShare(deviceId.value, decoded.sub)
      }
    }
    router.replace('/')
  } catch (err) {
    deleteError.value = getErrorMessage(err, 'Failed to delete device')
  } finally {
    deleting.value = false
  }
}

// Reset screenBrightness to device's actual value when auto brightness is disabled
watch(autoBrightnessEnabled, (enabled) => {
  if (!enabled && device.value?.settings?.typeSettings?.screenBrightness) {
    screenBrightness.value = device.value.settings.typeSettings.screenBrightness
  }
})

onMounted(async () => {
  await loadDevice()
  // Load shares after device is loaded (only for owners)
  if (isOwner.value) {
    loadShares()
  }
})
</script>

