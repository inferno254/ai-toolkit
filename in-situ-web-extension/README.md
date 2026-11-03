# Architecture A: In-Situ Web Adaptation Layer (Browser Extension)

## Purpose & Scope
An in-browser adaptation layer (Manifest V3 extension and content script) targeting live web browsing sessions on desktop and mobile browsers.

## Key Principles & Directives
- **Phonetic Smoothing Only**: Never translate Sheng into English or formal Swahili. Blind and low-vision Kenyan users already understand Sheng contextually; the system modifies pronunciation and orthographic tokens so standard TTS engines (Google/Samsung TTS) pronounce them naturally.
- **Visual Integrity Preservation**: Modifies accessible properties (`aria-label`) of targeted elements (`p`, `h1`-`h6`, `span`, `li`, `button`) without altering visual layout or `innerText`.
- **Toolkit & Librarian Profile Integration**: Subscribes to the user's ability profile via `@ai-accessibility/toolkit` to toggle Sheng adaptation dynamically.
- **AI as an Adapter Layer (Edge Polish)**: Fast local lexicon cache and morphological root rules process words first; Gemini API handles zero-shot ambiguous phonetic respellings.

## Structure Roadmap
- `manifest.json`: Manifest V3 configuration.
- `src/content.ts`: DOM observer, element scanner, and ARIA updater.
- `src/background.ts`: Service worker managing background message passing and API adapter calls.
- `src/adapter/`: Sheng phonetics adapter, LID (Language Identifier), morphological root parser, and lexicon map.

