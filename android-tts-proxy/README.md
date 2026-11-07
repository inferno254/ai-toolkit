# Android TTS proxy

This directory is a standalone Android Studio Gradle project. Open this directory
as the project root (not `app/`). It targets Android 7.0/API 24 and compiles
against API 35. No API key is bundled; the optional Gemini path remains
disabled.

The service uses the installed Google TTS engine to generate a temporary WAV,
validates its PCM format, removes the RIFF/WAV container, and streams only PCM
samples to Android's `SynthesisCallback`. `onStop()` cancels the active job and
stops the internal engine. A canceled synthesis file is retained until the
internal engine reports that writing has stopped, avoiding deletion while it
may still be in use.

## Build

Use Android Studio with JDK 17 or newer and Android SDK Platform 35. From the
project root, run `.\gradlew.bat :app:assembleDebug` or use Android Studio's
Gradle sync/build actions. The wrapper downloads Gradle 8.13 on first use.

## Validation status

The Gradle wrapper and Android Studio project files are present. In the
development environment, `:app:assembleDebug` could not finish dependency
resolution: Maven Central returned HTTP 403 for required artifacts (including
Kotlin and OkHttp), so an APK has not been verified. Re-run the build in an
environment that can fetch the declared Maven dependencies before device
testing.

Device testing is still required: verify the internal engine package
`com.google.android.tts` is installed and enabled, select **Sheng Proxy TTS**
as the system speech engine, then exercise normal speech, `QUEUE_FLUSH`, and
TalkBack interruption. WAV sample rate/channel layouts can vary by installed
engine; only 16-bit PCM WAV files with one or two channels are currently
accepted. API 35 compilation does not certify behavior on every Android
version/device.
