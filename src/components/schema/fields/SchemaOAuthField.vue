<template>
  <div class="space-y-3" :class="{ 'w-full': field.user_defined_client }">
    <!-- Connected State -->
    <div
      v-if="isConnected"
      class="flex items-center gap-3 rounded-lg border border-green-500/20 bg-green-500/10 p-4"
    >
      <UIcon name="i-fa6-solid:circle-check" class="h-5 w-5 shrink-0 text-green-400" />
      <div class="min-w-0 flex-1">
        <p class="font-medium text-green-400">Connected</p>
        <p v-if="connectionInfo" class="truncate text-xs text-white/60">{{ connectionInfo }}</p>
      </div>
      <UButton color="neutral" variant="ghost" size="sm" @click="disconnect"> Disconnect </UButton>
    </div>

    <!-- Not Connected State -->
    <div v-else class="rounded-lg border border-white/10 bg-white/5 p-4 space-y-4">
      <!-- User-defined client credentials -->
      <div v-if="field.user_defined_client" class="space-y-3">
        <UFormField label="Client ID">
          <UInput v-model="userClientId" placeholder="OAuth Client ID" />
        </UFormField>
        <UFormField label="Client Secret">
          <UInput
            v-model="userClientSecret"
            type="password"
            :placeholder="field.pkce ? 'Optional' : 'OAuth Client Secret'"
          />
        </UFormField>
      </div>

      <UButton
        color="primary"
        variant="soft"
        block
        :loading="oauthFlow.isConnecting.value"
        :disabled="!canConnect"
        @click="startOAuth"
      >
        <UIcon name="i-fa6-solid:arrow-up-right-from-square" class="mr-2 h-4 w-4" />
        Connect
      </UButton>
    </div>

    <p v-if="error || oauthFlow.error.value" class="text-xs text-red-400">
      {{ error || oauthFlow.error.value }}
    </p>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, onMounted } from 'vue'
import { Capacitor } from '@capacitor/core'
import type { components } from '@/types/api'
import { appsApi } from '@/lib/api/apps'
import { useOAuthFlow } from '@/composables/useOAuthFlow'
import { encodeState } from '@/utils/oauthState'
import { generatePKCE } from '@/utils/pkce'
import { ENV } from '@/config/environment'

type OAuth2Field = components['schemas']['AppSchemaOAuth2FieldDto']

const props = defineProps<{
  field: OAuth2Field
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

// User-defined client credentials
const userClientId = ref('')
const userClientSecret = ref('')

// PKCE state
let codeVerifier: string | null = null
const codeChallenge = ref<string | null>(null)

const clientId = computed(() =>
  props.field.user_defined_client ? userClientId.value : props.field.client_id,
)

const canConnect = computed(() => {
  if (props.field.pkce && !codeChallenge.value) return false
  if (props.field.user_defined_client && !userClientId.value) return false
  if (!props.field.user_defined_client && !props.field.client_id) return false
  if (!props.field.user_defined_client && props.field.pkce && !userClientSecret.value) return false
  return true
})

// Check if we have a real OAuth token, not just a placeholder
const isConnected = computed(() => {
  if (!props.value || props.value === '') return false
  return true
})
const connectionInfo = computed(() => {
  if (!props.value) return null
  return 'Account linked'
})

async function initPKCE() {
  if (!props.field.pkce) return
  const pkce = await generatePKCE()
  codeVerifier = pkce.verifier
  codeChallenge.value = pkce.challenge
}

onMounted(initPKCE)

function getRedirectUri(): string {
  let baseUrl = Capacitor.isNativePlatform() ? ENV.appNativeUrl : window.location.origin
  // OAuth providers often don't accept localhost - use 127.0.0.1 instead
  baseUrl = baseUrl.replace('://localhost', '://127.0.0.1')
  return `${baseUrl}/oauth/callback`
}

const oauthFlow = useOAuthFlow({
  onSuccess: async (code) => {
    try {
      const handlerName = props.field.handler || `${props.field.id}_handler`

      const handlerParams: Record<string, string> = {
        code,
        grant_type: 'authorization_code',
        client_id: clientId.value || '',
        redirect_uri: getRedirectUri(),
      }

      if (props.field.pkce && codeVerifier) {
        handlerParams.code_verifier = codeVerifier
      }

      if (props.field.user_defined_client && userClientSecret.value) {
        handlerParams.client_secret = userClientSecret.value
      }

      const result = await appsApi.callHandler(
        props.appId,
        handlerName,
        buildConfig(),
        JSON.stringify(handlerParams),
      )

      if (result?.result) {
        emit('update:value', result.result)
      }

      // Regenerate PKCE for next attempt
      await initPKCE()
    } catch (err) {
      console.error('OAuth handler error:', err)
    }
  },
  onError: (err) => {
    console.error('OAuth error:', err)
  },
})

function startOAuth() {
  if (!props.field.authorization_endpoint) {
    console.error('OAuth field missing authorization_endpoint')
    return
  }

  if (!canConnect.value) return

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
  url.searchParams.set('client_id', clientId.value || '')
  url.searchParams.set('redirect_uri', getRedirectUri())
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('state', stateData)

  if (props.field.scopes?.length) {
    url.searchParams.set('scope', props.field.scopes.join(' '))
  }

  // PKCE params
  if (props.field.pkce && codeChallenge.value) {
    url.searchParams.set('code_challenge', codeChallenge.value)
    url.searchParams.set('code_challenge_method', 'S256')
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
    codeVerifier: codeVerifier || undefined,
    clientId: clientId.value || undefined,
    clientSecret: userClientSecret.value || undefined,
  })
}

function disconnect() {
  emit('update:value', '')
}
</script>
