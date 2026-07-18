# FE Monster Android

The Android package is an independent local client. Its UI, components, presets, scene assets and Android runtime adapter are bundled into the APK and served from the private origin `https://fe-monster.local/`.

The APK does not ask for a computer address, does not use the desktop gateway, and does not contain a public-tunnel URL, FE Monster access key or Android network permission. Same-origin `/api/*` requests are handled inside the Android WebView by `fe-monster-mobile-runtime.js`; player state, volume, queue metadata, runtime settings and sandbox presets are stored on the phone.

Local music import/playback, packaged scenes, visual playback, DIY settings and presets work without starting the Windows client or any FE Monster server. Android and Windows use separate storage and runtime processes, so changing or closing one does not affect the other.

Online music-platform content is a separate concern: NetEase Cloud Music, QQ Music and Kugou still require those platforms' Internet services. The fully local build deliberately does not forward account credentials or QR-login state through a computer or FE Monster gateway. Platform account binding, community synchronization, Codex and Blender generation are therefore unavailable in this local-only package.

## Build

Install Android Studio or an Android SDK plus JDK 17+, then run from the repository root:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\build-android.ps1
```

Debug outputs:

```text
android/app/build/outputs/apk/debug/app-debug.apk
dist/FE-Monster-Android-1.0.7-local-debug.apk
```

No server URL or access-key build argument is required.

## Responsive behavior

Android styles are isolated under `html[data-fe-platform="android"]`; desktop layout files and the Windows runtime are not changed. Portrait and landscape use separate compositions, including a single-row landscape top bar, compact login panel, two-column sandbox, safe-area handling and 44 dp touch targets.

Run the automated checks with:

```powershell
node scripts/check-android-local-runtime.mjs
node scripts/check-android-client.mjs
```

The aspect-ratio matrix covers portrait and landscape variants for 20:9, 19.5:9, 20.5:9, 21:9, 3:2, 16:9 and 18:9 layouts. A physical Android device or emulator is still recommended for final OEM WebView, audio-codec, thermal and sustained-frame-rate validation.

This APK is debug-signed and intended for side-loading and testing. A store or long-term production package requires a user-owned release keystore and release signing configuration.
