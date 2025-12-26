<script setup lang="ts">
import { RouterView } from 'vue-router'
import { onMounted } from 'vue'

import AppLayout from './layouts/AppLayout.vue'
import { useAuthStore } from '@/stores/auth/auth'

const authStore = useAuthStore()

const hydrateAuth = async () => {
  if (!authStore.isLoggedIn) {
    await authStore.initialize()
  }
}

onMounted(async () => {
  await hydrateAuth()
})
</script>

<template>
  <AppLayout>
    <Suspense>
      <RouterView />
    </Suspense>
  </AppLayout>
</template>
