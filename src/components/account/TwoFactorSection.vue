<template>
  <UCard class="bg-white/5">
    <template #header>
      <div class="flex items-center justify-between gap-3">
        <div>
          <p class="text-xs uppercase tracking-[0.3em] text-white/60">Security</p>
          <p class="text-lg font-medium">Two-factor authentication</p>
        </div>
        <UButton
          color="neutral"
          variant="ghost"
          icon="i-fa6-solid:arrows-rotate"
          square
          :loading="loading"
          aria-label="Refresh two-factor settings"
          @click="reload"
        />
      </div>
    </template>

    <!-- Federated accounts manage MFA at their IdP -->
    <div v-if="isFederated" class="py-2 text-sm text-white/60">
      Two-factor authentication is managed by your identity provider.
    </div>

    <template v-else>
      <div v-if="loading && !loaded" class="flex justify-center py-8">
        <UIcon name="i-fa6-solid:spinner" class="h-5 w-5 animate-spin text-white/40" />
      </div>

      <div v-else class="flex flex-col gap-4">
        <p class="text-sm text-white/60">
          Add an authenticator app (Google Authenticator, 1Password, etc.) to protect your account
          with time-based codes.
        </p>

        <!-- Verified factors -->
        <ul v-if="verifiedFactors.length" class="flex flex-col gap-2">
          <li
            v-for="factor in verifiedFactors"
            :key="factor.id"
            class="flex items-center justify-between gap-3 rounded-lg border border-white/10 bg-white/5 p-3"
          >
            <div class="min-w-0">
              <div class="flex items-center gap-2">
                <UIcon name="i-fa6-solid:shield-halved" class="h-4 w-4 shrink-0 text-green-300" />
                <p class="truncate text-sm font-medium">{{ factor.name }}</p>
              </div>
              <p class="mt-0.5 text-xs text-white/50">Added {{ formatDate(factor.createdAt) }}</p>
            </div>
            <UButton
              color="error"
              variant="ghost"
              icon="i-fa6-solid:trash"
              size="sm"
              :loading="removingId === factor.id"
              @click="removeFactor(factor)"
            >
              Remove
            </UButton>
          </li>
        </ul>
        <div v-else class="rounded-lg border border-dashed border-white/10 p-4 text-center">
          <p class="text-sm text-white/60">No authenticators yet.</p>
        </div>

        <!-- Backup codes summary (only when 2FA is active) -->
        <div
          v-if="verifiedFactors.length"
          class="flex items-center justify-between gap-3 rounded-lg border border-white/10 bg-white/5 p-3"
        >
          <div class="min-w-0">
            <p class="text-sm font-medium">Backup codes</p>
            <p class="mt-0.5 text-xs text-white/50">
              {{ remainingBackupCodes }} remaining. Use these if you lose your authenticator.
            </p>
          </div>
          <UButton
            color="neutral"
            variant="soft"
            size="sm"
            icon="i-fa6-solid:key"
            @click="openRegenBackup"
          >
            Regenerate
          </UButton>
        </div>

        <div>
          <UButton color="primary" variant="soft" icon="i-fa6-solid:plus" block @click="openSetup">
            Add authenticator
          </UButton>
        </div>
      </div>
    </template>
  </UCard>

  <!-- Setup modal -->
  <UModal v-model:open="setupOpen">
    <template #header>
      <div class="flex items-center gap-3">
        <UIcon name="i-fa6-solid:shield-halved" class="h-5 w-5 text-primary-300" />
        <h3 class="text-lg font-semibold">
          {{ setupStep === 'backup' ? 'Save your backup codes' : 'Add authenticator' }}
        </h3>
      </div>
    </template>

    <template #body>
      <div class="space-y-4">
        <UAlert
          v-if="setupError"
          color="error"
          icon="i-fa6-solid:circle-exclamation"
          :title="setupError"
        />

        <!-- Step 1: name -->
        <div v-if="setupStep === 'name'" class="space-y-3">
          <UFormField label="Name" hint="e.g. iPhone, 1Password">
            <UInput v-model="factorName" class="w-full" placeholder="Authenticator" autofocus />
          </UFormField>
        </div>

        <!-- Step 2: scan / enter secret + verify -->
        <div v-else-if="setupStep === 'verify'" class="space-y-4">
          <p class="text-sm text-white/60">
            Add this key to your authenticator app, then enter the 6-digit code it shows.
          </p>

          <div class="rounded-lg border border-white/10 bg-white/5 p-3">
            <p class="text-xs uppercase tracking-[0.2em] text-white/40">Setup key</p>
            <div class="mt-1 flex items-center justify-between gap-2">
              <code class="break-all font-mono text-sm text-white/90">{{ setup?.secret }}</code>
              <UButton
                size="xs"
                color="neutral"
                variant="ghost"
                icon="i-fa6-regular:copy"
                square
                aria-label="Copy setup key"
                @click="copySecret"
              />
            </div>
          </div>

          <a
            v-if="setup?.setupUri"
            :href="setup.setupUri"
            class="flex items-center justify-center gap-2 rounded-lg border border-white/10 bg-white/5 py-2.5 text-sm font-medium text-primary-200"
          >
            <UIcon name="i-fa6-solid:up-right-from-square" class="h-4 w-4" />
            Open in authenticator app
          </a>

          <UFormField label="Verification code">
            <div class="flex justify-center">
              <UPinInput
                v-model="codeDigits"
                :length="6"
                type="text"
                otp
                placeholder="○"
                @complete="verify"
              />
            </div>
          </UFormField>
        </div>

        <!-- Step 3: backup codes -->
        <div v-else-if="setupStep === 'backup'" class="space-y-3">
          <p class="text-sm text-white/60">
            Store these somewhere safe. Each code works once if you lose access to your
            authenticator. They won't be shown again.
          </p>
          <div class="grid grid-cols-2 gap-2 rounded-lg border border-white/10 bg-white/5 p-3">
            <code v-for="code in backupCodes" :key="code" class="font-mono text-sm text-white/90">
              {{ code }}
            </code>
          </div>
          <UButton
            color="neutral"
            variant="soft"
            size="sm"
            icon="i-fa6-regular:copy"
            block
            @click="copyBackupCodes"
          >
            Copy all codes
          </UButton>
        </div>
      </div>
    </template>

    <template #footer>
      <div class="flex justify-end gap-3">
        <template v-if="setupStep === 'name'">
          <UButton color="neutral" variant="ghost" @click="setupOpen = false">Cancel</UButton>
          <UButton
            color="primary"
            :loading="busy"
            :disabled="!factorName.trim()"
            @click="startSetup"
          >
            Continue
          </UButton>
        </template>
        <template v-else-if="setupStep === 'verify'">
          <UButton color="neutral" variant="ghost" :disabled="busy" @click="setupOpen = false">
            Cancel
          </UButton>
          <UButton color="primary" :loading="busy" :disabled="code.length !== 6" @click="verify">
            Verify & enable
          </UButton>
        </template>
        <template v-else>
          <UButton color="primary" @click="finishSetup">Done</UButton>
        </template>
      </div>
    </template>
  </UModal>

  <!-- Regenerate backup codes modal -->
  <UModal v-model:open="regenOpen">
    <template #header>
      <div class="flex items-center gap-3">
        <UIcon name="i-fa6-solid:key" class="h-5 w-5 text-primary-300" />
        <h3 class="text-lg font-semibold">Regenerate backup codes</h3>
      </div>
    </template>
    <template #body>
      <div class="space-y-4">
        <UAlert
          v-if="regenError"
          color="error"
          icon="i-fa6-solid:circle-exclamation"
          :title="regenError"
        />
        <template v-if="!regenCodes.length">
          <p class="text-sm text-white/60">
            This invalidates your existing backup codes. Confirm your password to continue.
          </p>
          <UFormField label="Password">
            <UInput v-model="regenPassword" type="password" class="w-full" autofocus />
          </UFormField>
        </template>
        <template v-else>
          <p class="text-sm text-white/60">
            Your new backup codes. Old codes no longer work. These won't be shown again.
          </p>
          <div class="grid grid-cols-2 gap-2 rounded-lg border border-white/10 bg-white/5 p-3">
            <code v-for="code in regenCodes" :key="code" class="font-mono text-sm text-white/90">
              {{ code }}
            </code>
          </div>
          <UButton
            color="neutral"
            variant="soft"
            size="sm"
            icon="i-fa6-regular:copy"
            block
            @click="copyRegenCodes"
          >
            Copy all codes
          </UButton>
        </template>
      </div>
    </template>
    <template #footer>
      <div class="flex justify-end gap-3">
        <template v-if="!regenCodes.length">
          <UButton color="neutral" variant="ghost" :disabled="busy" @click="regenOpen = false">
            Cancel
          </UButton>
          <UButton color="primary" :loading="busy" :disabled="!regenPassword" @click="confirmRegen">
            Regenerate
          </UButton>
        </template>
        <template v-else>
          <UButton color="primary" @click="regenOpen = false">Done</UButton>
        </template>
      </div>
    </template>
  </UModal>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { koiosAccountApi, type TwoFactorFactor } from '@/lib/auth/koiosAccount'
