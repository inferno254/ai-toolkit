/**
 * Content Script for In-Situ Web Adaptation Layer
 * - Processes readable content blocks without overwriting unchanged page labels
 * - Adds phonetic aria-labels only where a known pronunciation changed the text
 * - Preserves innerText and visual styling untouched
 * - Uses user-controlled pronunciation and optional online-fallback settings
 * - Processes full sentences for natural TalkBack reading
 */

import { ShengPhoneticEngine, TTSTargetMode } from '../../sheng-core-engine/dist/index.js';

const TEXT_BLOCK_SELECTOR =
  'h1, h2, h3, h4, h5, h6, p, li, button, a, td, th, label, figcaption, blockquote, pre, code, dt, dd';
const CONTAINER_SELECTOR = 'div, article, section';

class ShengDOMAdapter {
  private engine: ShengPhoneticEngine;
  private isEnabled: boolean = true;
  private enableAiFallback = false;
  private observer: MutationObserver | null = null;
  private processedNodes: WeakSet<Element> = new WeakSet();
  private scanRequested = false;
  private processingVersion = 0;
  private processingPromise: Promise<void> | null = null;
  private mutationTimer: ReturnType<typeof setTimeout> | null = null;
  private originalBodyZoom = '';

  constructor() {
    this.engine = new ShengPhoneticEngine({ enableAiFallback: false });
  }

