<template>
  <UApp>
    <div class="h-screen w-screen safe-area overflow-y-auto" v-if="authStore.isLoggedIn">
      <div class="px-6 flex flex-col min-h-screen">
        <slot />
      </div>
    </div>
    <div v-else>
      <slot />
    </div>
  </UApp>
</template>

<script setup lang="ts">
import { useAuthStore } from '@/stores/auth/auth';
import { useRouter } from 'vue-router';
const authStore = useAuthStore();
const router = useRouter();

const items = [
  {
    label: 'Home',
    to: '/',
    icon: 'fa-solid:home',
  },
  {
    label: 'Settings',
    to: '/settings',
    icon: 'fa-solid:cog',
  }
]
</script>

<style scoped>
.safe-area {
  padding-top: env(safe-area-inset-top);
  padding-right: env(safe-area-inset-right);
  padding-bottom: env(safe-area-inset-bottom);
  padding-left: env(safe-area-inset-left);
}
</style>
