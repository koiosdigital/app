import { ref, computed } from 'vue'
import { defineStore } from 'pinia'
import { Preferences } from '@capacitor/preferences'
import { KoiosOAuth2 } from './oauthlib'
import { jwtDecode } from 'jwt-decode'

export const useAuthStore = defineStore('auth', () => {
  const isLoggedIn = computed(() => {
    return accessToken.value != undefined && accessTokenExpired.value == false;
  });

  const accessToken = ref<string | undefined>(undefined);
  const refreshToken = ref<string | undefined>(undefined);

  const accessTokenExpired = computed(() => {
    if (accessToken.value) {
      const decodedToken: { exp: number } = jwtDecode(accessToken.value);
      const currentTime = Math.floor(Date.now() / 1000);
      return decodedToken.exp < currentTime;
    }
    return true;
  });

  //Initialization logic
  const initialize = async () => {
    const access_token = await Preferences.get({ key: 'access_token' });
    const refresh_token = await Preferences.get({ key: 'refresh_token' });

    if (access_token.value) {
      accessToken.value = access_token.value;
    }
    if (refresh_token.value) {
      refreshToken.value = refresh_token.value;
    }

    if (accessTokenExpired.value && refreshToken.value) {
      await refreshAccessToken();
    }
  }

  //Logout logic
  const logout = async () => {
    await Preferences.remove({ key: 'access_token' });
    await Preferences.remove({ key: 'refresh_token' });
    accessToken.value = undefined;
    refreshToken.value = undefined;
  }

  //Login logic
  const beginAuthentication = async () => {
    const response = await KoiosOAuth2.authenticate();
    if (response) {
      accessToken.value = response.access_token_response.access_token;
      refreshToken.value = response.access_token_response.refresh_token;
      await Preferences.set({ key: 'access_token', value: response.access_token_response.access_token });
      await Preferences.set({ key: 'refresh_token', value: response.access_token_response.refresh_token });
    }
  }

  //Refresh token logic
  const refreshAccessToken = async () => {
    if (refreshToken.value) {
      try {
        const response = await KoiosOAuth2.refreshToken(refreshToken.value);
        if (response) {
          accessToken.value = response.access_token;
          refreshToken.value = response.refresh_token;
          await Preferences.set({ key: 'access_token', value: response.access_token });
          await Preferences.set({ key: 'refresh_token', value: response.refresh_token });
          return accessToken.value;
        }
      } catch {
        await logout();
      }
    } else {
      await logout();
    }
  }

  const getAccessToken = async () => {
    if (accessToken.value && !accessTokenExpired.value) {
      return accessToken.value;
    } else if (refreshToken.value) {
      return await refreshAccessToken();
    }
    return undefined;
  }

  return { getAccessToken, logout, isLoggedIn, beginAuthentication, initialize }
})
