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
        <h1 class="text-xl font-semibold">WiFi Setup</h1>
      </div>
    </header>

    <!-- Content -->
    <div class="flex flex-1 flex-col gap-6 p-5">
      <div class="space-y-2">
        <h2 class="text-lg font-medium text-white/90">Connect to WiFi</h2>
        <p class="text-sm text-white/60">
          Select your WiFi network to connect the device to the internet.
        </p>
      </div>

      <!-- Scanning State -->
      <div v-if="bleStore.wifi.scanningForAPs" class="flex items-center justify-center py-8">
        <div class="space-y-3 text-center">
          <UIcon name="i-lucide-loader-2" class="h-12 w-12 animate-spin text-primary-400 mx-auto" />
          <p class="text-sm text-white/70">Scanning for networks...</p>
        </div>
      </div>

      <!-- Network List -->
      <div v-else-if="bleStore.wifi.discoveredAPs.length" class="space-y-3">
        <div class="space-y-2">
          <button
            v-for="ap in sortedNetworks"
            :key="ap.ssid"
            class="flex w-full items-center justify-between rounded-lg border border-white/10 bg-white/5 p-4 transition hover:bg-white/10"
            :disabled="bleStore.wifi.connectingToAP?.ssid === ap.ssid"
            @click="selectNetwork(ap)"
          >
            <div class="flex items-center gap-3">
              <UIcon
                :name="ap.auth === 0 ? 'i-lucide-wifi' : 'i-lucide-lock'"
                class="h-5 w-5"
                :class="getSignalColor(ap.rssi)"
              />
              <div class="text-left">
                <p class="font-medium">{{ ap.ssid }}</p>
                <p class="text-xs text-white/50">
                  {{ getSecurityLabel(ap.auth) }}
                </p>
              </div>
            </div>
            <div class="flex items-center gap-2">
              <span class="text-xs text-white/50">{{ getSignalStrength(ap.rssi) }}%</span>
              <UIcon name="i-lucide-chevron-right" class="h-5 w-5 text-white/40" />
            </div>
          </button>
        </div>

        <div class="flex gap-3">
          <UButton color="neutral" variant="soft" class="flex-1" @click="scanNetworks">
            Scan Again
          </UButton>
          <UButton color="neutral" variant="soft" class="flex-1" @click="showOtherNetworkModal">
            Other Network
          </UButton>
        </div>
      </div>

      <!-- No Networks Found -->
      <div v-else class="space-y-4">
        <div
          class="flex flex-col items-center justify-center rounded-lg border border-dashed border-white/20 py-12 text-center"
        >
          <UIcon name="i-lucide-wifi-off" class="h-12 w-12 text-white/40" />
          <p class="mt-4 text-sm text-white/70">No networks found</p>
          <p class="mt-1 text-xs text-white/50">Make sure WiFi is enabled on your device</p>
        </div>

        <UButton color="primary" block @click="scanNetworks"> Scan for Networks </UButton>
      </div>

      <!-- Connecting Modal -->
      <div
        v-if="bleStore.wifi.connectingToAP && !bleStore.wifi.connectedToAP"
        class="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-5"
      >
        <div
          class="w-full max-w-md space-y-6 rounded-lg border border-white/10 bg-zinc-900 p-6 text-center"
        >
          <div class="flex flex-col items-center gap-4">
            <UIcon name="i-lucide-loader-2" class="h-12 w-12 animate-spin text-primary-400" />
            <div>
              <h2 class="text-lg font-semibold">
                Connecting to {{ bleStore.wifi.connectingToAP.ssid }}
              </h2>
              <p class="mt-2 text-sm text-white/60">
                Your device is connecting to the WiFi network. This may take up to 30 seconds.
              </p>
            </div>
          </div>
        </div>
      </div>

      <!-- Connection Success -->
      <div
        v-if="bleStore.wifi.connectedToAP"
        class="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-5"
      >
        <div
          class="w-full max-w-md space-y-6 rounded-lg border border-primary-500/20 bg-zinc-900 p-6"
        >
          <div class="flex items-center gap-3">
            <UIcon name="i-lucide-check-circle" class="h-8 w-8 text-primary-400" />
            <div>
              <h2 class="text-lg font-semibold text-primary-400">Connected!</h2>
              <p class="text-sm text-white/70">Device is online</p>
            </div>
          </div>

          <UButton color="primary" size="lg" block @click="finishSetup"> Finish Setup </UButton>
        </div>
      </div>
    </div>

    <!-- Password Modal -->
    <UModal v-model:open="showPasswordModal">
      <template #header>
        <div>
          <h2 class="text-lg font-semibold">Enter Password</h2>
          <p class="mt-1 text-sm text-white/60">WiFi password for "{{ selectedAP?.ssid }}"</p>
        </div>
      </template>

      <template #body>
        <div class="space-y-2">
          <label for="wifi-password" class="block text-sm font-medium text-white/90">
            Password
          </label>
          <UInput
            id="wifi-password"
            v-model="password"
            type="password"
            placeholder="Enter WiFi password"
            size="lg"
            @keyup.enter="isPasswordValid && connectToNetwork()"
          />
          <p v-if="password && !isPasswordValid" class="text-xs text-red-400">
            Password must be at least 8 characters long
          </p>
        </div>
      </template>

      <template #footer>
        <div class="flex gap-3">
          <UButton color="neutral" variant="soft" block @click="showPasswordModal = false">
            Cancel
          </UButton>
          <UButton
            color="primary"
            block
            :disabled="!isPasswordValid"
            :loading="isConnecting"
            @click="connectToNetwork"
          >
            Connect
          </UButton>
        </div>
      </template>
    </UModal>

    <!-- Other Network Modal -->
    <UModal v-model:open="showOtherNetworkModalOpen">
      <template #header>
        <div>
          <h2 class="text-lg font-semibold">Connect to Other Network</h2>
          <p class="mt-1 text-sm text-white/60">Enter network name and password</p>
        </div>
      </template>

      <template #body>
        <div class="space-y-4">
          <div class="space-y-2">
            <label for="other-network-ssid" class="block text-sm font-medium text-white/90">
              Network Name (SSID)
            </label>
            <UInput
              id="other-network-ssid"
              v-model="otherNetworkSsid"
              placeholder="Enter network name"
              size="lg"
            />
          </div>
          <div class="space-y-2">
            <label for="other-network-password" class="block text-sm font-medium text-white/90">
              Password
            </label>
            <UInput
              id="other-network-password"
              v-model="otherNetworkPassword"
              type="password"
              placeholder="Leave empty if open network"
              size="lg"
              @keyup.enter="isOtherNetworkValid && connectToOtherNetwork()"
            />
            <p
              v-if="otherNetworkPassword && otherNetworkPassword.length < 8"
              class="text-xs text-red-400"
            >
              Password must be at least 8 characters long
            </p>
          </div>
        </div>
      </template>

      <template #footer>
        <div class="flex gap-3">
          <UButton color="neutral" variant="soft" block @click="showOtherNetworkModalOpen = false">
            Cancel
          </UButton>
          <UButton
            color="primary"
            block
            :disabled="!isOtherNetworkValid"
            :loading="isConnecting"
            @click="connectToOtherNetwork"
          >
            Connect
          </UButton>
        </div>
      </template>
    </UModal>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useBleProvStore, type WifiAP } from '@/stores/ble_prov'
