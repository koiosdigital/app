<template>
  <div class="flex min-h-screen flex-col bg-zinc-950">
    <!-- Header -->
    <header
      class="sticky top-0 z-10 border-b border-white/10 bg-zinc-950/95 backdrop-blur px-5 py-4"
    >
      <div class="flex items-center gap-4">
        <UButton
          color="neutral"
          variant="ghost"
          icon="i-lucide-arrow-left"
          square
          @click="router.back()"
        />
        <h1 class="text-xl font-semibold">Add Device</h1>
      </div>
    </header>

    <!-- Content -->
    <div class="flex flex-1 flex-col items-center p-5">
      <div class="w-full max-w-md space-y-6">
        <!-- Error Alert -->
        <UAlert
          v-if="error"
          icon="i-lucide-alert-circle"
          color="error"
          :title="error.title"
          :description="error.description"
        />

        <!-- Matrix Device - 6-Digit PoP Code -->
        <div v-if="deviceType === 'matrix'" class="space-y-4">
          <div class="space-y-2">
            <h2 class="text-lg font-medium text-white/90">Enter Pairing Code</h2>
            <p class="text-sm text-white/60">
              Enter the 6-digit code displayed on your Matrix device to establish a secure
              connection.
            </p>
          </div>

          <!-- 6-Digit OTP Input -->
          <div class="flex justify-center gap-2">
            <input
              v-for="(_digit, index) in popDigits"
              :key="index"
              :ref="(el) => setInputRef(el, index)"
              v-model="popDigits[index]"
              type="text"
              inputmode="numeric"
              pattern="[0-9]*"
              maxlength="1"
              class="h-14 w-12 rounded-lg border border-white/20 bg-white/5 text-center text-2xl font-semibold text-white focus:border-primary-400 focus:outline-none focus:ring-2 focus:ring-primary-400/50"
              :disabled="isProcessing"
              @input="(e) => handleInput(e, index)"
              @keydown="(e) => handleKeyDown(e, index)"
              @paste="handlePaste"
            />
          </div>

          <UButton
            color="primary"
            size="lg"
            block
            :disabled="!isPopCodeComplete || isProcessing"
            :loading="isProcessing"
            @click="proceedToCrypto"
          >
            Continue
          </UButton>
        </div>

        <!-- Lantern Device - Color Sequence Selector (6 colors = 6 digits) -->
        <div v-else class="space-y-4">
          <div class="space-y-2">
            <h2 class="text-lg font-medium text-white/90">Select Color Sequence</h2>
            <p class="text-sm text-white/60">
              Match the 6-color sequence displayed on your Lantern device.
            </p>
          </div>

          <!-- 6 Color Position Selectors -->
          <div class="space-y-3">
            <div v-for="(_color, index) in selectedColors" :key="index" class="space-y-2">
              <label class="text-xs font-medium text-white/70">Position {{ index + 1 }}</label>
              <div class="grid grid-cols-6 gap-2">
                <button
                  v-for="option in colorMap"
                  :key="option.digit"
                  class="flex h-12 w-full items-center justify-center rounded-lg border transition"
                  :class="
                    selectedColors[index] === option.digit
                      ? 'border-primary-400 bg-primary-400/20'
                      : 'border-white/10 bg-white/5 hover:bg-white/10'
                  "
                  :disabled="isProcessing"
                  @click="selectedColors[index] = option.digit"
                >
                  <div
                    class="h-8 w-8 rounded-full border border-white/20"
                    :style="{ backgroundColor: option.hex }"
                  />
                </button>
              </div>
            </div>
          </div>

          <UButton
            color="primary"
            size="lg"
            block
            :disabled="!isLanternComplete || isProcessing"
            :loading="isProcessing"
            @click="proceedToCrypto"
          >
            Continue
          </UButton>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useBleProvStore } from '@/stores/ble_prov'

const router = useRouter()
const bleStore = useBleProvStore()

