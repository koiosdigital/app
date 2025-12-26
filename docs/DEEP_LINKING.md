# Deep Linking Setup Guide

This guide explains how to configure deep linking (Universal Links on iOS, App Links on Android) for the Koios app. Deep links are required for:

- **OAuth/OIDC authentication** - Redirecting back to the app after login
- **Stripe checkout** - Returning to the app after license purchase
- **Email verification links** - Opening the app from email links

## Overview

The app uses the domain `app.koiosdigital.net` for deep links. When a user taps a link to this domain, the native app opens instead of the browser.

### How It Works

1. User initiates action (login, checkout)
2. In-app browser opens external URL (Keycloak, Stripe)
3. After completion, external service redirects to `https://app.koiosdigital.net/...`
4. OS intercepts the URL and opens the native app
5. App receives URL via `appUrlOpen` event and navigates to the correct route

## iOS Setup (Universal Links)

### 1. Apple App Site Association File

Host a file at `https://app.koiosdigital.net/.well-known/apple-app-site-association`:

```json
{
  "applinks": {
    "apps": [],
    "details": [
      {
        "appIDs": ["TEAM_ID.net.koiosdigital.koiosapp"],
        "components": [
          {
            "/": "/login/*",
            "comment": "OAuth callback"
          },
          {
            "/": "/setup/*",
            "comment": "Setup flow callbacks"
          }
        ]
      }
    ]
  }
}
```

Replace `TEAM_ID` with your Apple Developer Team ID.

### 2. Xcode Configuration

1. Open `ios/App/App.xcworkspace` in Xcode
2. Select the App target
3. Go to **Signing & Capabilities**
4. Click **+ Capability** and add **Associated Domains**
5. Add the domain: `applinks:app.koiosdigital.net`

### 3. Info.plist (Optional)

The Capacitor App plugin handles URL schemes automatically, but you can add custom URL schemes in `ios/App/App/Info.plist`:

```xml
<key>CFBundleURLTypes</key>
<array>
  <dict>
    <key>CFBundleURLSchemes</key>
    <array>
      <string>koios</string>
    </array>
    <key>CFBundleURLName</key>
    <string>net.koiosdigital.koiosapp</string>
  </dict>
</array>
```

## Android Setup (App Links)

### 1. Digital Asset Links File

Host a file at `https://app.koiosdigital.net/.well-known/assetlinks.json`:

```json
[
  {
    "relation": ["delegate_permission/common.handle_all_urls"],
    "target": {
      "namespace": "android_app",
      "package_name": "net.koiosdigital.koiosapp",
      "sha256_cert_fingerprints": [
        "YOUR_SHA256_FINGERPRINT"
      ]
    }
  }
]
```

Get your SHA256 fingerprint:
```bash
# Debug keystore
keytool -list -v -keystore ~/.android/debug.keystore -alias androiddebugkey -storepass android -keypass android

# Release keystore
keytool -list -v -keystore your-release-key.keystore -alias your-alias
```

### 2. AndroidManifest.xml

Edit `android/app/src/main/AndroidManifest.xml` to add intent filters to the main activity:

```xml
<activity
  android:name=".MainActivity"
  android:launchMode="singleTask"
  ...>

  <!-- Existing intent filter -->
  <intent-filter>
    <action android:name="android.intent.action.MAIN" />
    <category android:name="android.intent.category.LAUNCHER" />
  </intent-filter>

  <!-- Deep link intent filter -->
  <intent-filter android:autoVerify="true">
    <action android:name="android.intent.action.VIEW" />
    <category android:name="android.intent.category.DEFAULT" />
    <category android:name="android.intent.category.BROWSABLE" />
    <data android:scheme="https" android:host="app.koiosdigital.net" />
  </intent-filter>

  <!-- Custom URL scheme (optional fallback) -->
  <intent-filter>
    <action android:name="android.intent.action.VIEW" />
    <category android:name="android.intent.category.DEFAULT" />
    <category android:name="android.intent.category.BROWSABLE" />
    <data android:scheme="koios" />
  </intent-filter>
</activity>
```

**Important:** Use `android:launchMode="singleTask"` to prevent multiple app instances.

## App Configuration

### Capacitor Config

The `capacitor.config.ts` is already configured:

```typescript
const UNIVERSAL_LINK_HOST = process.env.KOIOS_UNIVERSAL_LINK_HOST ?? 'app.koiosdigital.net'

const config: CapacitorConfig = {
  appId: 'net.koiosdigital.koiosapp',
  appName: 'Koios App',
  webDir: 'dist',
  server: {
    hostname: 'localhost',
    iosScheme: 'https',
    androidScheme: 'https',
    allowNavigation: [UNIVERSAL_LINK_HOST],
  },
  // ...
}
```

