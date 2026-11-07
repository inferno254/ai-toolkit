# Android TTS proxy

This directory is a standalone Android Studio Gradle project. Open this directory
as the project root (not `app/`). It targets Android 7.0/API 24 and compiles
against API 35. No API key is bundled; the optional Gemini path remains
disabled.

The service reads the shared core lexicon's entry and prefix arrays, respells
known Sheng terms, and groups recognized Kiswahili and English spans. It asks
Google TTS to synthesize each span with the matching locale, converts each WAV
to a common 22,050 Hz mono PCM stream, and streams that audio to Android's
`SynthesisCallback`. The bundled Kiswahili word list is intentionally small;
unrecognized words remain in the English span. `onStop()` cancels the active
job and stops the internal engine. A canceled synthesis file is retained until
the internal engine reports that writing has stopped, avoiding deletion while
it may still be in use.

## Build

Use Android Studio with JDK 17 or newer and Android SDK Platform 35. From the
project root, run `.\gradlew.bat :app:assembleDebug` or use Android Studio's
Gradle sync/build actions. The wrapper downloads Gradle 8.13 on first use.

## Validation status

The debug APK builds successfully with Android SDK Platform 35 and was installed
on a Samsung SM-A165F running Android 16. The device listed the proxy as a TTS
service. Actual Sheng pronunciation and mid-sentence language switching still
need listening validation on the device.

Google TTS (`com.google.android.tts`) must be installed and enabled for the
proxy's internal synthesis. Select **Sheng Proxy TTS** as the system engine,
then exercise a sentence mixing Kiswahili, English, and known Sheng terms,
`QUEUE_FLUSH`, and TalkBack interruption. If the Google TTS Kiswahili
(`sw-KE`/`sw`) voice is unavailable, the proxy logs a warning and falls back
to English for those spans. WAV sample rate/channel layouts can vary by
installed engine; only 16-bit PCM WAV files with one or two channels are
accepted. API 35 compilation does not certify behavior on every Android
version/device.
