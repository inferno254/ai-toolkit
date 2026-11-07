# Sheng Mode for Screen Readers - AI for Accessibility Toolkit

## Project Overview

Sheng Mode for Screen Readers is a screen-reader support project that phonetically smooths Kenyan Sheng/Swahili/English code-switching for TalkBack users. Its browser reader, extension, and Android TTS proxy share the core lexicon; visible source text is kept intact.

## Architecture

### 1. sheng-core-engine
- **Purpose**: Core phonetic transformation engine
- **Features**:
  - 405 unique lexicon entries, including 234 automatically extracted candidates and 19 MIT-source seeds awaiting speaker review; coverage is not yet benchmarked
  - Deterministic lexicon and prefix matching, with optional Gemini fallback for unresolved text
  - Optional Gemini AI fallback for unknown slang
  - TTS mode switching (English Kenya / Swahili Kenya)
- **Build**: ESM (ES2022), outputs to dist/

### 2. standalone-web-reader
- **Purpose**: Browser-based reading app with TalkBack support
- **Features**:
  - Vite dev server (port 3000)
  - Quick presets for testing
  - User-triggered phonetic smoothing
  - Web Speech API voice synthesis
  - A separate, navigable phonetic output for screen readers; original text remains visible
  - Local AI-for-Accessibility Toolkit preferences: optional Low Vision profile, editable text-size and browser-read-aloud-rate needs, and a bundled reading-aid skill
  - Explicitly applies only reader-supported settings; Toolkit profile and skill processing stays on-device. Separately, an optional Gemini fallback may send unresolved text to Google when configured and used.
- **Run**: cd standalone-web-reader && npm install && npm run dev

### 3. in-situ-web-extension
- **Purpose**: Chrome/Brave extension for in-situ web adaptation
- **Features**:
  - Manifest V3 service worker
  - DOM observer for added and edited page content
  - Adds pronunciation labels only when a configured term changes pronunciation; visible text is untouched
  - Profile sync with extension storage
  - Offline fallback is default; optional Gemini processing is off until explicitly enabled in the popup
  - Local Toolkit AbilityModel preferences and a bundled reading-aid skill; only the supported text-size setting is applied to pages
- **Build**: cd in-situ-web-extension && npm install && npm run build
- **Load**: chrome://extensions -> Load unpacked -> dist/

### 4. android-tts-proxy
- **Purpose**: Android system TTS engine that adapts Sheng words and switches recognized Kiswahili/English spans to the corresponding Google TTS locale
- **Features**:
  - Reads the shared core lexicon and supports lexicon-backed Sheng phonetics and Swahili prefix decomposition
  - Segments a limited, bundled set of Kiswahili words from English/Sheng text and synthesizes each segment with `sw-KE`/English when those Google voices are available
  - Resamples generated audio to Android's PCM format before passing it to TalkBack
  - Unknown words remain in the English segment; the initial Kiswahili word inventory needs community review and expansion
  - Offline synthesis depends on Google TTS and its English/Kiswahili voice data being available offline
- **Build**: `cd android-tts-proxy && .\gradlew.bat :app:assembleDebug`
- **Install**: `adb install -r app\build\outputs\apk\debug\app-debug.apk`, then choose **Sheng Proxy TTS** in Android's Text-to-speech settings

### 5. AI-for-Accessibility-Toolkit (submodule)
- **Purpose**: Full accessibility toolkit with profiles, skills, consent
- **Features**:
  - Librarian for profile management
  - Datastore for persistent storage
  - Built-in skills for cross-surface adaptation
  - Consent management for privacy
- **Clone**: git submodule update --init --recursive

## Quick Start

### Prerequisites
- Node.js 20+
- Chrome/Brave browser
- Android phone with TalkBack (for testing)

### 1. Clone the repository
```bash
git clone --recursive https://github.com/inferno254/ai-toolkit.git
cd ai-toolkit
```

### 2. Build the core engine
```bash
cd sheng-core-engine
npm install
npm run build
cd ..
```

### 3. Run the standalone reader
```bash
cd standalone-web-reader
npm install
npm run dev
# Open http://localhost:3000
```

### 4. Build the Chrome extension
```bash
cd in-situ-web-extension
npm install
npm run build
# Load in Chrome: chrome://extensions -> Load unpacked -> dist/
```

## Testing with TalkBack