### URL Handler (main.ts)

The app already handles incoming URLs:

```typescript
if (Capacitor.isNativePlatform()) {
  CapacitorApp.addListener('appUrlOpen', ({ url }) => {
    if (!url) return
    try {
      const parsed = new URL(url)
      const path = `${parsed.pathname}${parsed.search}${parsed.hash}`
      if (path) {
        router.push(path)
      }
    } catch (error) {
      console.warn('Failed to handle incoming universal link', error)
    }
  })
}
```

## Callback URLs

### OAuth/OIDC Login

| Route | Purpose |
|-------|---------|
| `/login/callback` | OAuth authorization code callback |
| `/login` | Post-logout redirect |

The OIDC client in `src/stores/auth/oauthlib.ts` handles:
- Building authorization URL with PKCE
- Opening in-app browser
- Exchanging authorization code for tokens
- Closing in-app browser after callback

### License Checkout

| Route | Purpose |
|-------|---------|
| `/setup/crypto?license_key=XXX` | Stripe checkout callback with license key |

The checkout flow in `src/views/setup/SetupCryptoView.vue` handles:
- Opening Stripe checkout in in-app browser
- Detecting return with `license_key` query param
- Closing browser and continuing provisioning

## Testing Deep Links

### iOS Simulator

```bash
# Test login callback
xcrun simctl openurl booted "https://app.koiosdigital.net/login/callback?code=test&state=test"

# Test checkout callback
xcrun simctl openurl booted "https://app.koiosdigital.net/setup/crypto?license_key=TEST-KEY"
```

### Android Emulator

```bash
# Test login callback
adb shell am start -W -a android.intent.action.VIEW \
  -d "https://app.koiosdigital.net/login/callback?code=test&state=test" \
  net.koiosdigital.koiosapp

# Test checkout callback
adb shell am start -W -a android.intent.action.VIEW \
  -d "https://app.koiosdigital.net/setup/crypto?license_key=TEST-KEY" \
  net.koiosdigital.koiosapp
```

### Verify Configuration

**iOS:**
```bash
# Check if AASA file is valid
curl -I https://app.koiosdigital.net/.well-known/apple-app-site-association

# Apple's validation tool
# https://search.developer.apple.com/appsearch-validation-tool/
```

**Android:**
```bash
# Check if assetlinks.json is valid
curl https://app.koiosdigital.net/.well-known/assetlinks.json

# Verify in-app
adb shell pm get-app-links net.koiosdigital.koiosapp
```

## Troubleshooting

### iOS

1. **Links open in Safari instead of app**
   - Ensure AASA file is served with `Content-Type: application/json`
   - Verify Team ID matches in AASA and Xcode
   - Delete app and reinstall (AASA is cached on install)

2. **"Invalid Associated Domains Entitlement"**
   - Check that Associated Domains capability is enabled
   - Verify domain format: `applinks:app.koiosdigital.net` (no https://)

### Android

1. **Links open in browser instead of app**
   - Verify `assetlinks.json` is accessible
   - Check SHA256 fingerprint matches your signing key
   - Clear app defaults: Settings > Apps > Koios > Open by default > Clear defaults

2. **Multiple app instances opening**
   - Ensure `android:launchMode="singleTask"` is set on MainActivity

### General

1. **Callback not received**
   - Check router handles the path
   - Verify query parameters are preserved
   - Check browser console for navigation errors

2. **PKCE/State mismatch**
   - Ensure sessionStorage is available
   - Check that app wasn't killed during auth flow

## Server Configuration

### Nginx Example

```nginx
server {
    listen 443 ssl;
    server_name app.koiosdigital.net;

    # Apple App Site Association
    location /.well-known/apple-app-site-association {
        default_type application/json;
        alias /var/www/koios/.well-known/apple-app-site-association;
    }

    # Android Asset Links
    location /.well-known/assetlinks.json {
        default_type application/json;
        alias /var/www/koios/.well-known/assetlinks.json;
    }

    # SPA fallback for deep links
    location / {
        root /var/www/koios/dist;
        try_files $uri $uri/ /index.html;
    }
}
```

## Environment Variables

For different environments (dev, staging, prod), set:

```bash
# .env.development
VITE_APP_URL=https://dev.app.koiosdigital.net
VITE_APP_NATIVE_URL=https://dev.app.koiosdigital.net

# .env.production
VITE_APP_URL=https://app.koiosdigital.net
VITE_APP_NATIVE_URL=https://app.koiosdigital.net
```

The `VITE_APP_NATIVE_URL` is used for redirect URIs on native platforms.
