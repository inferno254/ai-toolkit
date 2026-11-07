import { ShengPhoneticEngine } from '../../sheng-core-engine/dist/index.js';
import { browserToolkit } from './browser-toolkit';

const engine = new ShengPhoneticEngine();

const snippetInput = document.getElementById('snippet-input') as HTMLTextAreaElement;
const ttsVoiceSelect = document.getElementById('tts-voice-select') as HTMLSelectElement;
const apiKeyInput = document.getElementById('api-key-input') as HTMLInputElement;
const processBtn = document.getElementById('process-btn') as HTMLButtonElement;
const playOriginalBtn = document.getElementById('play-original-btn') as HTMLButtonElement;
const playAdaptedBtn = document.getElementById('play-adapted-btn') as HTMLButtonElement;
const pauseResumeBtn = document.getElementById('pause-resume-btn') as HTMLButtonElement;
const stopPlaybackBtn = document.getElementById('stop-playback-btn') as HTMLButtonElement;
const speechRateInput = document.getElementById('speech-rate') as HTMLInputElement;
const speechRateValue = document.getElementById('speech-rate-value') as HTMLOutputElement;
const visualOutput = document.getElementById('visual-output') as HTMLDivElement;
const phoneticOutput = document.getElementById('phonetic-output') as HTMLDivElement;
const statsContainer = document.getElementById('stats-container') as HTMLDivElement;
const readerStatus = document.getElementById('reader-status') as HTMLParagraphElement;
const presetButtons = document.querySelectorAll<HTMLButtonElement>('.preset-btn');
const lowVisionProfile = document.getElementById('low-vision-profile') as HTMLInputElement;
const toolkitTextSize = document.getElementById('toolkit-text-size') as HTMLInputElement;
const toolkitTextSizeValue = document.getElementById('toolkit-text-size-value') as HTMLOutputElement;
const toolkitReadRate = document.getElementById('toolkit-read-rate') as HTMLInputElement;
const toolkitReadRateValue = document.getElementById('toolkit-read-rate-value') as HTMLOutputElement;
const saveToolkitPreferences = document.getElementById('save-toolkit-preferences') as HTMLButtonElement;
const toolkitStatus = document.getElementById('toolkit-status') as HTMLParagraphElement;
const toolkitAdapters = document.getElementById('toolkit-adapters') as HTMLUListElement;
const readingAidResult = document.getElementById('reading-aid-result') as HTMLDivElement;
const readingAidSteps = document.getElementById('reading-aid-steps') as HTMLOListElement;
const applyReadingAidButton = document.getElementById('apply-reading-aid') as HTMLButtonElement;
let currentReadingAidPlan: Awaited<ReturnType<typeof browserToolkit.retrieveReadingAid>> = null;

let currentOriginalText = '';
let currentSmoothedText = '';
let processingRequestId = 0;
let playbackRequestId = 0;
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
    snippetInput.dispatchEvent(new Event('input', { bubbles: true }));
    runProcessing(true);
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

snippetInput.addEventListener('input', () => {
  processingRequestId++;
  processBtn.disabled = false;
  processBtn.textContent = '⚡ Smooth Phonetics';
  currentOriginalText = '';
  currentSmoothedText = '';
  visualOutput.textContent = '[Text changed. Select Smooth Phonetics to prepare the result.]';
  phoneticOutput.textContent = '[Text changed. Select Smooth Phonetics to prepare the result.]';
  statsContainer.textContent = '';
  readerStatus.textContent = '';
});

apiKeyInput.addEventListener('input', () => {
  engine.setApiKey(apiKeyInput.value.trim());
});

processBtn.addEventListener('click', (e) => {
  e.preventDefault();
  runProcessing(true);
});

async function runProcessing(announceResult = false) {
  const text = snippetInput.value.trim();
  if (!text) {
    visualOutput.textContent = '[Please enter or paste text above]';
    phoneticOutput.textContent = '[Please enter or paste text above]';
    if (announceResult) readerStatus.textContent = 'Enter or paste text before processing.';
    return;
  }

  const requestId = ++processingRequestId;
  currentOriginalText = text;
  currentSmoothedText = '';
  processBtn.disabled = true;
  processBtn.textContent = 'Processing...';

  try {
    const selectedMode = (ttsVoiceSelect.value as 'en' | 'sw') || 'en';
    const result = await engine.process(text, selectedMode);
    if (requestId !== processingRequestId || snippetInput.value.trim() !== text) return;

    currentOriginalText = result.original;
    currentSmoothedText = result.adapted;

    // 1. Visual Authenticity: keep original text
    visualOutput.textContent = result.original;

    // 2. TalkBack Voice Surface: render smoothed phonetic stream
    phoneticOutput.textContent = result.adapted;

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
    if (announceResult) {
      const aiNotice = result.usedAiFallback ? ' Online AI fallback was used.' : '';
      readerStatus.textContent = `Ready. ${result.substitutionsCount} word${result.substitutionsCount === 1 ? '' : 's'} smoothed.${aiNotice}`;
    }
  } catch (err) {
    console.error('Error during processing:', err);
    if (requestId === processingRequestId) {
      phoneticOutput.textContent = 'Could not process this text. Please try again.';
      if (announceResult) readerStatus.textContent = 'Could not process the text. Please try again.';
    }
  } finally {
    if (requestId === processingRequestId) {
      processBtn.disabled = false;
      processBtn.textContent = '⚡ Smooth Phonetics';
    }
  }
}

