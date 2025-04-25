<template>
  <div class="flex items-center justify-between my-4 w-full">
    <USkeleton class="w-22 h-22 rounded-full" />
    <div class="flex flex-col items-end gap-5">
      <div class="flex gap-2 items-center">
        <UBadge>Status</UBadge>
        <h1 class="text-lg font-semibold">Device Name</h1>
      </div>
      <div class="flex items-center gap-4">
        <div class="inline-flex items-center text-lg gap-2">
          <UIcon name="feather:map-pin" class="w-4 h-4" />
          <span>Location</span>
        </div>
        <button to="/device/TODO-getid/settings" class="text-sm p-2 font-light rounded-full bg-gray-500">
          <UIcon name="feather:settings" class="h-5 w-5" />
        </button>
      </div>
    </div>
  </div>
</template>
