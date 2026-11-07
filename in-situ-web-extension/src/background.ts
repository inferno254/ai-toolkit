/**
 * Background Service Worker for Manifest V3 Extension
 * Handles API calls and settings synchronization.
 */

import { ShengPhoneticEngine, TTSTargetMode } from '../../sheng-core-engine/dist/index.js';

let engine = new ShengPhoneticEngine({ enableAiFallback: false });

async function loadStoredSettings(): Promise<void> {
  const result = await chrome.storage.sync.get(['geminiApiKey', 'ttsMode', 'enableAiFallback', 'isEnabled']);
  if (typeof result.geminiApiKey === 'string') engine.setApiKey(result.geminiApiKey);
  if (result.ttsMode === 'en' || result.ttsMode === 'sw') engine.setTTSMode(result.ttsMode as TTSTargetMode);
  if (typeof result.enableAiFallback === 'boolean') engine.setAiFallback(result.enableAiFallback);
  else {
    engine.setAiFallback(false);
    await chrome.storage.sync.set({ enableAiFallback: false });
  }
}

let settingsReady = loadStoredSettings();

chrome.runtime.onInstalled.addListener(() => {
  settingsReady = loadStoredSettings();
});

chrome.runtime.onStartup.addListener(() => {
  settingsReady = loadStoredSettings();
});

// Listen for updates from popup or content script
chrome.storage.onChanged.addListener((changes: { [key: string]: chrome.storage.StorageChange }, area: string) => {
  if (area === 'sync') {
    if (changes.geminiApiKey && typeof changes.geminiApiKey.newValue === 'string') {
      engine.setApiKey(changes.geminiApiKey.newValue);
    }
    if (changes.ttsMode && (changes.ttsMode.newValue === 'en' || changes.ttsMode.newValue === 'sw')) {
      engine.setTTSMode(changes.ttsMode.newValue as TTSTargetMode);
    }
    if (changes.enableAiFallback && typeof changes.enableAiFallback.newValue === 'boolean') {
      engine.setAiFallback(changes.enableAiFallback.newValue);
    }
  }
});

// Process text requests from content scripts
chrome.runtime.onMessage.addListener((request: unknown, _sender, sendResponse) => {
  if (!request || typeof request !== 'object' || !('type' in request) || request.type !== 'ADAPT_TEXT') {
    return false;
  }
  if (!('text' in request) || typeof request.text !== 'string') {
    sendResponse({ success: false, error: 'ADAPT_TEXT requires a string text field.' });
    return false;
  }
  const text = request.text;

  void (async () => {
    try {
      await settingsReady;
      const result = await engine.process(text);
      sendResponse({ success: true, data: result });
    } catch (error) {
      sendResponse({ success: false, error: String(error) });
    }
  })();
  return true;
});
