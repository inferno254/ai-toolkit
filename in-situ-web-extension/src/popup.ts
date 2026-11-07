import { browserToolkit } from './browser-toolkit';

document.addEventListener('DOMContentLoaded', async () => {
  const enableToggle = document.getElementById('enable-toggle') as HTMLInputElement;
  const ttsModeSelect = document.getElementById('tts-mode') as HTMLSelectElement;
  const geminiKeyInput = document.getElementById('gemini-key') as HTMLInputElement;
  const enableAiFallback = document.getElementById('enable-ai-fallback') as HTMLInputElement;
  const saveBtn = document.getElementById('save-btn') as HTMLButtonElement;
  const readPageBtn = document.getElementById('read-page-btn') as HTMLButtonElement;
  const statusMsg = document.getElementById('status-msg') as HTMLDivElement;
  const lowVisionProfile = document.getElementById('low-vision-profile') as HTMLInputElement;
  const toolkitTextSize = document.getElementById('toolkit-text-size') as HTMLInputElement;
  const toolkitTextSizeValue = document.getElementById('toolkit-text-size-value') as HTMLOutputElement;
  const toolkitReadRate = document.getElementById('toolkit-read-rate') as HTMLInputElement;
  const toolkitReadRateValue = document.getElementById('toolkit-read-rate-value') as HTMLOutputElement;
  const saveToolkitPreferences = document.getElementById('save-toolkit-preferences') as HTMLButtonElement;
  const toolkitStatus = document.getElementById('toolkit-status') as HTMLParagraphElement;
  const toolkitAdapters = document.getElementById('toolkit-adapters') as HTMLUListElement;
  const readingAidResult = document.getElementById('reading-aid-result') as HTMLParagraphElement;
  const readingAidSteps = document.getElementById('reading-aid-steps') as HTMLOListElement;
  const applyReadingAidButton = document.getElementById('apply-reading-aid') as HTMLButtonElement;
  let activeTabId: number | undefined;
  let activeTabUrl = '';
  let currentReadingAidPlan: Awaited<ReturnType<typeof browserToolkit.retrieveReadingAid>> = null;

  if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.sync) {
    const data = await chrome.storage.sync.get(['isEnabled', 'ttsMode', 'geminiApiKey', 'enableAiFallback']);
    if (typeof data.isEnabled === 'boolean') enableToggle.checked = data.isEnabled;
    if (typeof data.ttsMode === 'string') ttsModeSelect.value = data.ttsMode;
    if (typeof data.geminiApiKey === 'string') geminiKeyInput.value = data.geminiApiKey;
    enableAiFallback.checked = data.enableAiFallback === true;
  }

  const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
  activeTabId = activeTab?.id;
  activeTabUrl = activeTab?.url || '';

  function updateTextSize(value: number) {
    const scale = Math.min(2, Math.max(0.8, value));
    toolkitTextSize.value = String(scale);
    toolkitTextSizeValue.value = `${Math.round(scale * 100)}%`;
  }

  function updateReadRate(value: number) {
    const rate = Math.min(1.3, Math.max(0.7, value));
    toolkitReadRate.value = String(rate);
    toolkitReadRateValue.value = `${rate.toFixed(1)}×`;
  }

  function renderProfileAdapters(adapterIds: string[]) {
    toolkitAdapters.replaceChildren();
    for (const id of adapterIds) {
      const item = document.createElement('li');
      item.textContent = id === 'visual-assist'
        ? `${id} — partially applied (text size only)`
        : `${id} — not applied by this extension`;
      toolkitAdapters.append(item);
    }
  }

  async function loadReadingAid() {
    readingAidSteps.replaceChildren();
    currentReadingAidPlan = null;
    applyReadingAidButton.disabled = true;
    if (!activeTabUrl) {
      readingAidResult.textContent = 'The active tab URL is unavailable; no site was inspected.';
      return;
    }
    if (!lowVisionProfile.checked) {
      readingAidResult.textContent = 'No profile is selected, so no skill is inferred. Choose Low Vision and save to retrieve the bundled reading aid for this site.';
      return;
    }
    const plan = await browserToolkit.retrieveReadingAid(activeTabUrl);
    if (!plan) {
      readingAidResult.textContent = 'No bundled skill matched this site and profile.';
      return;
    }
    currentReadingAidPlan = plan;
    applyReadingAidButton.disabled = typeof plan.settings.fontScale !== 'number';
    readingAidResult.textContent = `${plan.skill.name} — retrieved locally for ${new URL(activeTabUrl).host}; page content was not read or sent.`;
    for (const step of plan.skill.recipe.adapters) {
      const item = document.createElement('li');
      const status = step.id === 'visual-assist'
        ? 'partially applied (text size only)'
        : 'not applied by this extension';
      item.textContent = `${step.id} — ${status}`;
      readingAidSteps.append(item);
    }
    for (const action of plan.actions) {
      const item = document.createElement('li');
      item.textContent = `${action.name || 'Skill action'} — not run by this extension`;
      readingAidSteps.append(item);
    }
  }

  try {
    const preferences = await browserToolkit.getPreferences();
    lowVisionProfile.checked = preferences.profileId === 'lowVision';
    updateTextSize(preferences.textSize);
    updateReadRate(preferences.readAloudRate);
    renderProfileAdapters(browserToolkit.getProfileAdapterIds());
    toolkitStatus.textContent = 'Local Toolkit profile loaded. Only supported page settings are applied.';
    await loadReadingAid();
  } catch (error) {
    console.error('Could not load Toolkit preferences:', error);
    toolkitStatus.textContent = 'Local Toolkit preferences are unavailable.';
    readingAidResult.textContent = 'The bundled skill could not be loaded.';
  }

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
      const pageSettings = typeof fontScale === 'number' ? { fontScale } : {};
      await chrome.storage.local.set({ toolkitPageSettings: pageSettings });
      if (activeTabId !== undefined) {
        await chrome.tabs.sendMessage(activeTabId, {
          type: 'APPLY_TOOLKIT_SETTINGS',
          settings: pageSettings,
        });
      }
      updateTextSize(preferences.textSize);
      updateReadRate(preferences.readAloudRate);
      toolkitStatus.textContent = 'Saved with the local Toolkit AbilityModel. Applied text size only; speech rate and other adapters are not applied here.';
      await loadReadingAid();
    } catch (error) {
      console.error('Could not save/apply Toolkit preferences:', error);
      toolkitStatus.textContent = 'Preferences were saved locally, but the active page could not be styled. Try refreshing the page.';
    } finally {
      saveToolkitPreferences.disabled = false;
    }
  });

  applyReadingAidButton.addEventListener('click', async () => {
    const fontScale = currentReadingAidPlan?.settings.fontScale;
    if (typeof fontScale !== 'number') return;
    applyReadingAidButton.disabled = true;
    try {
      const preferences = await browserToolkit.getPreferences();
      const updated = await browserToolkit.savePreferences({
        profileId: lowVisionProfile.checked ? 'lowVision' : null,
        textSize: fontScale / 100,
        readAloudRate: preferences.readAloudRate,
      });
      const pageSettings = { fontScale };
      await chrome.storage.local.set({ toolkitPageSettings: pageSettings });
      if (activeTabId !== undefined) {
        await chrome.tabs.sendMessage(activeTabId, {
          type: 'APPLY_TOOLKIT_SETTINGS',
          settings: pageSettings,
        });
      }
      updateTextSize(updated.textSize);
      toolkitStatus.textContent = 'Applied the reading aid’s supported text-size setting only. Focus mode and other adapters were not applied.';
    } catch (error) {
      console.error('Could not apply the supported reading-aid setting:', error);
      toolkitStatus.textContent = 'Could not apply the reading-aid setting to the active page.';
    } finally {
      applyReadingAidButton.disabled = !currentReadingAidPlan;
    }
  });

  toolkitTextSize.addEventListener('input', () => updateTextSize(Number(toolkitTextSize.value)));
  toolkitReadRate.addEventListener('input', () => updateReadRate(Number(toolkitReadRate.value)));

  saveBtn.addEventListener('click', async () => {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.sync) {
      await chrome.storage.sync.set({
        isEnabled: enableToggle.checked,
        ttsMode: ttsModeSelect.value,
        geminiApiKey: geminiKeyInput.value.trim(),
        enableAiFallback: enableAiFallback.checked
      });
      statusMsg.textContent = 'Settings saved!';
      statusMsg.style.display = 'block';
      setTimeout(() => {
        statusMsg.style.display = 'none';
      }, 2000);
    }
  });

  readPageBtn.addEventListener('click', async () => {
    readPageBtn.disabled = true;
    readPageBtn.textContent = 'Processing...';

    try {
      // Send message to content script to force refresh
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab.id) {
        await chrome.tabs.sendMessage(tab.id, { type: 'FORCE_REFRESH' });
        statusMsg.textContent = 'Page processed! Swipe with TalkBack to hear.';
        statusMsg.style.display = 'block';
      }
    } catch (e) {
      console.error('Force refresh failed:', e);
      statusMsg.textContent = 'Error: Please refresh the page first.';
      statusMsg.style.display = 'block';
    } finally {
      readPageBtn.disabled = false;
      readPageBtn.textContent = '📖 Read Page';
      setTimeout(() => {
        statusMsg.style.display = 'none';
      }, 3000);
    }
  });
});