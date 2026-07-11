# Holt Android

Native Android client for Holt Chat. It's a thin native shell around the **Shore** web frontend (bundled in-app), not a rewrite. All chat logic, crypto, and SSE live in Shore's JS; the Kotlin side only provides the window chrome, native notifications, downloads, and file/permission plumbing.

## Architecture

- Shore is copied into `app/src/main/assets/shore/` and served over `https://appassets.androidplatform.net/assets/shore/index.html` via `WebViewAssetLoader`. The `appassets` https origin is a **secure context**, which is required for Shore's WebCrypto (`crypto.subtle`) to work. `file://` would break crypto, which is why we never load from `file://`.
- Keel's CORS is `Access-Control-Allow-Origin: *` and auth is Bearer-token (no cookies), so the `appassets` origin can call the API cross-origin. If Keel ever locks CORS down, the bundled approach breaks.
- `SseService` is a foreground service that holds its **own** native SSE `/stream` connection per logged-in server and raises local notifications on `message_sent` events. It only reads sender/channel metadata; message content stays E2E encrypted and is never decrypted natively. No FCM (push is local/SSE by design).
- Session tokens are pulled out of the WebView's `localStorage` via the `HoltNative` JS bridge (see `syncScript`) and handed to the service. The service calls `GET /me` per token to learn "self" and skip the user's own messages.

## Key files

- `app/src/main/java/chat/holt/android/MainActivity.kt` — WebView host, asset loader, insets, back nav, file chooser, downloads, call permissions, and the two injected JS blobs (`docStartScript`, `syncScript`).
- `HoltBridge.kt` — `@JavascriptInterface` methods (`syncSessions`, `setForeground`, `saveBase64`). ProGuard keeps these (`proguard-rules.pro`).
- `SseService.kt` — foreground SSE + notifications.
- `HoltApp.kt` — notification channels.
- `app/src/main/assets/shore/` — the bundled frontend. Do NOT hand-edit; re-sync from `../Shore` (rsync line in `README.md`).

## Gotchas (learned the hard way)

- **Build with the local gradle binary**, `/home/user/tools/gradle-8.7/bin/gradle :app:assembleRelease`, NOT `./gradlew`. The wrapper re-downloads the gradle dist and the network here truncates it (checksum failure). `gradlew` is committed for other machines.
- **Insets must be applied to a wrapping `FrameLayout`, not the raw WebView.** MIUI/HyperOS ignores `setPadding` on the WebView itself, so the status bar overlapped and the keyboard didn't resize. Padding the container (systemBars top + IME bottom) and consuming the insets fixes both. Needs `ViewCompat.requestApplyInsets` after setting the listener or it never fires.
- **Blob downloads need the `createObjectURL` hook, not `fetch(blobUrl)`.** Shore calls `URL.revokeObjectURL` immediately after `a.click()`, so any async fetch of the blob URL loses the race. The interceptor wraps `createObjectURL` to keep the real `Blob` object and reads that. It also handles **both** programmatic `a.click()` (prototype override) and user-tapped `<a download>` (document capture-phase click listener) — a real tap does not go through `HTMLAnchorElement.prototype.click`.
- `DOCUMENT_START_SCRIPT` (used for seeding the default server before `server.js` runs) is a WebView-feature check, not guaranteed. Anything that only needs to run before a user action (e.g. the download interceptor) lives in `syncScript` (onPageFinished) instead so it works regardless.
- Default seeded server is `MainActivity.DEFAULT_SERVER`, now `https://app.holtchat.xyz` — the official instance since the holtchat.xyz domain move.

## Workflow

- After editing Kotlin/resources: `/home/user/tools/gradle-8.7/bin/gradle :app:assembleRelease` then install with `adb -s <ip:port> install -r app/build/outputs/apk/release/app-release.apk`.
- Wireless ADB **connect port rotates** every time Wi-Fi drops; re-pair only needs a code once, but ask the user for the current `IP:Port` after a drop.
- After `install -r`, **force-stop and reopen** the app so the WebView reloads and re-runs the injected JS (a hot reinstall keeps the old page).
- Signing keys are gitignored (`*.keystore`, `keystore.properties`). The signing config is read from `app/keystore.properties` (copy from `keystore.properties.example`); the keystore itself is never committed. Reuse the same keystore across builds so updates install over an existing copy — a new key means users must uninstall first. Output copied to `dist/` (also gitignored).

## minSdk 24 (Android 7.0), targetSdk 34.
