<template>
  <button @click="bleProvStore.initializeBluetooth">
    Initialize Bluetooth
  </button>
  <button @click="bleProvStore.startScan()">
    start
  </button>
  <input type="text" v-model="pop" />
  <button @click="bleProvStore.establishSession(pop)">
    Connect
  </button>
  {{ bleProvStore.connectedDeviceServiceMap }}
</template>

<script setup lang="ts">
import { useAuthStore } from '@/stores/auth/auth';
import { useBleProvStore } from '@/stores/ble_prov/ble_prov';
import { ref } from 'vue';

const authStore = useAuthStore();
const pop = ref("");
const bleProvStore = useBleProvStore();


window.runKD = bleProvStore.runKDConsoleCommand;
</script>