// Determine device type based on connected device name prefix
const deviceType = computed(() => {
  const deviceName = bleStore.connection.connectedDevice?.name || ''
  if (deviceName.startsWith('MATRX-')) {
    return 'matrix'
  } else if (deviceName.startsWith('LANTERN-')) {
    return 'lantern'
  }
  // Default to lantern if prefix doesn't match
  return 'lantern'
})

// Matrix - 6-Digit PoP Code
const popDigits = ref<string[]>(['', '', '', '', '', ''])
const inputRefs = ref<(HTMLInputElement | null)[]>([])

const isPopCodeComplete = computed(() => {
  return popDigits.value.every((digit) => digit !== '')
})

const popToken = computed(() => {
  return popDigits.value.join('')
})

function setInputRef(el: unknown, index: number) {
  if (el instanceof HTMLInputElement) {
    inputRefs.value[index] = el
  }
}

function handleInput(event: Event, index: number) {
  const target = event.target as HTMLInputElement
  const value = target.value

  // Only allow numeric input
  if (!/^\d*$/.test(value)) {
    popDigits.value[index] = ''
    return
  }

  // Update the digit
  popDigits.value[index] = value.slice(-1)

  // Auto-advance to next input
  if (value && index < 5) {
    inputRefs.value[index + 1]?.focus()
  }
}

function handleKeyDown(event: KeyboardEvent, index: number) {
  // Handle backspace - move to previous input if current is empty
  if (event.key === 'Backspace' && !popDigits.value[index] && index > 0) {
    inputRefs.value[index - 1]?.focus()
  }
}

function handlePaste(event: ClipboardEvent) {
  event.preventDefault()
  const pastedData = event.clipboardData?.getData('text') || ''
  const digits = pastedData.replace(/\D/g, '').slice(0, 6).split('')

  // Fill in the digits
  digits.forEach((digit, index) => {
    if (index < 6) {
      popDigits.value[index] = digit
    }
  })

  // Focus the next empty input or the last one
  const nextEmptyIndex = popDigits.value.findIndex((d) => !d)
  if (nextEmptyIndex !== -1) {
    inputRefs.value[nextEmptyIndex]?.focus()
  } else {
    inputRefs.value[5]?.focus()
  }
}

// Lantern - Color Selection (maps 6 digits 0-5 to colors)
const selectedColors = ref<string[]>(['', '', '', '', '', ''])

// Color mapping for Lantern (digits 0-5)
const colorMap = [
  { digit: '0', name: 'Red', hex: '#ef4444' },
  { digit: '1', name: 'Orange', hex: '#f97316' },
  { digit: '2', name: 'Yellow', hex: '#fbbf24' },
  { digit: '3', name: 'Green', hex: '#22c55e' },
  { digit: '4', name: 'Blue', hex: '#3b82f6' },
  { digit: '5', name: 'Purple', hex: '#a855f7' },
]

const isLanternComplete = computed(() => {
  return selectedColors.value.every((color) => color !== '')
})

const isProcessing = ref(false)
const error = ref<{ title: string; description: string } | undefined>(undefined)

async function proceedToCrypto() {
  if (!bleStore.connection.connectedDevice) {
    console.error('No device connected')
    return
  }

  // Clear previous error
  error.value = undefined
  isProcessing.value = true

  try {
    const pop = deviceType.value === 'matrix' ? popToken.value : selectedColors.value.join('')

    // Establish secure session with the PoP token
    await bleStore.session.establishSession(pop)

    console.log('Session established successfully')

    // Navigate to encipherment params step (handles DS params backup/recovery)
    router.push('/setup/encipherment_params')
  } catch (err) {
    console.error('Failed to establish session:', err)

    // Check if it's a GATT error
    if (bleStore.isGattError(err)) {
      bleStore.setGattError(err)
      router.replace('/setup/new')
      return
    }

    error.value = {
      title: 'Session Error',
      description:
        'Failed to establish a secure session with the device. Please verify the proof of possession code and try again.',
    }
  } finally {
    isProcessing.value = false
  }
}

onMounted(() => {
  // Redirect if no device connected
  if (!bleStore.connection.connectedDevice) {
    router.replace('/setup/new')
  }
})
</script>
