<script setup lang="ts">
import { RouterView } from 'vue-router'
import AppLayout from './layouts/AppLayout.vue';

import { useAuthStore } from '@/stores/auth/auth';
import { useRouter } from 'vue-router';
import { onMounted } from 'vue';

const authStore = useAuthStore();
const router = useRouter();

onMounted(async () => {
  if (!authStore.isLoggedIn) {
    await authStore.initialize();
  }

  if (!authStore.isLoggedIn) {
    router.push('/login');
  }
});
</script>

<template>
  <AppLayout>
    <RouterView />
  </AppLayout>
</template>
