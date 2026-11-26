# Chess Assist

Android app, WebView host with injected Stockfish + helper scripts.

## Build

Push to `main` triggers GitHub Actions automatically.
The workflow builds `:app:assembleDebug` and uploads the APK as an artifact.

Download the APK from the run's **Artifacts** section (`chess-assist-debug-apk`).

## Requirements
- JDK 17
- Android SDK: platforms;android-34, build-tools;34.0.0
- Gradle 8.7
- Android 7+ (API 24)