// Web Speech API Voice Synthesizer with natural rate & pitch tuning
function speak(text: string, langMode: 'en' | 'sw') {
  if (!('speechSynthesis' in window)) {
    readerStatus.textContent = 'Speech playback is not supported in this browser.';
    return;
  }

  const requestId = ++playbackRequestId;
  window.speechSynthesis.cancel();
  pauseResumeBtn.textContent = 'Pause';
  pauseResumeBtn.setAttribute('aria-label', 'Pause speech playback');
  const utterance = new SpeechSynthesisUtterance(text);
  const voice = detectBestVoice(langMode);

  if (voice) {
    utterance.voice = voice;
    utterance.lang = voice.lang;
  } else {
    utterance.lang = langMode === 'sw' ? 'sw-KE' : 'en-KE';
  }

  utterance.rate = Number(speechRateInput.value);
  utterance.pitch = 1.0;
  utterance.onstart = () => {
    if (requestId !== playbackRequestId) return;
    pauseResumeBtn.disabled = false;
    stopPlaybackBtn.disabled = false;
  };
  utterance.onend = () => {
    if (requestId !== playbackRequestId) return;
    pauseResumeBtn.disabled = true;
    stopPlaybackBtn.disabled = true;
    pauseResumeBtn.textContent = 'Pause';
    pauseResumeBtn.setAttribute('aria-label', 'Pause speech playback');
  };
  utterance.onerror = () => {
    if (requestId !== playbackRequestId) return;
    pauseResumeBtn.disabled = true;
    stopPlaybackBtn.disabled = true;
    pauseResumeBtn.textContent = 'Pause';
    pauseResumeBtn.setAttribute('aria-label', 'Pause speech playback');
    readerStatus.textContent = 'Speech playback failed. Try another voice or browser.';
  };
  window.speechSynthesis.speak(utterance);
}

speechRateInput.addEventListener('input', () => {
  speechRateValue.value = `${Number(speechRateInput.value).toFixed(1)}×`;
});

pauseResumeBtn.addEventListener('click', () => {
  if (!('speechSynthesis' in window)) return;
  if (window.speechSynthesis.paused) {
    window.speechSynthesis.resume();
    pauseResumeBtn.textContent = 'Pause';
    pauseResumeBtn.setAttribute('aria-label', 'Pause speech playback');
  } else if (window.speechSynthesis.speaking) {
    window.speechSynthesis.pause();
    pauseResumeBtn.textContent = 'Resume';
    pauseResumeBtn.setAttribute('aria-label', 'Resume speech playback');
  }
});

stopPlaybackBtn.addEventListener('click', () => {
  if (!('speechSynthesis' in window)) return;
  playbackRequestId++;
  window.speechSynthesis.cancel();
  pauseResumeBtn.disabled = true;
  stopPlaybackBtn.disabled = true;
  pauseResumeBtn.textContent = 'Pause';
  pauseResumeBtn.setAttribute('aria-label', 'Pause speech playback');
  readerStatus.textContent = 'Speech playback stopped.';
});

playOriginalBtn.addEventListener('click', (e) => {
  e.preventDefault();
  const text = currentOriginalText || snippetInput.value.trim();
  if (text) speak(text, ttsVoiceSelect.value as 'en' | 'sw');
});

playAdaptedBtn.addEventListener('click', (e) => {
  e.preventDefault();
  if (currentSmoothedText) {
    speak(currentSmoothedText, ttsVoiceSelect.value as 'en' | 'sw');
  } else if (snippetInput.value.trim()) {
    runProcessing(false).then(() => {
      if (currentSmoothedText) speak(currentSmoothedText, ttsVoiceSelect.value as 'en' | 'sw');
    });
  }
});

function updateToolkitTextSize(value: number) {
  const scale = Math.min(2, Math.max(0.8, value));
  document.documentElement.style.setProperty('--toolkit-text-scale', String(scale));
  toolkitTextSize.value = String(scale);
  toolkitTextSizeValue.value = `${Math.round(scale * 100)}%`;
}

function updateToolkitReadRate(value: number) {
  const rate = Math.min(1.3, Math.max(0.7, value));
  toolkitReadRate.value = String(rate);
  toolkitReadRateValue.value = `${rate.toFixed(1)}×`;
  speechRateInput.value = String(rate);
  speechRateValue.value = `${rate.toFixed(1)}×`;
}