import { getErrorMessage } from '@/lib/api/errors'

const props = defineProps<{ isFederated: boolean }>()

const emit = defineEmits<{
  notify: [kind: 'success' | 'error' | 'info', message: string]
  // Emitted whenever 2FA is enabled/disabled so the parent can refresh /me.
  changed: []
}>()

const loading = ref(false)
const loaded = ref(false)
const factors = ref<TwoFactorFactor[]>([])
const remainingBackupCodes = ref(0)
const removingId = ref<string | null>(null)
const busy = ref(false)

const verifiedFactors = computed(() => factors.value.filter((f) => f.verified))

async function reload() {
  if (props.isFederated) {
    loaded.value = true
    return
  }
  loading.value = true
  try {
    const data = await koiosAccountApi.list2FA()
    factors.value = data.factors
    remainingBackupCodes.value = data.remainingBackupCodes
    loaded.value = true
  } catch (error) {
    emit('notify', 'error', getErrorMessage(error, 'Failed to load two-factor settings'))
  } finally {
    loading.value = false
  }
}

defineExpose({ reload })

// --- Setup flow ------------------------------------------------------------
const setupOpen = ref(false)
const setupStep = ref<'name' | 'verify' | 'backup'>('name')
const setupError = ref('')
const factorName = ref('Authenticator')
const setup = ref<{ factorId: string; secret: string; setupUri: string } | null>(null)
const codeDigits = ref<string[]>([])
const backupCodes = ref<string[]>([])

