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
    <!-- Routes are eagerly imported and no view uses async setup, so a page swap
         is synchronous — no <Suspense> needed. (Wrapping in Suspense presented a
         comment placeholder mid-transition, which out-in can't animate and which
         intermittently left the page blank on back/swipe.) Each view has a single
         element root, so out-in can animate it and keep the two screens from
         overlapping inside PageLayout's flex column. -->
    <RouterView v-slot="{ Component }">
      <Transition name="page" mode="out-in">
        <component :is="Component" />
      </Transition>
    </RouterView>
  </AppLayout>
</template>
