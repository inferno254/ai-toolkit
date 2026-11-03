document.addEventListener('DOMContentLoaded', async () => {
  const enableToggle = document.getElementById('enable-toggle') as HTMLInputElement;
  const ttsModeSelect = document.getElementById('tts-mode') as HTMLSelectElement;
  const geminiKeyInput = document.getElementById('gemini-key') as HTMLInputElement;
  const saveBtn = document.getElementById('save-btn') as HTMLButtonElement;
  const statusMsg = document.getElementById('status-msg') as HTMLDivElement;

  if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.sync) {
    const data = await chrome.storage.sync.get(['isEnabled', 'ttsMode', 'geminiApiKey']);
    if (typeof data.isEnabled === 'boolean') enableToggle.checked = data.isEnabled;
    if (typeof data.ttsMode === 'string') ttsModeSelect.value = data.ttsMode;
    if (typeof data.geminiApiKey === 'string') geminiKeyInput.value = data.geminiApiKey;
  }

  saveBtn.addEventListener('click', async () => {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.sync) {
      await chrome.storage.sync.set({
        isEnabled: enableToggle.checked,
        ttsMode: ttsModeSelect.value,
        geminiApiKey: geminiKeyInput.value.trim()
      });
      statusMsg.style.display = 'block';
      setTimeout(() => {
        statusMsg.style.display = 'none';
      }, 2000);
    }
  });
});