function renderAdapterStatuses(adapterIds: string[]) {
  toolkitAdapters.replaceChildren();
  for (const id of adapterIds) {
    const item = document.createElement('li');
    item.textContent = id === 'visual-assist'
      ? `${id} — partially applied here (text size only)`
      : `${id} — not applied by this reader`;
    toolkitAdapters.append(item);
  }
}

async function loadReadingAid() {
  readingAidSteps.replaceChildren();
  currentReadingAidPlan = null;
  applyReadingAidButton.disabled = true;
  if (!lowVisionProfile.checked) {
    readingAidResult.textContent = 'No profile is selected, so no skill is inferred. Choose Low Vision and save to retrieve the bundled reading aid for this page.';
    return;
  }

  const plan = await browserToolkit.retrieveReadingAid(window.location.href);
  if (!plan) {
    readingAidResult.textContent = 'No bundled skill matched this page and profile.';
    return;
  }

  currentReadingAidPlan = plan;
  applyReadingAidButton.disabled = typeof plan.settings.fontScale !== 'number';
  readingAidResult.textContent = `${plan.skill.name} — retrieved locally for ${window.location.host} and resolved to ${plan.adapterIds.length} adapter steps. No page content was read.`;
  for (const step of plan.skill.recipe.adapters) {
    const item = document.createElement('li');
    const applied = step.id === 'visual-assist'
      ? 'partially applied (text size only)'
      : 'not applied by this reader';
    item.textContent = `${step.id} — ${applied}`;
    readingAidSteps.append(item);
  }
  for (const action of plan.actions) {
    const item = document.createElement('li');
    item.textContent = `${action.name || 'Skill action'} — not run by this reader`;
    readingAidSteps.append(item);
  }
}

applyReadingAidButton.addEventListener('click', async () => {
  const fontScale = currentReadingAidPlan?.settings.fontScale;
  if (typeof fontScale !== 'number') return;
  applyReadingAidButton.disabled = true;
  try {
    const saved = await browserToolkit.savePreferences({
      profileId: lowVisionProfile.checked ? 'lowVision' : null,
      textSize: fontScale / 100,
      readAloudRate: Number(toolkitReadRate.value),
    });
    updateToolkitTextSize(saved.textSize);
    toolkitStatus.textContent = 'Applied the reading aid’s supported text-size setting locally. Focus mode and other adapters were not applied.';
  } catch (error) {
    console.error('Could not apply the supported reading-aid setting:', error);
    toolkitStatus.textContent = 'Could not apply the reading-aid setting.';
  } finally {
    applyReadingAidButton.disabled = !currentReadingAidPlan;
  }
});

toolkitTextSize.addEventListener('input', () => updateToolkitTextSize(Number(toolkitTextSize.value)));
toolkitReadRate.addEventListener('input', () => updateToolkitReadRate(Number(toolkitReadRate.value)));
speechRateInput.addEventListener('input', () => updateToolkitReadRate(Number(speechRateInput.value)));

saveToolkitPreferences.addEventListener('click', async () => {
  saveToolkitPreferences.disabled = true;
  toolkitStatus.textContent = 'Saving locally…';
  try {
    const preferences = await browserToolkit.savePreferences({
      profileId: lowVisionProfile.checked ? 'lowVision' : null,
      textSize: Number(toolkitTextSize.value),
      readAloudRate: Number(toolkitReadRate.value),
    });
    const fontScale = preferences.webSettings.fontScale;
    const speechRate = preferences.webSettings.speechRate;
    updateToolkitTextSize(typeof fontScale === 'number' ? fontScale / 100 : preferences.textSize);
    updateToolkitReadRate(typeof speechRate === 'number' ? speechRate : preferences.readAloudRate);
    renderAdapterStatuses(browserToolkit.getProfileAdapterIds());
    toolkitStatus.textContent = 'Saved locally with the Toolkit AbilityModel. This reader applied text size and browser speech rate only.';
    await loadReadingAid();
  } catch (error) {
    console.error('Could not save Toolkit preferences:', error);
    toolkitStatus.textContent = 'Could not save local preferences. Please try again.';
  } finally {
    saveToolkitPreferences.disabled = false;
  }
});

void (async () => {
  try {
    const preferences = await browserToolkit.getPreferences();
    lowVisionProfile.checked = preferences.profileId === 'lowVision';
    const fontScale = preferences.webSettings.fontScale;
    const speechRate = preferences.webSettings.speechRate;
    updateToolkitTextSize(typeof fontScale === 'number' ? fontScale / 100 : preferences.textSize);
    updateToolkitReadRate(typeof speechRate === 'number' ? speechRate : preferences.readAloudRate);
    renderAdapterStatuses(browserToolkit.getProfileAdapterIds());
    toolkitStatus.textContent = 'Local Toolkit profile and settings loaded on this device.';
    await loadReadingAid();
  } catch (error) {
    console.error('Could not load Toolkit preferences:', error);
    toolkitStatus.textContent = 'Local Toolkit preferences are unavailable in this browser context.';
    readingAidResult.textContent = 'The bundled skill could not be loaded.';
  }
})();
