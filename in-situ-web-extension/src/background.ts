/**
 * Background Service Worker for Manifest V3 Extension
 * Handles API calls, settings synchronization, and toolkit integration.
 */

import { ShengPhoneticEngine, TTSTargetMode } from '../../sheng-core-engine/dist/index.js';

let engine = new ShengPhoneticEngine();

// Load stored settings on startup
chrome.runtime.onInstalled.addListener(async () => {
  const result = await chrome.storage.sync.get(['geminiApiKey', 'ttsMode', 'enableAiFallback', 'isEnabled']);
  if (typeof result.geminiApiKey === 'string') engine.setApiKey(result.geminiApiKey);
  if (result.ttsMode === 'en' || result.ttsMode === 'sw') engine.setTTSMode(result.ttsMode as TTSTargetMode);
  if (typeof result.enableAiFallback === 'boolean') engine.setAiFallback(result.enableAiFallback);
  if (result.isEnabled === undefined) {
    await chrome.storage.sync.set({ isEnabled: true });
  }
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
chrome.runtime.onMessage.addListener((request: any, _sender: chrome.runtime.MessageSender, sendResponse: (response?: any) => void) => {
  if (request && request.type === 'ADAPT_TEXT') {
    engine
      .process(request.text)
      .then((res) => sendResponse({ success: true, data: res }))
      .catch((err) => sendResponse({ success: false, error: String(err) }));
    return true; // async reply
  }
});