1. Open the standalone reader on your Android phone: http://<your-ip>:3000
2. Enable TalkBack: Settings -> Accessibility -> TalkBack
3. Click a preset and press  Smooth Phonetics
4. Press Hear Smoothed to hear the phonetic transformation
5. Compare with Hear Original to hear the difference
6. On Android, select **Sheng Proxy TTS** as the system engine and test a mixed phrase such as “Leo tuko kwa stage ya mathree”; verify Google TTS has Kiswahili voice data installed to hear the intended locale switch

## Key Design Principles

1. **Phonetic Smoothing, NOT Semantic Translation**
   - Users already understand Sheng; only pronunciation is fixed
   - Visual text remains untouched; the browser extension exposes smoothed pronunciation through accessible labels

2. **AI is an Adapter, NOT the Core**
   - Deterministic lexicon and prefix rules run before the optional AI fallback
   - Gemini AI only used for unknown slang (slow lane)

3. **Visual Authenticity**
   - innerText and visual styling are never modified
   - The extension changes accessible labels for pronunciation while preserving visible page text
   - Sighted users see original Sheng

## Data sources and responsible use

Reviewed source pointers:

- Mozilla Data Collective: [Read Speech in Kenyan Swahili (6h)](https://mozilladatacollective.com/datasets/cmocxuhkn00y4md07d8bllj2x), [Common Voice Spontaneous Speech 5.0 - Kenyi](https://mozilladatacollective.com/datasets/cmu5neabp00uqmh07svhmt8bx), [Kenyah](https://mozilladatacollective.com/datasets/cmu5n230h00tjmh07dqp9pqml), and [Swahili](https://mozilladatacollective.com/datasets/cmu5m0d8l00remh07n4t18drh), plus [Common Voice Scripted Speech 27.0 - Swahili](https://mozilladatacollective.com/datasets/cmu5sgles002zo1071nphgtby).
- [think-ke/sheng-dataset](https://github.com/think-ke/sheng-dataset) and [BlakHasan/sheng-augmented-collection](https://huggingface.co/datasets/BlakHasan/sheng-augmented-collection).
- [micymike/kenyan-conversational-data](https://huggingface.co/datasets/micymike/kenyan-conversational-data).
- [WAZZII](https://wazzii.ke/) is a sexual-health support service, not a general Sheng corpus.

The Mozilla resources include Kenyan Swahili read, spontaneous, and scripted speech. They can help validate Swahili pronunciation or explore future speech-recognition work, but they are not Sheng pronunciation dictionaries. The Kenyan conversational dataset is not yet verified here as a Sheng source. Treat augmented Sheng text as candidate language material, not verified pronunciation ground truth.

The think-ke dataset describes Sheng dictionary examples and Ghetto Radio news text. Check each source's current license and terms before redistributing content.

The [Sheng-Sentiment-Base dictionary](https://github.com/okech-christopher/sheng-sentiment-base/blob/main/data/dictionaries/sheng_dictionary.json) declares an MIT license. Nineteen terms seeded from its mappings are marked `source-seeded` and `needs-speaker-review`; their draft phonetics and descriptions are not presented as validated. The source's MIT copyright and license notice is retained in [THIRD_PARTY_NOTICES.md](./sheng-core-engine/THIRD_PARTY_NOTICES.md).

Do not import other examples or terms until licensing permits the intended use and Sheng speakers review spelling, meaning, context, and phonetic form. Dataset text may contain sensitive or personal material; minimize collection and keep user content local unless a person explicitly chooses an online AI fallback.

## Toolkit integration status

The standalone web reader and Chrome extension use local Toolkit packages for an optional Low Vision profile, editable `textSize` and `readAloudRate` needs, and retrieval/resolution of the bundled reading-aid skill. They apply only the browser settings each host currently supports: the reader applies text size and its Web Speech playback rate; the extension applies text size, while its saved read-aloud-rate need has no playback host. Both surfaces label unsupported profile/skill adapters as not applied. The skill and profile flow does not send page text to a remote service. Gemini phonetic fallback is separate and remains opt-in.

Android remains separate and is not integrated with the Toolkit by this browser-only work.

## Team

- Erick Neko
- Kelvin Karanja
- Timothy Gitau Muchiri
- Melvin Khakabo
- Antony Shikanda

## Event

AI for Accessibility Design and Hackathon
- Location: Senses Hub, Nairobi
- Date: November 7, 2026
- Organized by: Google.org

## License

MIT
