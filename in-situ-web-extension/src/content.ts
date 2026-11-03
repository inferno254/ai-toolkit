/**
 * Content Script for In-Situ Web Adaptation Layer
 * - Intercepts DOM elements (p, h1-h6, span, li, button)
 * - Updates aria-label with smoothed phonetics
 * - Preserves innerText and visual styling untouched
 * - Integrates with profile switch states
 */

import { ShengPhoneticEngine, TTSTargetMode } from '../../sheng-core-engine/src/index';

class ShengDOMAdapter {
  private engine: ShengPhoneticEngine;
  private isEnabled: boolean = true;
  private observer: MutationObserver | null = null;
  private processedNodes: WeakSet<Element> = new WeakSet();

  constructor() {
    this.engine = new ShengPhoneticEngine();
  }

  public async initialize(): Promise<void> {
    // 1. Fetch settings from extension storage
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.sync) {
      const data = await chrome.storage.sync.get(['isEnabled', 'ttsMode', 'geminiApiKey', 'enableAiFallback']);
      this.isEnabled = typeof data.isEnabled === 'boolean' ? data.isEnabled : true;
      if (data.ttsMode === 'en' || data.ttsMode === 'sw') {
        this.engine.setTTSMode(data.ttsMode as TTSTargetMode);
      }
      if (typeof data.geminiApiKey === 'string') {
        this.engine.setApiKey(data.geminiApiKey);
      }
      if (typeof data.enableAiFallback === 'boolean') {
        this.engine.setAiFallback(data.enableAiFallback);
      }

      // Listen for toggle updates
      chrome.storage.onChanged.addListener((changes: { [key: string]: chrome.storage.StorageChange }, area: string) => {
        if (area === 'sync') {
          if (changes.isEnabled && typeof changes.isEnabled.newValue === 'boolean') {
            this.isEnabled = changes.isEnabled.newValue;
            if (this.isEnabled) {
              this.processDOM();
            } else {
              this.revertDOM();
            }
          }
          if (changes.ttsMode && (changes.ttsMode.newValue === 'en' || changes.ttsMode.newValue === 'sw')) {
            this.engine.setTTSMode(changes.ttsMode.newValue as TTSTargetMode);
          }
          if (changes.geminiApiKey && typeof changes.geminiApiKey.newValue === 'string') {
            this.engine.setApiKey(changes.geminiApiKey.newValue);
          }
        }
      });
    }

    // 2. Perform initial scan
    if (this.isEnabled) {
      this.processDOM();
      this.setupObserver();
    }
  }

  public processDOM(): void {
    const targets = document.querySelectorAll<HTMLElement>('p, h1, h2, h3, h4, h5, h6, span, li, button, a');

    targets.forEach(async (node) => {
      // Skip if already processed, empty, or hidden
      if (this.processedNodes.has(node)) return;
      const text = node.innerText?.trim();
      if (!text || text.length < 3) return;

      // Only inspect leaf or direct text nodes to prevent parent duplication
      if (node.children.length > 0 && node.tagName.toLowerCase() !== 'button') {
        return;
      }

      if (this.engine.shouldAdapt(text)) {
        this.processedNodes.add(node);

        // Store original aria-label if present for clean reverting
        if (node.hasAttribute('aria-label')) {
          node.setAttribute('data-sheng-original-aria', node.getAttribute('aria-label') || '');
        }

        const result = await this.engine.process(text);
        if (result.adapted && result.adapted !== text) {
          // Deliver phonetic pronunciation to screen reader while preserving visual layout
          node.setAttribute('aria-label', result.adapted);
          node.setAttribute('data-sheng-adapted', 'true');
        }
      }
    });
  }

  public revertDOM(): void {
    const adaptedNodes = document.querySelectorAll('[data-sheng-adapted="true"]');
    adaptedNodes.forEach((node) => {
      if (node.hasAttribute('data-sheng-original-aria')) {
        node.setAttribute('aria-label', node.getAttribute('data-sheng-original-aria') || '');
        node.removeAttribute('data-sheng-original-aria');
      } else {
        node.removeAttribute('aria-label');
      }
      node.removeAttribute('data-sheng-adapted');
      this.processedNodes.delete(node);
    });
  }

  private setupObserver(): void {
    this.observer = new MutationObserver((mutations) => {
      if (!this.isEnabled) return;
      let shouldScan = false;
      for (const m of mutations) {
        if (m.addedNodes.length > 0) {
          shouldScan = true;
          break;
        }
      }
      if (shouldScan) {
        this.processDOM();
      }
    });

    this.observer.observe(document.body, {
      childList: true,
      subtree: true
    });
  }
}

// Auto-instantiate in page
const adapter = new ShengDOMAdapter();
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => adapter.initialize());
} else {
  adapter.initialize();
}