const code = computed(() => codeDigits.value.join(''))

function openSetup() {
  setupStep.value = 'name'
  setupError.value = ''
  factorName.value = 'Authenticator'
  setup.value = null
  codeDigits.value = []
  backupCodes.value = []
  setupOpen.value = true
}

async function startSetup() {
  if (busy.value) return
  setupError.value = ''
  busy.value = true
  try {
    setup.value = await koiosAccountApi.addFactor(factorName.value.trim())
    setupStep.value = 'verify'
  } catch (error) {
    setupError.value = getErrorMessage(error, 'Failed to start setup')
  } finally {
    busy.value = false
  }
}

async function verify() {
  if (busy.value || !setup.value || code.value.length !== 6) return
  setupError.value = ''
  busy.value = true
  try {
    const result = await koiosAccountApi.verifyFactor(setup.value.factorId, code.value)
    if (result.backupCodes?.length) {
      backupCodes.value = result.backupCodes
      setupStep.value = 'backup'
    } else {
      setupOpen.value = false
      emit('notify', 'success', 'Authenticator added.')
    }
    await reload()
    emit('changed')
  } catch (error) {
    setupError.value = getErrorMessage(error, 'Invalid code')
    codeDigits.value = []
  } finally {
    busy.value = false
  }
}

function finishSetup() {
  setupOpen.value = false
  emit('notify', 'success', 'Two-factor authentication enabled.')
}

async function removeFactor(factor: TwoFactorFactor) {
  removingId.value = factor.id
  try {
    await koiosAccountApi.deleteFactor(factor.id)
    emit('notify', 'success', 'Authenticator removed.')
    await reload()
    emit('changed')
  } catch (error) {
    emit('notify', 'error', getErrorMessage(error, 'Failed to remove authenticator'))
  } finally {
    removingId.value = null
  }
}

// --- Backup code regeneration ---------------------------------------------
const regenOpen = ref(false)
const regenPassword = ref('')
const regenCodes = ref<string[]>([])
const regenError = ref('')

function openRegenBackup() {
  regenPassword.value = ''
  regenCodes.value = []
  regenError.value = ''
  regenOpen.value = true
}

async function confirmRegen() {
  if (busy.value) return
  regenError.value = ''
  busy.value = true
  try {
    const result = await koiosAccountApi.regenerateBackupCodes(regenPassword.value)
    regenCodes.value = result.backupCodes
    await reload()
  } catch (error) {
    regenError.value = getErrorMessage(error, 'Failed to regenerate backup codes')
  } finally {
    busy.value = false
  }
}

// --- Clipboard helpers -----------------------------------------------------
async function copyToClipboard(text: string, ok: string) {
  try {
    await navigator.clipboard.writeText(text)
    emit('notify', 'success', ok)
  } catch {
    emit('notify', 'error', 'Could not copy.')
  }
}
function copySecret() {
  if (setup.value) void copyToClipboard(setup.value.secret, 'Setup key copied.')
}
function copyBackupCodes() {
  void copyToClipboard(backupCodes.value.join('\n'), 'Backup codes copied.')
}
function copyRegenCodes() {
  void copyToClipboard(regenCodes.value.join('\n'), 'Backup codes copied.')
}

// --- Util ------------------------------------------------------------------
function formatDate(epochSeconds: number): string {
  return new Date(epochSeconds * 1000).toLocaleDateString()
}

onMounted(reload)
</script>
