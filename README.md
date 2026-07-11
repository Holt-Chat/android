<div align="center">
  <img src="https://raw.githubusercontent.com/Holt-Chat/shore/main/media/holt.png" width="96" alt="Holt Chat logo">

  # Holt for Android

  **The Android client for [Holt Chat](https://github.com/Holt-Chat)**, a self-hostable, end-to-end encrypted chat platform.

  [![License: MIT](https://img.shields.io/badge/license-MIT-blue?style=flat-square)](LICENSE.md)
  [![Platform](https://img.shields.io/badge/platform-Android%207.0%2B-3ddc84?style=flat-square)](#install)
  [![E2EE](https://img.shields.io/badge/encryption-E2EE-6f42c1?style=flat-square)](#)
</div>

---

A thin, native shell around the [Shore](https://github.com/Holt-Chat/shore) web client. Shore is bundled into the app and served locally, so the UI is identical to the web while the shell adds the things a browser tab can't: background notifications, a native file picker and downloads, camera/mic access for QR linking and calls, and proper system integration. All encryption still happens client-side in Shore, and message content is never seen by the native layer.

## Features

| | |
|---|---|
| **Offline UI** | Shore is bundled and served over a secure in-app origin, so the interface loads without a network round-trip |
| **Notifications** | A foreground service holds its own event stream and raises local notifications, respecting your in-app notification toggle and per-channel mutes |
| **Downloads** | Attachments and key files save straight to your Downloads folder |
| **Calls & linking** | Microphone and camera access for WebRTC calls and QR device-linking |
| **Native feel** | Edge-to-edge themed system bars, splash screen, hardware-back navigation, and an in-app permission guide |

## Install

Grab the latest APK from [**Releases**](https://github.com/Holt-Chat/android/releases), enable installs from unknown sources, and open it. Requires Android 7.0 (API 24) or newer.

On first launch, pick or add a Holt server (a [Keel](https://github.com/Holt-Chat/keel) instance) and log in, or link an existing device by QR.

## Build

The app pins the [Shore](https://github.com/Holt-Chat/shore) frontend under `app/src/main/assets/shore/`.

```sh
./gradlew :app:assembleRelease
```

Output: `app/build/outputs/apk/release/app-release.apk`.

Signing keys are kept out of git. To sign with your own key, copy `app/keystore.properties.example` to `app/keystore.properties` and point it at your keystore; without it, release builds fall back to the debug signing key. Reuse the same keystore across builds so updates install over an existing copy.

To update the bundled frontend, re-sync Shore and rebuild:

```sh
rsync -a --delete --exclude='.git' path/to/shore/ app/src/main/assets/shore/
```