  public async initialize(): Promise<void> {
    this.originalBodyZoom = document.body?.style.zoom || '';
    // 1. Fetch settings from extension storage
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.sync) {
      const data = await chrome.storage.sync.get(['isEnabled', 'ttsMode', 'enableAiFallback']);
      this.isEnabled = typeof data.isEnabled === 'boolean' ? data.isEnabled : true;
      if (data.ttsMode === 'en' || data.ttsMode === 'sw') {
        this.engine.setTTSMode(data.ttsMode as TTSTargetMode);
      }
      if (typeof data.geminiApiKey === 'string') {
        this.engine.setApiKey(data.geminiApiKey);
      }
      if (typeof data.enableAiFallback === 'boolean') {
        this.enableAiFallback = data.enableAiFallback;
      }

      // Listen for toggle updates
      chrome.storage.onChanged.addListener((changes: { [key: string]: chrome.storage.StorageChange }, area: string) => {
        if (area === 'local' && changes.toolkitPageSettings) {
          this.applyToolkitPageSettings(changes.toolkitPageSettings.newValue);
        }
        if (area === 'sync') {
          if (changes.isEnabled && typeof changes.isEnabled.newValue === 'boolean') {
            this.isEnabled = changes.isEnabled.newValue;
            if (this.isEnabled) {
              void this.forceRefresh();
            } else {
              this.revertDOM();
            }
          }
          if (changes.ttsMode && (changes.ttsMode.newValue === 'en' || changes.ttsMode.newValue === 'sw')) {
            this.engine.setTTSMode(changes.ttsMode.newValue as TTSTargetMode);
            void this.forceRefresh();
          }
          if (changes.enableAiFallback && typeof changes.enableAiFallback.newValue === 'boolean') {
            this.enableAiFallback = changes.enableAiFallback.newValue;
            void this.forceRefresh();
          }
        }
      });
    }

    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      const { toolkitPageSettings } = await chrome.storage.local.get('toolkitPageSettings');
      this.applyToolkitPageSettings(toolkitPageSettings);
    }

    // 2. Perform initial scan
    if (this.isEnabled) {
      this.processDOM();
      this.setupObserver();
    }
  }

  /**
   * Process ALL readable text on the page for TalkBack
   * Returns a promise that resolves when all processing is complete
   */
  public async processDOM(): Promise<void> {
    if (!this.isEnabled) return;
    this.scanRequested = true;
    if (this.processingPromise) return this.processingPromise;

    this.processingPromise = this.runDOMScans();
    try {
      await this.processingPromise;
    } finally {
      this.processingPromise = null;
    }
  }

  private async runDOMScans(): Promise<void> {
    do {
      this.scanRequested = false;
      const version = this.processingVersion;
      const targets = this.getTargets();

      for (let i = 0; i < targets.length; i += 50) {
        if (version !== this.processingVersion || !this.isEnabled) break;
        await Promise.all(targets.slice(i, i + 50).map(node => this.processNode(node, version)));
        if (i + 50 < targets.length) await new Promise(resolve => setTimeout(resolve, 0));
      }
    } while (this.scanRequested && this.isEnabled);
  }

  private getTargets(): HTMLElement[] {
    const blocks = Array.from(document.querySelectorAll<HTMLElement>(TEXT_BLOCK_SELECTOR));
    const targets = blocks.filter(node => {
      if (node.matches('a, button')) return true;
      return !node.parentElement?.closest(TEXT_BLOCK_SELECTOR);
    });

    for (const node of document.querySelectorAll<HTMLElement>(CONTAINER_SELECTOR)) {
      if (node.querySelector(TEXT_BLOCK_SELECTOR) || node.querySelector(CONTAINER_SELECTOR)) continue;
      targets.push(node);
    }

    return targets.filter(node => {
      if (this.processedNodes.has(node)) return false;
      if (node.closest('[hidden], [aria-hidden="true"], [inert], script, style, noscript, svg, canvas')) return false;
      if (node.isContentEditable) return false;
      const style = window.getComputedStyle(node);
      if (style.display === 'none' || style.visibility === 'hidden') return false;
      const text = (node.getAttribute('aria-label') || node.innerText || '').trim();
      if (text.length < 2) return false;
      return true;
    });
  }

  private async processNode(node: HTMLElement, version: number): Promise<void> {
    const text = (node.getAttribute('aria-label') || node.innerText || '').trim();
    if (!text || text.length < 2) return;

    try {
      let result = await this.engine.process(text);
      if (version !== this.processingVersion || !this.isEnabled) return;
      if (this.enableAiFallback && typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
        try {
          const response = await chrome.runtime.sendMessage({
            type: 'ADAPT_TEXT',
            text
          });
          if (version !== this.processingVersion || !this.isEnabled) return;
          if (response?.success && typeof response.data?.adapted === 'string') {
            result = response.data;
          } else if (response?.success === false) {
            console.warn('Online Sheng fallback failed:', response.error);
          }
        } catch (error) {
          console.warn('Could not reach the online Sheng fallback:', error);
        }
      }
      this.processedNodes.add(node);
      if (result.adapted === text) return;

      if (node.hasAttribute('aria-label')) {
        node.setAttribute('data-sheng-original-aria', node.getAttribute('aria-label') || '');
      }
      node.setAttribute('aria-label', result.adapted);
      node.setAttribute('data-sheng-adapted', 'true');
    } catch (e) {
      console.warn('Sheng processing failed for node:', e);
      if (version === this.processingVersion && this.isEnabled) this.processedNodes.add(node);
    }
  }

  public revertDOM(): void {
    this.processingVersion++;
    this.scanRequested = false;
    this.processedNodes = new WeakSet();
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
    this.observer = new MutationObserver(mutations => {
      if (!this.isEnabled) return;

      let shouldScan = false;
      for (const m of mutations) {
        if (m.type === 'attributes') continue;
        const changedElement = m.target instanceof Element ? m.target : m.target.parentElement;
        const affectedBlock = changedElement?.closest<HTMLElement>(
          `${TEXT_BLOCK_SELECTOR}, ${CONTAINER_SELECTOR}`
        );
        if (affectedBlock) this.restoreNode(affectedBlock);
        shouldScan = true;
      }
      if (shouldScan && this.mutationTimer) clearTimeout(this.mutationTimer);
      if (shouldScan) {
        this.mutationTimer = setTimeout(() => void this.processDOM(), 100);
      }
    });

    this.observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true
    });
  }

  private restoreNode(node: Element): void {
    this.processedNodes.delete(node);
    if (node.getAttribute('data-sheng-adapted') !== 'true') return;
    if (node.hasAttribute('data-sheng-original-aria')) {
      node.setAttribute('aria-label', node.getAttribute('data-sheng-original-aria') || '');
      node.removeAttribute('data-sheng-original-aria');
    } else {
      node.removeAttribute('aria-label');
    }
    node.removeAttribute('data-sheng-adapted');
  }

  /**
   * Public method to force re-processing (e.g., after manual "Read Page" click)
   */
  public async forceRefresh(): Promise<void> {
    this.revertDOM();
    await this.processDOM();
  }

  public applyToolkitPageSettings(settings: unknown): void {
    if (!settings || typeof settings !== 'object') return;
    const fontScale = (settings as { fontScale?: unknown }).fontScale;
    if (typeof fontScale !== 'number' || !Number.isFinite(fontScale) || fontScale < 80 || fontScale > 200) return;
    if (!document.body) return;
    document.body.style.zoom = fontScale === 100 ? this.originalBodyZoom : `${fontScale}%`;
  }
}

// Auto-instantiate in page
const adapter = new ShengDOMAdapter();
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => adapter.initialize());
} else {
  adapter.initialize();
}

// Expose for popup communication
if (typeof window !== 'undefined') {
  (window as any).__shengAdapter = adapter;
}

// Listen for messages from popup
if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onMessage) {
  chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
    if (request && request.type === 'FORCE_REFRESH') {
      adapter.forceRefresh()
        .then(() => sendResponse({ success: true }))
        .catch((e) => sendResponse({ success: false, error: String(e) }));
      return true; // async response
    }
    if (request && request.type === 'APPLY_TOOLKIT_SETTINGS') {
      adapter.applyToolkitPageSettings(request.settings);
      sendResponse({ success: true });
    }
  });
}