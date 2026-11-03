import { ShengPhoneticEngine } from '../../sheng-core-engine/src/index';

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

// Load available system voices dynamically
let availableVoices: SpeechSynthesisVoice[] = [];
function loadVoices() {
  if ('speechSynthesis' in window) {
    availableVoices = window.speechSynthesis.getVoices();
  }
}
loadVoices();
if ('speechSynthesis' in window && window.speechSynthesis.onvoiceschanged !== undefined) {
  window.speechSynthesis.onvoiceschanged = loadVoices;
}

// Preset loader
presetButtons.forEach((btn) => {
  btn.addEventListener('click', () => {
    const text = btn.getAttribute('data-preset') || '';
    snippetInput.value = text;
    runProcessing();
  });
});

ttsVoiceSelect.addEventListener('change', () => {
  engine.setTTSMode(ttsVoiceSelect.value as 'en' | 'sw');
});

apiKeyInput.addEventListener('input', () => {
  engine.setApiKey(apiKeyInput.value.trim());
});

processBtn.addEventListener('click', () => {
  runProcessing();
});

async function runProcessing() {
  const text = snippetInput.value.trim();
  if (!text) return;

  currentOriginalText = text;
  processBtn.disabled = true;
  processBtn.textContent = 'Processing...';

  try {
    const result = await engine.process(text);
    currentSmoothedText = result.adapted;

    // 1. Visual Authenticity: keep original text
    visualOutput.textContent = result.original;

    // 2. TalkBack Voice Surface: render smoothed phonetic stream
    phoneticOutput.textContent = result.adapted;
    phoneticOutput.setAttribute('aria-label', result.adapted);

    // 3. Stats
    statsContainer.innerHTML = `
      <span class="stats-badge">
        ✓ Fast-Path Substitutions: ${result.substitutionsCount} | 
        AI Fallback Used: ${result.usedAiFallback ? 'Yes' : 'No'}
      </span>
    `;
  } catch (err) {
    console.error('Error during processing:', err);
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
  
  // Pick matching installed voice if available
  if (availableVoices.length === 0) {
    availableVoices = window.speechSynthesis.getVoices();
  }

  const voice = availableVoices.find(v => 
    langMode === 'sw' 
      ? (v.lang.startsWith('sw') || v.name.toLowerCase().includes('swahili'))
      : (v.lang.startsWith('en-GB') || v.lang.startsWith('en-US') || v.lang.startsWith('en'))
  );

  if (voice) {
    utterance.voice = voice;
  }

  utterance.lang = langMode === 'sw' ? 'sw-KE' : 'en-US';
  utterance.rate = 0.92; // slightly relaxed cadence prevents syllable clipping
  utterance.pitch = 1.0;
  window.speechSynthesis.speak(utterance);
}

playOriginalBtn.addEventListener('click', () => {
  const text = currentOriginalText || snippetInput.value.trim();
  if (text) speak(text, ttsVoiceSelect.value as 'en' | 'sw');
});

playAdaptedBtn.addEventListener('click', () => {
  const text = currentSmoothedText || phoneticOutput.textContent?.trim();
  if (text && text !== '[No text processed yet]') {
    speak(text, ttsVoiceSelect.value as 'en' | 'sw');
  }
});
