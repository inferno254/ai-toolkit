import { ShengPhoneticEngine } from '../../sheng-core-engine/dist/index.js';

const engine = new ShengPhoneticEngine();

const snippetInput = document.getElementById('snippet-input') as HTMLTextAreaElement;
const ttsVoiceSelect = document.getElementById('tts-voice-select') as HTMLSelectElement;
const apiKeyInput = document.getElementById('api-key-input') as HTMLInputElement;
const processBtn = document.getElementById('process-btn') as HTMLButtonElement;
const playOriginalBtn = document.getElementById('play-original-btn') as HTMLButtonElement;
const playAdaptedBtn = document.getElementById('play-adapted-btn') as HTMLButtonElement;
const visualOutput = document.getElementById('visual-output') as HTMLDivElement;
const phoneticOutput = document.getElementById('phonetic-output') as HTMLDivElement;
const statsContainer = document.getElementById('stats-container') as HTMLDivElement;
const presetButtons = document.querySelectorAll<HTMLButtonElement>('.preset-btn');

let currentOriginalText = '';
let currentSmoothedText = '';
let debounceTimer: ReturnType<typeof setTimeout> | null = null;
let availableVoices: SpeechSynthesisVoice[] = [];
let activeVoiceLabel = 'Detecting best local voice...';

// Intelligent Voice Detection: Prioritizes en-KE and sw-KE on Android / Google TTS
function detectBestVoice(langMode: 'en' | 'sw'): SpeechSynthesisVoice | null {
  if (availableVoices.length === 0 && 'speechSynthesis' in window) {
    availableVoices = window.speechSynthesis.getVoices();
  }

  if (langMode === 'sw') {
    // 1. Precise Swahili voice (sw-KE, sw-TZ, Swahili)
    const swVoice = availableVoices.find(
      (v) =>
        v.lang.toLowerCase().startsWith('sw') ||
        v.name.toLowerCase().includes('swahili') ||
        v.name.toLowerCase().includes('kiswahili')
    );
    if (swVoice) return swVoice;
  } else {
    // 2. English Kenya voice (Google TTS English (Kenya) en-KE)
    const keVoice = availableVoices.find(
      (v) =>
        v.lang.toLowerCase() === 'en-ke' ||
        v.name.toLowerCase().includes('kenya') ||
        v.lang.toLowerCase().startsWith('en-za') ||
        v.lang.toLowerCase().startsWith('en-ng')
    );
    if (keVoice) return keVoice;

    // 3. Fallback to British English (en-GB) which handles Bantu vowels much better than US English
    const gbVoice = availableVoices.find((v) => v.lang.toLowerCase().startsWith('en-gb'));
    if (gbVoice) return gbVoice;

    // 4. Any English voice
    const genericEn = availableVoices.find((v) => v.lang.toLowerCase().startsWith('en'));
    if (genericEn) return genericEn;
  }

  return availableVoices[0] || null;
}

function loadVoices() {
  if ('speechSynthesis' in window) {
    availableVoices = window.speechSynthesis.getVoices();
    const mode = (ttsVoiceSelect?.value as 'en' | 'sw') || 'en';
    const voice = detectBestVoice(mode);
    if (voice) {
      activeVoiceLabel = `${voice.name} (${voice.lang})`;
      console.log('Synthesizer loaded primary voice:', activeVoiceLabel);
    }
  }
}

loadVoices();
if ('speechSynthesis' in window && window.speechSynthesis.onvoiceschanged !== undefined) {
  window.speechSynthesis.onvoiceschanged = loadVoices;
}

// Preset loader
presetButtons.forEach((btn) => {
  btn.addEventListener('click', (e) => {
    e.preventDefault();
    const text = btn.getAttribute('data-preset') || '';
    snippetInput.value = text;
    runProcessing();
  });
});

// React immediately on dropdown change
ttsVoiceSelect.addEventListener('change', () => {
  engine.setTTSMode(ttsVoiceSelect.value as 'en' | 'sw');
  loadVoices();
  if (snippetInput.value.trim()) {
    runProcessing();
  }
});

