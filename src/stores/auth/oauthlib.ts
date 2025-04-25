import { GenericOAuth2, type OAuth2RefreshTokenOptions, type OAuth2AuthenticateOptions } from '@capacitor-community/generic-oauth2';

export class KoiosOAuth2 {
  static getOAuth2Options(): OAuth2AuthenticateOptions {
    return {
      appId: 'lantern',
      authorizationBaseUrl: 'https://auth.koiosdigital.net/realms/kd-prod/protocol/openid-connect/auth',
      responseType: 'code',
      redirectUrl: import.meta.env.PROD ? '' : 'http://localhost:5173/login',
      accessTokenEndpoint: 'https://auth.koiosdigital.net/realms/kd-prod/protocol/openid-connect/token',
      resourceUrl: 'https://auth.koiosdigital.net/realms/kd-prod/protocol/openid-connect/userinfo',
      pkceEnabled: true,
      scope: 'openid profile email',
      logsEnabled: true,
      logoutUrl: 'https://auth.koiosdigital.net/realms/kd-prod/protocol/openid-connect/logout',
      android: {
        redirectUrl: 'net.koiosdigital.lantern:/login',
        appId: 'lantern',
      },
      ios: {
        redirectUrl: 'net.koiosdigital.lantern:/login',
        appId: 'lantern',
      },
      web: {
        sendCacheControlHeader: false,
        windowOptions: "height=600,left=0,top=0",
      }
    }
  }

  static getOAuth2RefreshOptions(refresh_token: string): OAuth2RefreshTokenOptions {
    return {
      appId: 'lantern',
      accessTokenEndpoint: 'https://auth.koiosdigital.net/realms/kd-prod/protocol/openid-connect/token',
      refreshToken: refresh_token,
      scope: 'openid profile email',
    }
  }

  static async authenticate() {
    try {
      const oauth2Options = this.getOAuth2Options();
      const response = await GenericOAuth2.authenticate(oauth2Options);
      return response;
    } catch (error) {
      console.log(error);
    }
  }

  static async refreshToken(refresh_token: string) {
    const oauth2RefreshOptions = this.getOAuth2RefreshOptions(refresh_token);
    const response = await GenericOAuth2.refreshToken(oauth2RefreshOptions);
    return response;
  }

  static async logout(accessToken: string) {
    const oauth2LogoutOptions = this.getOAuth2Options();
    await GenericOAuth2.logout(oauth2LogoutOptions, accessToken);
  }
}
