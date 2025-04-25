<template>
  <div class="flex flex-col flex-grow pb-8 h-full">
    <div class="h-28 flex items-center justify-center">
      <div class="flex-1 flex items-center justify-start">
        <UButton :disabled="!props.backEnabled" @click="router.back()" size="sm" color="neutral"
          leading-icon="feather:chevron-left">Back
        </UButton>
      </div>
      <h1 class="text-xl font-semibold text-center flex-grow">{{ props.title }}</h1>
      <div class="flex-1" />
    </div>
    <slot />
  </div>
</template>

<script setup lang="ts">
import { useRouter } from 'vue-router';

const router = useRouter();

const props = defineProps({
  backEnabled: {
    type: Boolean,
    default: true
  },
  title: {
    type: String,
    default: ''
  }
});
</script>
