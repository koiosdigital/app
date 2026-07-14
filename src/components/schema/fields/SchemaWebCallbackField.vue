<template>
  <div class="space-y-3">
    <!-- Connected State -->
    <div
      v-if="isConnected"
      class="flex items-center gap-3 rounded-lg border border-green-500/20 bg-green-500/10 p-4"
    >
      <UIcon name="i-fa6-solid:circle-check" class="h-5 w-5 shrink-0 text-green-400" />
      <div class="min-w-0 flex-1">
        <p class="font-medium text-green-400">Connected</p>
        <p class="truncate text-xs text-white/60">Account linked</p>
      </div>
      <UButton color="neutral" variant="ghost" size="sm" @click="disconnect"> Disconnect </UButton>
    </div>

    <!-- Not Connected State -->
    <div v-else class="rounded-lg border border-white/10 bg-white/5 p-4">
      <UButton
        color="primary"
        variant="soft"
        block
        :loading="flow.isConnecting.value"
        @click="startLogin"
      >
        <UIcon name="i-fa6-solid:arrow-up-right-from-square" class="mr-2 h-4 w-4" />
        Connect
      </UButton>
    </div>

    <p v-if="error || flow.error.value" class="text-xs text-red-400">
      {{ error || flow.error.value }}
    </p>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { components } from '@/types/api'
import { appsApi } from '@/lib/api/apps'
import { useWebCallbackFlow, getOAuthCallbackUri } from '@/composables/useOAuthFlow'
import { encodeState } from '@/utils/oauthState'

// Generic web-callback login (webcallback schema fields) — provider auth
// flows that aren't OAuth2, e.g. last.fm's token handshake. The popup opens
// the field's authorization_endpoint with our /oauth/callback URL in
// redirect_param; every query param the callback lands with (plus
// callback_url) is passed to the field's handler, which exchanges them for
// the config value to store.

type WebCallbackField = components['schemas']['AppSchemaWebCallbackFieldDto']

const props = defineProps<{
  field: WebCallbackField
  value: unknown
  error?: string
  appId: string
  deviceId?: string
  installationId?: string
  mode: 'install' | 'edit'
  formValues?: Record<string, unknown>
  displayTime?: number
  skippedByUser?: boolean
}>()

const emit = defineEmits<{
  (e: 'update:value', value: string): void
}>()

function buildConfig(): Record<string, string> {
  const config: Record<string, string> = {}
  if (props.formValues) {
    for (const [k, v] of Object.entries(props.formValues)) {
      if (v != null) config[k] = String(v)
    }
  }
  return config
}

const isConnected = computed(() => !!props.value && props.value !== '')

// The exact redirect URL handed to the provider, so the handler receives it
// verbatim as callback_url.
let redirectUrl = ''

const flow = useWebCallbackFlow({
  onSuccess: async (params) => {
    try {
      const result = await appsApi.callHandler(
        props.appId,
        props.field.handler,
        buildConfig(),
        JSON.stringify({ ...params, callback_url: redirectUrl }),
      )

      if (result?.result) {
        emit('update:value', result.result)
      }
    } catch (err) {
      console.error('Web callback handler error:', err)
    }
  },
  onError: (err) => {
    console.error('Web callback error:', err)
  },
})

function startLogin() {
  if (!props.field.authorization_endpoint) {
    console.error('Web callback field missing authorization_endpoint')
    return
  }

  const callback = new URL(getOAuthCallbackUri())
  if (props.field.redirect_param) {
    // No state param on the authorization request — the provider echoes the
    // callback URL verbatim, so the state rides inside it instead. Without
    // redirect_param the provider redirects to its pre-registered callback
    // and nothing extra survives the round trip.
    callback.searchParams.set(
      'state',
      encodeState({
        fieldId: props.field.id,
        appId: props.appId,
        deviceId: props.deviceId,
        installationId: props.installationId,
        mode: props.mode,
      }),
    )
  }
  redirectUrl = callback.toString()

  const url = new URL(props.field.authorization_endpoint)
  if (props.field.redirect_param) {
    url.searchParams.set(props.field.redirect_param, redirectUrl)
  }

  flow.startFlow(url.toString(), redirectUrl, props.field.success_param)
}

function disconnect() {
  emit('update:value', '')
}
</script>