import { getSignalStrength, WIFI_SECURITY_LABELS } from '@/utils/wifi'

const router = useRouter()
const bleStore = useBleProvStore()

const showPasswordModal = ref(false)
const showOtherNetworkModalOpen = ref(false)
const selectedAP = ref<WifiAP | undefined>(undefined)
const password = ref('')
const isConnecting = ref(false)
const otherNetworkSsid = ref('')
const otherNetworkPassword = ref('')

const sortedNetworks = computed(() => {
  // Merge networks with same SSID, keeping the one with strongest signal
  const merged = new Map<string, WifiAP>()

  for (const ap of bleStore.wifi.discoveredAPs) {
    const existing = merged.get(ap.ssid)
    if (!existing || ap.rssi > existing.rssi) {
      merged.set(ap.ssid, ap)
    }
  }

  // Sort by signal strength (strongest first)
  return Array.from(merged.values()).sort((a, b) => b.rssi - a.rssi)
})

const isPasswordValid = computed(() => {
  return password.value.length >= 8
})

const isOtherNetworkValid = computed(() => {
  if (!otherNetworkSsid.value) return false
  if (otherNetworkPassword.value && otherNetworkPassword.value.length < 8) return false
  return true
})

function getSecurityLabel(auth: number): string {
  return WIFI_SECURITY_LABELS[auth] || 'Unknown'
}

