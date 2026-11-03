# Architecture B: Standalone Web Reader App (Paste-and-Read)

## Purpose & Scope
A standalone, high-accessibility Single Page Application (SPA) designed as an unblockable, fail-safe testing and demonstration surface for co-designers and judges.

## Key Principles & Directives
- **Direct Snippet Processing**: Allows pasting or loading arbitrary text snippets (social media posts, SMS alerts, government notices, news articles) containing mixed English, Kiswahili, and Sheng.
- **Phonetic Smoothing & Live ARIA Output**: Normalizes pronunciation and renders to an accessible, high-contrast, TalkBack-ready live region (`aria-live="polite"`).
- **Audio Synthesizer Playback**: Built-in Web Speech API audio test playback alongside screen reader testing.
- **Shared Processing Engine**: Employs the identical phonetic pipeline, LID classifier, morphological root rules, lexicon cache, and Gemini zero-shot adapter layer as Architecture A.
- **Local Network Wi-Fi Testing**: Bound to `0.0.0.0` to allow direct access from Android Chrome on the co-designer's phone running native TalkBack.

## Structure Roadmap
- `src/main.ts`: Application bootstrap and state management.
- `src/components/`: High-contrast accessible input, TalkBack verification pane, and audio playback controls.
- `src/adapter/`: Shared phonetic smoothing and linguistic processing engine.

