# FE Monster Android

The Android package is an independent local client. Its UI, components, presets, scene assets and Android runtime adapter are bundled into the APK and served from the private origin `https://fe-monster.local/`.

The APK does not ask for a computer address, does not use the desktop gateway, and does not contain a public-tunnel URL or FE Monster access key. Same-origin `/api/*` requests are handled inside the Android WebView by `fe-monster-mobile-runtime.js`; player state, volume, queue metadata, runtime settings and sandbox presets are stored on the phone.

Local music import/playback, packaged scenes, visual playback, DIY settings and presets work without starting the Windows client or any FE Monster server. Android and Windows use separate storage and runtime processes, so changing or closing one does not affect the other.

Music-platform login runs through a Node.js gateway embedded in the APK. It listens only on Android loopback, requires a per-process random bearer that is never exposed to web content, and stores NetEase, QQ, Kugou and Qishui sessions in separate application-private containers. Platform requests still require Internet access to the platforms themselves, but they never pass through the Windows client or a remote FE Monster service. Community synchronization, Codex and Blender generation remain unavailable in this local package.

## Build

Install Android Studio or an Android SDK plus JDK 17+, NDK 27.0.12077973 and CMake 3.22.1, then run from the repository root:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\build-android.ps1
```

Debug outputs:

```text
android/app/build/outputs/apk/debug/app-debug.apk
dist/FE-Monster-Android-1.1.0-local-debug.apk
```

No server URL or access-key build argument is required.

The build downloads the pinned Node.js Mobile 18.20.4 Android archive when it is not already cached, verifies its SHA-256 checksum, and installs the gateway's production-only npm dependencies into generated Android assets. The Qishui adapter source is tracked under the Android project; its local device identity file is generated only after installation and is never packaged.

## Responsive behavior

Android styles are isolated under `html[data-fe-platform="android"]`; desktop layout files and the Windows runtime are not changed. The phone client is locked to sensor-aware landscape, uses phone-sized login panels, safe-area handling and compact 40 dp visible controls. The old Android navigation rail and top-level import button are not rendered; platform login is opened from the account identity inside the playback page.

Run the automated checks with:

```powershell
node scripts/check-android-local-runtime.mjs
node scripts/check-android-client.mjs
```

The aspect-ratio matrix covers landscape variants for 20:9, 19.5:9, 20.5:9, 21:9, 3:2, 16:9 and 18:9 layouts. A physical Android device or emulator is still recommended for final OEM WebView, audio-codec, thermal and sustained-frame-rate validation.

This APK is debug-signed and intended for side-loading and testing. A store or long-term production package requires a user-owned release keystore and release signing configuration.
