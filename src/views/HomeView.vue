<template>
  <div class="flex flex-col overflow-y-auto pb-8">
    <div class="h-28 flex items-center justify-between">
      <UButton @click="router.push('/add/device')" size="xl" color="neutral" leading-icon="feather:plus">Add Device
      </UButton>
      <button @click="router.push('/settings')" class="text-white">
        <UIcon name="feather:settings" class="h-7 w-7"></UIcon>
      </button>
    </div>
    <h1 class="text-3xl font-semibold mb-10">Lantern</h1> <!-- TODO: Logo -->

    <!-- Groups -->
    <h1 class="text-2xl font-medium text-center mb-4">My Groups</h1> <!-- TODO: Logo -->
    <div class="flex-grow gap-6 flex flex-col">
      <GroupCard />
      <GroupCard />
      <USeparator />
      <div class="flex items-center justify-center">
        <UButton size="xl" color="neutral" leading-icon="feather:users" to="/add/group">New Group</UButton>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useAuthStore } from '@/stores/auth/auth';
import { useBleProvStore } from '@/stores/ble_prov/ble_prov';
import { ref } from 'vue';
import { useRouter } from 'vue-router';

const authStore = useAuthStore();
const router = useRouter();
</script>
