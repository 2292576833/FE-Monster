# FE Monster Android

This module is the complete Android FE Monster client. The APK bundles the current `web/` UI, component library, preset library, previews, textures and playable GLB scene assets. Its WebView serves those files directly from the installed APK while keeping the configured HTTPS origin for secure API calls.

The installed app therefore does not download its interface from the server and does not require a LAN connection to open the client, browse bundled components/presets, or load bundled scenes. Community synchronization, online music, Codex conversations and Blender generation remain network services because those workloads cannot run inside an ordinary Android phone.

When the FE Monster gateway is unavailable, the Android shell now stays open instead of replacing the client with a connection screen. Local music import/playback, packaged scenes and presets, visual playback and locally persisted settings remain available. Community and sandbox entry points show an explicit offline state and are re-enabled after the gateway recovers. Music-platform search/login still requires an Internet-accessible FE Monster API gateway; it is not an on-device Java/Node service.

## Start A Reachable Server

From the repository root:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\start-android-server.ps1
```

The launcher now starts and health-checks both required layers before accepting phone traffic:

- community, creator market, sandbox and Codex/Blender service on port `3020`;
- Java web/API gateway on port `3000`, bound to `0.0.0.0` by default.

Optional Codex/Blender configuration can be passed without editing the script:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\start-android-server.ps1 `
  -CodexModel <compatible-model> `
  -BlenderPath "E:\New Folder\blender.exe"
```

Use the printed `Remote URL` in the Android app, for example:

```text
http://192.168.1.23:3000/
```

This LAN launcher is only needed for a private development server. Public Android builds use the configured HTTPS gateway for dynamic services and do not require the phone and PC to share a LAN.

## Build

Install Android Studio or an Android SDK with Gradle available on `PATH`, then run:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\build-android.ps1
```

The Android build now defaults to the public FE Monster gateway, so a fresh install or upgrade does not require a LAN address:

```text
https://frp-boy.com:53981
```

The public tunnel targets a protected proxy on local port `3099`. The Android launcher installs an HttpOnly access cookie from a per-machine key generated at `%LOCALAPPDATA%\FE Monster\public-access.key`; direct anonymous `/api/` calls are rejected. The desktop gateway remains on local port `3000`.

To override that server address for a private build (the user can still replace it in the connection screen):

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\build-android.ps1 -ServerUrl https://your-server.example/
```

Debug APK output:

```text
android/app/build/outputs/apk/debug/app-debug.apk
```

The current public-gateway side-load package is also copied to:

```text
dist/FE-Monster-Android-1.0.6-complete-debug.apk
```

The Android package uses a dedicated touch layout and performance profile without changing the Windows layout. Phone controls use a 44 dp minimum hit area; portrait and landscape use separate sandbox/playlist arrangements. Low-RAM devices reduce particle density, reflection buffers and environment-map resolution, disable realtime shadows, and use adaptive spatial reconstruction. The mobile package keeps 4K storm textures and omits the 8K copies that Android never selects, reducing installation size and texture-decoding pressure.

Automated Android layout/offline regression check:

```powershell
node scripts/check-android-client.mjs
```

The check covers 320x568 and 360x800 portrait layouts plus an 800x360 landscape layout, verifies 44 px touch targets, control overlap/bounds, offline local import, and online recovery. A physical Android device or emulator is still required for final OEM WebView, audio-codec, thermal and sustained-frame-rate validation.

This APK pins the SakuraFrp automatic certificate for `frp-boy.com:53981`; other untrusted certificates remain blocked. The pinned certificate expires on 2027-07-06 and must be renewed in the APK when the tunnel certificate changes.

This APK is debug-signed and is intended for installation/testing. A Play Store or long-term production package requires a user-owned release keystore and a release signing configuration.

## Scope

The Android app preserves the existing FE Monster experience, including community and creator markets, sandbox mode, Codex conversations and 2D uploads, DIY presets, audio playback, and WebGL 3D playback. UI files and current playable content are packaged locally. Android adds native document selection, authenticated HTTP downloads, Blob/data-URL downloads, fullscreen Web content, persistent cookies/storage, and a Web-to-native back-button event.

Windows-only native features such as WinForms window controls, WebView2-specific behavior, XAudio2, PowerShell startup helpers, Codex execution, Blender rendering, and the Python desktop gesture runtime cannot run inside Android as-is; those remain on the desktop/server side. Online functions require Internet access, and Android System WebView must support the WebGL features used by a given scene.
