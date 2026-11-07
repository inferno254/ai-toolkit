# Architecture B: Standalone Web Reader App (Paste-and-Read)

## Purpose & Scope
A standalone, high-accessibility Single Page Application (SPA) designed as an unblockable, fail-safe testing and demonstration surface for co-designers and judges.

## Key Principles & Directives
- **Direct Snippet Processing**: Allows pasting or loading arbitrary text snippets (social media posts, SMS alerts, government notices, news articles) containing mixed English, Kiswahili, and Sheng.
- **Controlled screen-reader output**: Keeps the full result out of a live region so typing does not interrupt TalkBack; announces a short processing status and leaves the result available for deliberate navigation.
- **Audio Synthesizer Playback**: Built-in Web Speech API audio test playback alongside screen reader testing.
- **User-controlled playback**: Adjustable browser speech speed, pause/resume, and stop controls. Text is processed only after an explicit action, avoiding background AI requests while typing. The speed control does not change TalkBack's Android setting.
- **Platform note**: Browser speech synthesis is a demo aid and may use a different voice from Android TalkBack; verify pronunciation on the target phone with its user.
- **Local Toolkit preferences**: The optional Low Vision profile and editable text-size/browser-speech-rate needs are stored locally through the Toolkit AbilityModel. The reader applies only text sizing and its own Web Speech rate.
- **Bundled reading aid**: Retrieves and resolves the local reading-aid skill against the reader page when Low Vision is selected. It can apply only the supported text-size setting; focus mode and other catalog adapters are not implemented here.
- **Privacy boundary**: Toolkit profile and skill flows do not send pasted text or page content to a service. Online Gemini fallback remains a separate, optional engine setting.
- **Shared Processing Engine**: Employs the identical phonetic pipeline, LID classifier, morphological root rules, lexicon cache, and Gemini zero-shot adapter layer as Architecture A.
- **Local Network Wi-Fi Testing**: Bound to `0.0.0.0` to allow direct access from Android Chrome on the co-designer's phone running native TalkBack.

## Structure Roadmap
- `src/main.ts`: Application bootstrap and state management.
- `src/browser-toolkit.ts`: Browser binding to the local Toolkit packages and bundled skill.
- `src/components/`: High-contrast accessible input, TalkBack verification pane, and audio playback controls.
- `src/adapter/`: Shared phonetic smoothing and linguistic processing engine.
