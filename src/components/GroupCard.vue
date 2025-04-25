<template>
  <UPageCard class="w-full h-full flex items-center justify-center rounded-2xl" variant="subtle">
    <template #header>
      <div class="flex flex-col gap-1">
        <div class="flex items-center">
          <h1 class="text-xl font-semibold">Group Name</h1>
          <UIcon name="feather:edit" class="h-4 w-4 ml-4" />
        </div>
        <h1 class="text-md font-light">2 Devices</h1>
      </div>
    </template>
    <div class="flex flex-col items-center">
      <GroupedDeviceItem />
      <USeparator />
      <GroupedDeviceItem />
      <USeparator />
    </div>
  </UPageCard>
</template>
