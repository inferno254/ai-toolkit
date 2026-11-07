/**
 * Main Sheng Phonetic Engine
 * Orchestrates the full 5-component pipeline:
 * 1. LID (Language Identifier)
 * 2. Morphological Root Parser
 * 3. Lexicon Cache Fast-Path Substitution
 * 4. Gemini Adapter Fallback for ambiguous/unseen slang
 * 5. Deterministic Non-AI First rule
 */

import lexiconData from './sheng-lexicon.json' with { type: 'json' };
import { LanguageIdentifier } from './language-identifier.js';
import { ShengLexiconCache, TTSTargetMode } from './sheng-lexicon-cache.js';
import { GeminiPhoneticAdapter } from './gemini-adapter.js';

export interface PhoneticEngineOptions {
  geminiApiKey?: string;
  defaultTTSMode?: TTSTargetMode;
  enableAiFallback?: boolean;
}

export class ShengPhoneticEngine {
  private lid: LanguageIdentifier;
  private lexiconCache: ShengLexiconCache;
  private geminiAdapter: GeminiPhoneticAdapter;
  private ttsMode: TTSTargetMode;
  private enableAiFallback: boolean;

  constructor(options: PhoneticEngineOptions = {}) {
    this.ttsMode = options.defaultTTSMode || 'en';
    this.enableAiFallback = options.enableAiFallback ?? true;

    this.lexiconCache = new ShengLexiconCache(
      lexiconData.lexicon,
      lexiconData.prefixes
    );

    this.lid = new LanguageIdentifier(this.lexiconCache.getTerms());

    this.geminiAdapter = new GeminiPhoneticAdapter(
      options.geminiApiKey || '',
      lexiconData.fewShotExamples
    );
  }

  public setApiKey(key: string): void {
    this.geminiAdapter.setApiKey(key);
  }

  public setTTSMode(mode: TTSTargetMode): void {
    this.ttsMode = mode;
  }

  public setAiFallback(enable: boolean): void {
    this.enableAiFallback = enable;
  }

  /**
   * Fast check if text warrants adaptation.
   */
  public shouldAdapt(text: string): boolean {
    if (!text || text.trim().length === 0) return false;
    return this.lid.containsShengOrCodeSwitching(text);
  }

  /**
   * Primary processing pipeline:
   * Fast-path deterministic lookup first -> If needed & enabled, Gemini edge polish.
   */
  public async process(
    text: string,
    overrideMode?: TTSTargetMode
  ): Promise<{
    original: string;
    adapted: string;
    usedFastPath: boolean;
    usedAiFallback: boolean;
    substitutionsCount: number;
  }> {
    if (!text || text.trim().length === 0) {
      return {
        original: text,
        adapted: text,
        usedFastPath: false,
        usedAiFallback: false,
        substitutionsCount: 0
      };
    }

    const mode = overrideMode || this.ttsMode;

    // Step 1: Fast deterministic pre-processor (Lexicon Cache + Morphological Parser)
    const { transformed, transformedCount } = this.lexiconCache.fastPathTransform(text, mode);

    let finalAdapted = transformed;
    let usedAiFallback = false;

    // Step 2: Check if ambiguous code-switching remains and AI fallback is desired
    if (this.enableAiFallback) {
      const remainingSpans = this.lid.tokenize(finalAdapted);
      const hasUnresolvedSlang = remainingSpans.some(
        (span) => span.isSlangCandidate && span.category !== 'english' && span.cleanToken.length > 2
      );

      if (hasUnresolvedSlang) {
        const aiOutput = await this.geminiAdapter.adapt(finalAdapted);
        if (aiOutput && aiOutput !== finalAdapted) {
          finalAdapted = aiOutput;
          usedAiFallback = true;
        }
      }
    }

    return {
      original: text,
      adapted: finalAdapted,
      usedFastPath: transformedCount > 0,
      usedAiFallback,
      substitutionsCount: transformedCount
    };
  }
}

export * from './language-identifier.js';
export * from './morphological-root-parser.js';
export * from './sheng-lexicon-cache.js';
export * from './gemini-adapter.js';
