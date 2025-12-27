<template>
  <div class="space-y-3">
    <!-- Connected State -->
    <div
      v-if="isConnected"
      class="flex items-center gap-3 rounded-lg border border-green-500/20 bg-green-500/10 p-4"
    >
      <UIcon name="i-lucide-check-circle" class="h-5 w-5 shrink-0 text-green-400" />
      <div class="min-w-0 flex-1">
        <p class="font-medium text-green-400">Connected</p>
        <p v-if="connectionInfo" class="truncate text-xs text-white/60">{{ connectionInfo }}</p>
      </div>
      <UButton color="neutral" variant="ghost" size="sm" @click="disconnect">
        Disconnect
      </UButton>
    </div>

    <!-- Not Connected State -->
    <div v-else class="rounded-lg border border-white/10 bg-white/5 p-4">
      <div class="flex items-center gap-3">
        <UIcon name="i-lucide-key" class="h-8 w-8 shrink-0 text-white/40" />
        <div class="flex-1">
          <p class="font-medium">{{ field.name || 'Connect Account' }}</p>
          <p v-if="field.description" class="text-xs text-white/50">{{ field.description }}</p>
        </div>
      </div>

      <UButton
        color="primary"
        variant="soft"
        block
        class="mt-4"
        :loading="oauthFlow.isConnecting.value"
        @click="startOAuth"
      >
        <UIcon name="i-lucide-external-link" class="mr-2 h-4 w-4" />
        Connect
      </UButton>
    </div>

    <p v-if="error || oauthFlow.error.value" class="text-xs text-red-400">
      {{ error || oauthFlow.error.value }}
    </p>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { Capacitor } from '@capacitor/core'
import type { components } from '@/types/api'
import { appsApi } from '@/lib/api/apps'
import { useOAuthFlow } from '@/composables/useOAuthFlow'
import { encodeState } from '@/utils/oauthState'
import { ENV } from '@/config/environment'

type OAuthField =
  | components['schemas']['AppSchemaOAuth2FieldDto']
  | components['schemas']['AppSchemaOAuth1FieldDto']

const props = defineProps<{
  field: OAuthField
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

// Check if we have a real OAuth token, not just a placeholder
const isConnected = computed(() => {
  if (!props.value || props.value === '') return false
  return true
})
const connectionInfo = computed(() => {
  if (!props.value) return null
  // Could parse token to show account info if available
  return 'Account linked'
})

function getRedirectUri(): string {
  let baseUrl = Capacitor.isNativePlatform() ? ENV.appNativeUrl : window.location.origin
  // OAuth providers often don't accept localhost - use 127.0.0.1 instead
  baseUrl = baseUrl.replace('://localhost', '://127.0.0.1')
  return `${baseUrl}/oauth/callback`
}

const oauthFlow = useOAuthFlow({
  onSuccess: async (code, _state) => {
    try {
      // Call handler with OAuth params
      const handlerName = props.field.handler || `${props.field.id}_handler`
      const result = await appsApi.callHandler(
        props.appId,
        handlerName,
        JSON.stringify({
          code,
          grant_type: 'authorization_code',
          client_id: props.field.client_id,
          redirect_uri: getRedirectUri(),
        })
      )

      if (result?.result) {
        emit('update:value', result.result)
      }
    } catch (err) {
      console.error('OAuth handler error:', err)
    }
  },
  onError: (err) => {
    console.error('OAuth error:', err)
  },
})

function startOAuth() {
  if (!props.field.authorization_endpoint || !props.field.client_id) {
    console.error('OAuth field missing required properties')
    return
  }

  // Build state parameter
  const stateData = encodeState({
    fieldId: props.field.id,
    appId: props.appId,
    deviceId: props.deviceId,
    installationId: props.installationId,
    mode: props.mode,
  })

  // Build authorization URL
  const url = new URL(props.field.authorization_endpoint)
  url.searchParams.set('client_id', props.field.client_id)
  url.searchParams.set('redirect_uri', getRedirectUri())
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('state', stateData)

  if (props.field.scopes?.length) {
    url.searchParams.set('scope', props.field.scopes.join(' '))
  }

  oauthFlow.startFlow(url.toString(), {
    fieldId: props.field.id,
    appId: props.appId,
    deviceId: props.deviceId,
    installationId: props.installationId,
    mode: props.mode,
    formValues: props.formValues,
    displayTime: props.displayTime,
    skippedByUser: props.skippedByUser,
  })
}

function disconnect() {
  emit('update:value', '')
}
</script>
