<script setup lang="ts">
import { RouterView } from 'vue-router'

import AppLayout from './layouts/AppLayout.vue'

// Auth hydration happens once in the router's beforeEach (single-flight in the
// store). Starting a second initialize() here raced the first and could
// overwrite a freshly rotated refresh token with the spent one.
</script>

<template>
  <AppLayout>
    <!-- Every view renders a single element root: out-in attaches its leave
         hooks to that element and only an element completes them. A view whose
         root is a Fragment (two root nodes, e.g. a div plus a sibling Teleport)
         leaves `isLeaving` stuck and every page after it renders blank. Keep
         Teleports INSIDE the root element. -->
    <RouterView v-slot="{ Component }">
      <Transition name="page" mode="out-in">
        <component :is="Component" />
      </Transition>
    </RouterView>
  </AppLayout>
</template>