// Real-time live input debounced update
snippetInput.addEventListener('input', () => {
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    if (snippetInput.value.trim()) {
      runProcessing();
    } else {
      visualOutput.textContent = '[No text processed yet]';
      phoneticOutput.textContent = '[No text processed yet]';
      statsContainer.innerHTML = '';
      currentOriginalText = '';
      currentSmoothedText = '';
    }
  }, 250);
});

apiKeyInput.addEventListener('input', () => {
  engine.setApiKey(apiKeyInput.value.trim());
});

processBtn.addEventListener('click', (e) => {
  e.preventDefault();
  runProcessing();
});

async function runProcessing() {
  const text = snippetInput.value.trim();
  if (!text) {
    visualOutput.textContent = '[Please enter or paste text above]';
    phoneticOutput.textContent = '[Please enter or paste text above]';
    return;
  }

  currentOriginalText = text;
  processBtn.disabled = true;
  processBtn.textContent = 'Processing...';

  try {
    const selectedMode = (ttsVoiceSelect.value as 'en' | 'sw') || 'en';
    const result = await engine.process(text, selectedMode);
    currentSmoothedText = result.adapted;

    // 1. Visual Authenticity: keep original text
    visualOutput.textContent = result.original;

    // 2. TalkBack Voice Surface: render smoothed phonetic stream
    phoneticOutput.textContent = result.adapted;
    phoneticOutput.setAttribute('aria-label', result.adapted);

    const voice = detectBestVoice(selectedMode);
    const voiceName = voice ? `${voice.name} (${voice.lang})` : 'Default Engine';

    // 3. Stats and active voice feedback
    statsContainer.innerHTML = `
      <div style="margin-top:12px;display:flex;flex-wrap:wrap;gap:8px;">
        <span class="stats-badge" style="background:#15803d;color:#fff;padding:6px 12px;border-radius:6px;font-size:0.85rem;">
          ✓ ${result.substitutionsCount} Sheng phrases smoothed | Mode: ${selectedMode.toUpperCase()}
        </span>
        <span class="stats-badge" style="background:#0369a1;color:#fff;padding:6px 12px;border-radius:6px;font-size:0.85rem;">
          🎙 Voice: ${voiceName}
        </span>
      </div>
    `;
  } catch (err) {
    console.error('Error during processing:', err);
    phoneticOutput.textContent = `Error: ${err}`;
  } finally {
    processBtn.disabled = false;
    processBtn.textContent = '⚡ Smooth Phonetics';
  }
}

// Web Speech API Voice Synthesizer with natural rate & pitch tuning
function speak(text: string, langMode: 'en' | 'sw') {
  if (!('speechSynthesis' in window)) {
    alert('Web Speech API is not supported in this browser.');
    return;
  }

  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  const voice = detectBestVoice(langMode);

  if (voice) {
    utterance.voice = voice;
    utterance.lang = voice.lang;
  } else {
    utterance.lang = langMode === 'sw' ? 'sw-KE' : 'en-KE';
  }

  // Rate 0.92 gives natural vowel resonance without conversational drag
  utterance.rate = 0.92;
  utterance.pitch = 1.0;
  window.speechSynthesis.speak(utterance);
}

playOriginalBtn.addEventListener('click', (e) => {
  e.preventDefault();
  const text = currentOriginalText || snippetInput.value.trim();
  if (text) speak(text, ttsVoiceSelect.value as 'en' | 'sw');
});

playAdaptedBtn.addEventListener('click', (e) => {
  e.preventDefault();
  const text = currentSmoothedText || phoneticOutput.textContent?.trim();
  if (text && text !== '[No text processed yet]' && !text.startsWith('[')) {
    speak(text, ttsVoiceSelect.value as 'en' | 'sw');
  } else if (snippetInput.value.trim()) {
    runProcessing().then(() => {
      if (currentSmoothedText) speak(currentSmoothedText, ttsVoiceSelect.value as 'en' | 'sw');
    });
  }
});
