# Architecture A: In-Situ Web Adaptation Layer (Browser Extension)

## Purpose & Scope
An in-browser adaptation layer (Manifest V3 extension and content script) targeting live web browsing sessions on desktop and mobile browsers.

## Key Principles & Directives
- **Phonetic Smoothing Only**: Never translate Sheng into English or formal Swahili. Blind and low-vision Kenyan users already understand Sheng contextually; the system modifies pronunciation and orthographic tokens so standard TTS engines (Google/Samsung TTS) pronounce them naturally.
- **Visual Integrity Preservation**: Modifies accessible properties (`aria-label`) of targeted elements (`p`, `h1`-`h6`, `span`, `li`, `button`) without altering visual layout or `innerText`.
- **Local Toolkit preferences**: Stores the optional Low Vision profile and editable text-size/read-aloud-rate needs in the Toolkit AbilityModel using local extension-origin storage. Preferences are not synced to a hosted account.
- **Honest adapter scope**: The extension applies only text size (through page zoom) to the active page and subsequent pages where its content script runs. It displays the Low Vision catalog's adapter IDs and marks unsupported adapters as not applied; read-aloud rate is saved but this extension has no speech playback.
- **Bundled reading aid**: Retrieves and resolves the local reading-aid skill against the active tab URL, without reading or sending page content. The explicit apply action applies only its supported text-size setting; focus mode and other adapters are not implemented.
- **AI as an Adapter Layer (Edge Polish)**: Fast local lexicon cache and morphological root rules process words first; Gemini API handles zero-shot ambiguous phonetic respellings only when the person explicitly enables online fallback.

## Structure Roadmap
- `manifest.json`: Manifest V3 configuration.
- `src/content.ts`: DOM observer, element scanner, and ARIA updater.
- `src/background.ts`: Service worker managing background message passing and API adapter calls.
- `src/browser-toolkit.ts`: Browser binding to the local Toolkit packages and bundled skill.
- `src/adapter/`: Sheng phonetics adapter, LID (Language Identifier), morphological root parser, and lexicon map.
