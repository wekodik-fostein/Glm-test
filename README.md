# Chess Assist

Android app, WebView host with injected Stockfish + helper scripts.

## Build

Push to `main` / `master` triggers GitHub Actions automatically.
The workflow builds `:app:assembleDebug` and uploads the APK as an artifact.

Manual run: **Actions tab → "Build APK" → Run workflow**.

Download the APK from the run's **Artifacts** section (`chess-assist-debug-apk`).

## Local build

Requirements: JDK 17, Android SDK with `platforms;android-34` + `build-tools;34.0.0`, Gradle 8.7.

```sh
gradle :app:assembleDebug --no-daemon
# output: app/build/outputs/apk/debug/app-debug.apk
```

## Install on device

```sh
adb install -r app/build/outputs/apk/debug/app-debug.apk
```

Or copy `app-debug.apk` to the phone and install via "Unknown sources".

Android 7+ (API 24) required.
