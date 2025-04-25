<template>
  <UApp>
    <div class="flex flex-col h-screen w-screen safe-area" v-if="authStore.isLoggedIn">
      <div class="flex flex-grow overflow-y-auto p-4">
        <slot />
      </div>
      <div class="flex-shrink-0">
        <USeparator />
        <div class="w-full p-4 flex justify-evenly">
          <RouterLink v-for="item in items" :key="item.label" class="text-sm text-gray-500 hover:text-gray-700"
            active-class="text-white" :to="item.to">
            <UIcon :name="item.icon" class="size-5" />
          </RouterLink>
        </div>
      </div>
    </div>
    <div v-else class="h-screen w-screen">
      <slot />
    </div>
  </UApp>
</template>

<script setup lang="ts">
import { useAuthStore } from '@/stores/auth/auth';
const authStore = useAuthStore();

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
