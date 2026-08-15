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
    <!-- Routes are eagerly imported, so a page swap is synchronous and the
         crossover has nothing to wait on. out-in keeps the two screens from
         overlapping inside PageLayout's flex column. -->
    <RouterView v-slot="{ Component }">
      <Transition name="page" mode="out-in">
        <Suspense>
          <component :is="Component" />
        </Suspense>
      </Transition>
    </RouterView>
  </AppLayout>
</template>