function getSignalColor(rssi: number): string {
  const strength = getSignalStrength(rssi)
  if (strength >= 75) return 'text-primary-400'
  if (strength >= 50) return 'text-yellow-400'
  return 'text-red-400'
}

async function scanNetworks() {
  try {
    await bleStore.wifi.scanForAPs()
  } catch (error) {
    console.error('Failed to scan networks:', error)

    // Check if it's a GATT error
    if (bleStore.isGattError(error)) {
      bleStore.setGattError(error)
      router.replace('/setup/new')
    }
  }
}

function selectNetwork(ap: WifiAP) {
  selectedAP.value = ap

  // If network is open (auth = 0), connect directly
  if (ap.auth === 0) {
    connectToNetwork()
  } else {
    // Show password modal for secured networks
    password.value = ''
    showPasswordModal.value = true
  }
}

function showOtherNetworkModal() {
  otherNetworkSsid.value = ''
  otherNetworkPassword.value = ''
  showOtherNetworkModalOpen.value = true
}

async function connectToOtherNetwork() {
  if (!otherNetworkSsid.value) return

  isConnecting.value = true

  try {
    // Create a fake WifiAP object for the manual network
    const manualAP: WifiAP = {
      ssid: otherNetworkSsid.value,
      bssid: '',
      rssi: 0,
      channel: 0,
      auth: otherNetworkPassword.value ? 3 : 0, // Assume WPA2 if password provided
    }

    const success = await bleStore.wifi.connectToAP(
      manualAP,
      otherNetworkPassword.value || undefined
    )

    if (success) {
      showOtherNetworkModalOpen.value = false
    } else {
      console.error('Failed to connect to network')
    }
  } catch (error) {
    console.error('Connection error:', error)

    // Check if it's a GATT error
    if (bleStore.isGattError(error)) {
      bleStore.setGattError(error)
      router.replace('/setup/new')
      return
    }
  } finally {
    isConnecting.value = false
  }
}

async function connectToNetwork() {
  if (!selectedAP.value) return

  isConnecting.value = true

  try {
    const success = await bleStore.wifi.connectToAP(
      selectedAP.value,
      selectedAP.value.auth === 0 ? undefined : password.value
    )

    if (success) {
      showPasswordModal.value = false
    } else {
      console.error('Failed to connect to network')
    }
  } catch (error) {
    console.error('Connection error:', error)

    // Check if it's a GATT error
    if (bleStore.isGattError(error)) {
      bleStore.setGattError(error)
      router.replace('/setup/new')
      return
    }
  } finally {
    isConnecting.value = false
  }
}

async function finishSetup() {
  // Disconnect BLE
  await bleStore.connection.disconnectDevice()

  // Navigate to success page
  router.push('/setup/successful')
}

onMounted(async () => {
  // Redirect if no device connected
  if (!bleStore.connection.connectedDevice) {
    bleStore.setGattError(new Error('Device disconnected before WiFi setup'))
    router.replace('/setup/new')
    return
  }

  // Start scanning for networks
  await scanNetworks()
})
</script>
