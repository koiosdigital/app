<template>
  <div v-if="visibleTransfers.length" class="space-y-3">
    <div
      v-for="transfer in visibleTransfers"
      :key="transfer.id"
      class="flex items-center gap-3 rounded-lg border border-primary-500/30 bg-primary-500/10 px-4 py-3"
    >
      <div
        class="flex-shrink-0 h-9 w-9 rounded-full bg-primary-500/20 flex items-center justify-center"
      >
        <UIcon name="i-fa6-solid:right-left" class="h-4 w-4 text-primary-400" />
      </div>
      <div class="min-w-0 flex-1">
        <p class="text-sm text-white/90">
          <span class="font-medium">{{ transfer.fromName }}</span> wants to transfer
          <span class="font-medium">{{ transfer.deviceName }}</span> to you
        </p>
        <p class="text-xs text-white/50">Sent {{ formatDate(transfer.createdAt) }}</p>
      </div>
      <UButton size="sm" color="primary" @click="confirmTransfer(transfer)"> Accept </UButton>
      <UButton
        size="sm"
        color="neutral"
        variant="ghost"
        icon="i-fa6-solid:xmark"
        square
        aria-label="Dismiss"
        @click="dismiss(transfer.id)"
      />
    </div>

    <!-- Accept confirmation modal -->
    <UModal v-model:open="showConfirmModal">
      <template #content>
        <UCard>
          <template #header>
            <div class="flex items-center gap-3">
              <UIcon name="i-fa6-solid:right-left" class="h-5 w-5 text-primary-400" />
              <h3 class="text-lg font-semibold">Accept Transfer</h3>
            </div>
          </template>

          <div v-if="selected" class="space-y-4">
            <p class="text-sm text-white/70">
              <span class="font-medium text-white/90">{{ selected.fromName }}</span> wants to make
              you the owner of
              <span class="font-medium text-white/90">{{ selected.deviceName }}</span
              >. Once you accept, the device moves to your account and the previous owner loses
              access.
            </p>
            <UAlert
              v-if="acceptError"
              color="error"
              icon="i-fa6-solid:circle-exclamation"
              :title="acceptError"
            />
          </div>

          <template #footer>
            <div class="flex justify-end gap-3">
              <UButton
                color="neutral"
                variant="ghost"
                :disabled="accepting"
                @click="showConfirmModal = false"
              >
                Not Now
              </UButton>
              <UButton color="primary" :loading="accepting" @click="acceptSelected">
                Accept Transfer
              </UButton>
            </div>
          </template>
        </UCard>
      </template>
    </UModal>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { transfersApi, type PendingTransfer } from '@/lib/api/devices'
import { getErrorMessage } from '@/lib/api/errors'

// Home-screen banner for ownership transfers addressed to the signed-in user.
// Self-loads; also handles the `?transfer=<id>` deeplink from the invite email
// by auto-opening the matching transfer's confirmation. Dismissal is local to
// the session — the transfer stays pending until accepted or the owner cancels.
const emit = defineEmits<{
  /** A transfer was accepted — the parent should reload its device list. */
  accepted: [deviceId: string]
}>()

const route = useRoute()
const router = useRouter()

const transfers = ref<PendingTransfer[]>([])
const dismissed = ref<Set<string>>(new Set())

const showConfirmModal = ref(false)
const selected = ref<PendingTransfer | null>(null)
const accepting = ref(false)
const acceptError = ref<string>()

const visibleTransfers = computed(() => transfers.value.filter((t) => !dismissed.value.has(t.id)))

function confirmTransfer(transfer: PendingTransfer) {
  selected.value = transfer
  acceptError.value = undefined
  showConfirmModal.value = true
}

function dismiss(id: string) {
  dismissed.value.add(id)
}

async function acceptSelected() {
  if (!selected.value) return

  accepting.value = true
  acceptError.value = undefined

  try {
    const { deviceId } = await transfersApi.acceptTransfer(selected.value.id)
    transfers.value = transfers.value.filter((t) => t.id !== selected.value?.id)
    showConfirmModal.value = false
    emit('accepted', deviceId)
  } catch (err) {
    acceptError.value = getErrorMessage(err, 'Failed to accept transfer')
  } finally {
    accepting.value = false
  }
}

function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString()
}

onMounted(async () => {
  // Banner is best-effort: a fetch failure just means no banner this visit.
  try {
    transfers.value = await transfersApi.getPendingTransfers()
  } catch (err) {
    console.error('Failed to load pending transfers:', err)
    return
  }

  // Email deeplink: /?transfer=<id> — open that transfer's confirmation
  // directly, then drop the param so refreshes don't re-trigger it.
  const deeplinkId = route.query.transfer
  if (typeof deeplinkId === 'string' && deeplinkId) {
    const match = transfers.value.find((t) => t.id === deeplinkId)
    if (match) confirmTransfer(match)
    const rest = { ...route.query }
    delete rest.transfer
    router.replace({ query: rest })
  }
})
</script>
