# Sheng Mode for Screen Readers - AI for Accessibility Toolkit

## Project Overview

Sheng Mode for Screen Readers is a dual-architecture system that phonetically smooths Kenyan Sheng/Swahili/English code-switching for TalkBack screen readers. Built on the AI for Accessibility Toolkit, it ensures users with low vision or blindness can hear Sheng phrases pronounced correctly without changing the visual text.

## Architecture

### 1. sheng-core-engine
- **Purpose**: Core phonetic transformation engine
- **Features**:
  - 1,000+ Sheng phrase entries in sheng-lexicon.json
  - Fast-path deterministic matching (95%+ of phrases)
  - Optional Gemini AI fallback for unknown slang
  - TTS mode switching (English Kenya / Swahili Kenya)
- **Build**: ESM (ES2022), outputs to dist/

### 2. standalone-web-reader
- **Purpose**: Browser-based reading app with TalkBack support
- **Features**:
  - Vite dev server (port 3000)
  - Quick presets for testing
  - Real-time phonetic smoothing
  - Web Speech API voice synthesis
  - Aria-label updates for screen readers
- **Run**: cd standalone-web-reader && npm install && npm run dev

### 3. in-situ-web-extension
- **Purpose**: Chrome/Brave extension for in-situ web adaptation
- **Features**:
  - Manifest V3 service worker
  - DOM observer for dynamic content
  - Aria-label injection (visual text untouched)
  - Profile sync with extension storage
  - Gemini API key management
- **Build**: cd in-situ-web-extension && npm install && npm run build
- **Load**: chrome://extensions -> Load unpacked -> dist/

### 4. AI-for-Accessibility-Toolkit (submodule)
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
`ash
git clone --recursive https://github.com/inferno254/ai-toolkit.git
cd ai-toolkit
`

### 2. Build the core engine
`ash
cd sheng-core-engine
npm install
npm run build
cd ..
`

### 3. Run the standalone reader
`ash
cd standalone-web-reader
npm install
npm run dev
# Open http://localhost:3000
`

### 4. Build the Chrome extension
`ash
cd in-situ-web-extension
npm install
npm run build
# Load in Chrome: chrome://extensions -> Load unpacked -> dist/
`

## Testing with TalkBack

1. Open the standalone reader on your Android phone: http://<your-ip>:3000
2. Enable TalkBack: Settings -> Accessibility -> TalkBack
3. Click a preset and press  Smooth Phonetics
4. Press Hear Smoothed to hear the phonetic transformation
5. Compare with Hear Original to hear the difference

## Key Design Principles

1. **Phonetic Smoothing, NOT Semantic Translation**
   - Users already understand Sheng; only pronunciation is fixed
   - Visual text remains untouched; only ria-label is modified

2. **AI is an Adapter, NOT the Core**
   - Deterministic fast-path lexicon handles 95%+ of phrases
   - Gemini AI only used for unknown slang (slow lane)

3. **Visual Authenticity**
   - innerText and visual styling are never modified
   - Screen readers read ria-label (smoothed version)
   - Sighted users see original Sheng

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

