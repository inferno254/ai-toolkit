# Android Sheng accessibility tools

This directory is a standalone Android Studio Gradle project. Open this directory
as the project root (not `app/`). It targets Android 7.0/API 24 and compiles
against API 35. No Gemini API key is bundled in the Android app.

## Unlabeled image OCR

The app includes an optional accessibility companion for Android 11/API 30 and
newer. The user must explicitly enable **Sheng OCR for images**
in Android Accessibility settings. While touch exploration is active, it watches
for an accessibility-focused or activated image node,
captures the screen, crops to that node's bounds, and runs the bundled ML Kit
Latin text-recognition model locally by default. A separate **Online OCR**
option is off by default. When explicitly enabled and Firebase is configured,
the focused image crop is sent to the Gemini backend for transcription; if that
request fails, the app falls back to on-device OCR. If focus remains on the
image, it queues the recognized text through the selected system TTS engine.
The OCR model is bundled in the APK so offline recognition does not require a
network connection.

Android does not expose a callback for “TalkBack needs an image description,”
nor does a third-party service have permission to replace TalkBack's label for
the original node. This is a best-effort companion announcement, not a
replacement for TalkBack. This feature reads visible text; it does not describe
non-text scenes or objects. On-device OCR uses ML Kit's Latin-script model, so
handwriting, decorative text, small or low-contrast text, and non-Latin scripts
may not be recognized accurately. Protected or off-screen content may not be
capturable. Screen capture is used only after an unlabeled image receives
accessibility focus. Pixels are processed in memory and aren't saved. Image
crops are not uploaded unless Online OCR is explicitly enabled. Recognized text
is spoken as a separate utterance through the selected system TTS engine;
TalkBack itself does not receive or
replace its own image description.

Launch **Sheng Image OCR** and use its button to open Accessibility settings.
Enable the service there; Android requires this explicit user action. The
feature requires API 30+ screenshot support and touch exploration. The OCR
crop is kept at up to 2048 pixels on its longest side to preserve more text
detail for recognition.

The service uses the installed Google TTS engine to generate a temporary WAV,
validates its PCM format, removes the RIFF/WAV container, and streams only PCM
samples to Android's `SynthesisCallback`. `onStop()` cancels the active job and
stops the internal engine. A canceled synthesis file is retained until the
internal engine reports that writing has stopped, avoiding deletion while it
may still be in use.

## Secure online AI backend

`functions/` contains Firebase callable functions named
`adaptUnknownShengWords` and `readFocusedImageText`. Pronunciation accepts up to
20 unknown words plus up to 280
characters of surrounding text for code-switch context; words found in the
local lexicon are replaced with `[known]` before sending. OCR accepts a bounded
JPEG crop only when the user explicitly enables Online OCR. Both functions
require Firebase Authentication and App Check,
limits each authenticated user to six calls per minute, stores the Gemini key
only as the `GEMINI_API_KEY` Functions secret, and validates that the model
returns exactly one safe pronunciation per requested word or bounded text for
OCR. The Android TTS
client is wired to this function: it only submits words absent from the local
lexicon (redacting known words from contextual text), only when **Online pronunciation help** is explicitly enabled, and
uses the model's language result to split speech between English and Kiswahili
voices. Up to 20 distinct unknown words are sent per utterance. With either
online setting off, missing configuration, or network failure, it falls back to
the local path. Online OCR sends a JPEG crop of at most 1.5 MB; recognized text
is not stored by the backend.

To prepare deployment:

1. Firebase is enabled for project `ai-toolkit-sheng-tts-20261107`, and Android
   package `com.shengproxy.tts` is registered. Its `google-services.json` has
   been downloaded to `app/` locally and is gitignored.
2. In Firebase Console, enable anonymous sign-in under Authentication and
   configure App Check. Enable the Google Cloud Firestore API, then create the
   default Firestore database in `europe-west1`. The CLI currently reports that
   the Firestore API is disabled.
3. Enable App Check's debug provider for local debug builds. Register the debug
   token printed in Logcat in Firebase Console. Release builds use Play Integrity.
4. Create a fresh Gemini API key directly with Google AI Studio. Do not reuse
   any key pasted into chat. Set it as a Functions secret with
   `firebase functions:secrets:set GEMINI_API_KEY`; never put it in this
   repository or Android `local.properties`.
5. Cloud Functions deployment may require the Blaze plan and a billing account.
   Obtain approval before linking billing. After prerequisites are ready, deploy
   the callable functions and Firestore TTL configuration with
   `firebase deploy --only functions,firestore`.

No Gemini key is included in the repository. The Firebase Android config is
gitignored and stored locally only. Firebase registration and Android app
registration are complete; Firestore's API is still disabled, and anonymous
Auth, App Check, the Gemini secret, and backend deployment remain to be set up.
No billing account was linked.

## Build

Use Android Studio with JDK 17 or newer and Android SDK Platform 35. From the
project root, run `.\gradlew.bat :app:assembleDebug` or use Android Studio's
Gradle sync/build actions. The wrapper downloads Gradle 8.13 on first use.

## Validation status

`:app:testDebugUnitTest :app:assembleDebug` passes with the image-OCR
feature included. The image-assist flow still needs device testing: install the
APK, explicitly enable the accessibility service, and focus an unlabeled image
while touch exploration is active. Android secure windows and apps that do not
expose image nodes may prevent capture or detection.

Online tests cover word filtering, image and phrase bounds, response
validation, and language segmentation. End-to-end online operation still
requires Firebase Auth/App Check configuration, Firestore setup, secret
creation, and function deployment.

The TTS proxy also requires device validation: verify the internal engine
package `com.google.android.tts` is installed and enabled, select **Sheng Proxy
TTS** as the system speech engine, then exercise normal speech, `QUEUE_FLUSH`,
and TalkBack interruption. WAV sample rate/channel layouts can vary by
installed engine; only 16-bit PCM WAV files with one or two channels are
currently accepted. API 35 compilation does not certify behavior on every
Android version/device.
