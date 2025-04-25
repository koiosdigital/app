<template>
  <DetailPageView :backEnabled="false" title="Add Device">
    <UStepper v-model="activeStep" :items="addDeviceSteps" class="w-full mb-6" />
    <div class="flex-grow gap-6 flex flex-col justify-center h-full">
      <UPageCard variant="subtle">
        <template #header>
          <h2 class="text-lg font-semibold">Pick Device</h2>
        </template>
        < </UPageCard>
    </div>
  </DetailPageView>
</template>

  <script setup lang="ts">
  import { useAuthStore } from '@/stores/auth/auth';
  import type { StepperItem } from '@nuxt/ui';
  import { useRouter } from 'vue-router';
  import { useBleProvStore } from '@/stores/ble_prov/ble_prov';
  import { ref } from 'vue';
  import DetailPageView from '@/layouts/DetailPageView.vue';

  const addDeviceSteps: StepperItem[] = [
    {
      title: 'Connect',
      icon: 'i-feather-share-2'
    }, {
      title: 'WiFi',
      icon: 'i-feather-wifi'
    }, {
      title: 'Done',
      icon: 'i-feather-check'
    }
  ]

  const activeStep = ref(0);

  const bleProvStore = useBleProvStore();
  const authStore = useAuthStore();
  const router = useRouter();
</script>