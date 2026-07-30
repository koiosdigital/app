<template>
  <div class="space-y-4">
    <h3 class="text-sm font-medium text-white/50 uppercase tracking-wider">Ownership</h3>

    <!-- Loading -->
    <div v-if="loading" class="flex justify-center py-4">
      <UIcon name="i-fa6-solid:spinner" class="h-5 w-5 animate-spin text-white/50" />
    </div>

    <UAlert v-else-if="error" color="error" icon="i-fa6-solid:circle-exclamation" :title="error" />

    <!-- Pending transfer -->
    <div
      v-else-if="pending"
      class="space-y-3 rounded-lg border border-amber-500/20 bg-amber-500/10 p-3"
    >
      <div class="flex items-center gap-3 min-w-0">
        <div
          class="flex-shrink-0 h-8 w-8 rounded-full bg-amber-500/20 flex items-center justify-center"
        >
          <UIcon name="i-fa6-solid:right-left" class="h-4 w-4 text-amber-400" />
        </div>
        <div class="min-w-0">
          <p class="text-sm text-white/80">
            Transfer pending — {{ pending.toName }}
            <span class="text-white/50">({{ pending.toEmail }})</span>
          </p>
          <p class="text-xs text-amber-400">
            Sent {{ formatDate(pending.createdAt) }} · waiting for them to accept
          </p>
        </div>
      </div>
      <p class="text-xs text-white/50">
        You keep full control of this device until the transfer is accepted.
      </p>
      <UButton
        size="xs"
        color="neutral"
        variant="soft"
        icon="i-fa6-solid:xmark"
        :loading="canceling"
        @click="cancelTransfer"
      >
        Cancel Transfer
      </UButton>
    </div>

    <!-- No pending transfer -->
    <div v-else class="space-y-3">
      <p class="text-sm text-white/50">
        Permanently hand this device over to someone else. You'll lose access once they accept.
      </p>
      <UButton
        size="xs"
        color="neutral"
        variant="soft"
        icon="i-fa6-solid:right-left"
        @click="openModal"
      >
        Transfer Ownership
      </UButton>
    </div>

    <!-- Start transfer modal -->
    <UModal v-model:open="showModal">
      <template #content>
        <UCard>
          <template #header>
            <div class="flex items-center gap-3">
              <UIcon name="i-fa6-solid:right-left" class="h-5 w-5 text-primary-400" />
              <h3 class="text-lg font-semibold">Transfer Ownership</h3>
            </div>
          </template>

          <div class="space-y-4">
            <p class="text-sm text-white/70">
              The new owner will receive an email invitation. The transfer stays pending — and you
              stay in control — until they accept it, and you can cancel at any time before then.
            </p>
            <div class="space-y-2">
              <label for="transfer-name" class="block text-sm font-medium text-white/70">
                Recipient name
              </label>
              <UInput
                id="transfer-name"
                v-model="recipientName"
                placeholder="Their name"
                size="lg"
                :disabled="starting"
              />
            </div>
            <div class="space-y-2">
              <label for="transfer-email" class="block text-sm font-medium text-white/70">
                Recipient email
              </label>
              <UInput
                id="transfer-email"
                v-model="recipientEmail"
                type="email"
                placeholder="email@example.com"
                size="lg"
                :disabled="starting"
              />
            </div>
            <UAlert
              color="warning"
              icon="i-fa6-solid:triangle-exclamation"
              title="When they accept, ownership moves to them and this device disappears from your account."
            />
            <UAlert
              v-if="startError"
              color="error"
              icon="i-fa6-solid:circle-exclamation"
              :title="startError"
            />
          </div>

          <template #footer>
            <div class="flex justify-end gap-3">
              <UButton
                color="neutral"
                variant="ghost"
                :disabled="starting"
                @click="showModal = false"
              >
                Cancel
              </UButton>
              <UButton
                color="primary"
                :loading="starting"
                :disabled="!recipientEmail || !recipientName || starting"
                @click="startTransfer"
              >
                Send Transfer Invite
              </UButton>
            </div>
          </template>
        </UCard>
      </template>
    </UModal>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { devicesApi, type DeviceTransfer } from '@/lib/api/devices'
import { getErrorMessage } from '@/lib/api/errors'

// Owner-only ownership-transfer management: shows the pending transfer (with
// cancel) or a start-transfer modal (recipient name + email). Self-contained —
// parents just render it behind their own `isOwner` check.
const props = defineProps<{
  deviceId: string
}>()

const loading = ref(false)
const error = ref<string>()
const pending = ref<DeviceTransfer | null>(null)

const showModal = ref(false)
const recipientName = ref('')
const recipientEmail = ref('')
const startError = ref<string>()
const starting = ref(false)
const canceling = ref(false)

async function loadTransfer() {
  loading.value = true
  error.value = undefined

  try {
    pending.value = await devicesApi.getTransfer(props.deviceId)
  } catch (err) {
    error.value = getErrorMessage(err, 'Failed to load transfer status')
  } finally {
    loading.value = false
  }
}

function openModal() {
  recipientName.value = ''
  recipientEmail.value = ''
  startError.value = undefined
  showModal.value = true
}

async function startTransfer() {
  if (!recipientEmail.value || !recipientName.value) return

  starting.value = true
  startError.value = undefined

  try {
    pending.value = await devicesApi.startTransfer(
      props.deviceId,
      recipientEmail.value.trim(),
      recipientName.value.trim(),
    )
    showModal.value = false
  } catch (err) {
    startError.value = getErrorMessage(err, 'Failed to start transfer')
  } finally {
    starting.value = false
  }
}

async function cancelTransfer() {
  canceling.value = true
  error.value = undefined

  try {
    await devicesApi.cancelTransfer(props.deviceId)
    pending.value = null
  } catch (err) {
    error.value = getErrorMessage(err, 'Failed to cancel transfer')
  } finally {
    canceling.value = false
  }
}

function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString()
}

onMounted(loadTransfer)
</script>
