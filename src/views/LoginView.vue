<template>
  <div class="w-full h-full flex items-center justify-center absolute">
    <!-- background image -->
    <div class="absolute inset-0 bg-cover bg-center z-0 blur-xs opacity-60"
      style="background-image: url('https://picsum.photos/1920/1080')">
    </div>
    <div class="z-10 flex flex-col justify-between h-full p-28 items-center">
      <h1 class="text-5xl font-semibold">Lantern</h1>
      <UButton size="xl" trailing-icon="lucide:arrow-right" color="neutral" @click="startLogin">Login to continue
      </UButton>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useAuthStore } from '@/stores/auth/auth';
import { watch } from 'vue';

const authStore = useAuthStore();

const startLogin = () => {
  authStore.beginAuthentication();
};

watch(
  () => authStore.isLoggedIn,
  (isLoggedIn) => {
    if (isLoggedIn) {
      window.location.href = '/';
    }
  },
  { immediate: true }
);
</script>
