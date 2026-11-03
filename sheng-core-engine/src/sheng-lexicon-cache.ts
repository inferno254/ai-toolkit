/**
 * Kenyan Sheng Lexicon Cache & Trie Lookup
 * Fast in-memory map/Trie providing sub-millisecond deterministic substitutions.
 */

import { AffixDecomposition, MorphologicalRootParser } from './morphological-root-parser';

export interface LexiconEntry {
  term: string;
  phoneticEn: string;
  phoneticSw: string;
  tags?: string[];
  notes?: string;
}

export type TTSTargetMode = 'en' | 'sw';

export class ShengLexiconCache {
  private dictionary: Map<string, LexiconEntry>;
  private parser: MorphologicalRootParser;

  constructor(entries: LexiconEntry[], prefixes: { prefix: string; phonetic: string }[]) {
    this.dictionary = new Map();
    this.parser = new MorphologicalRootParser(prefixes);

    for (const entry of entries) {
      this.dictionary.set(entry.term.toLowerCase().trim(), entry);
    }
  }

  public getTerms(): string[] {
    return Array.from(this.dictionary.keys());
  }

  public lookup(term: string): LexiconEntry | undefined {
    return this.dictionary.get(term.toLowerCase().trim());
  }

  /**
   * Resolves phonetic respelling for a single word, handling both direct matches
   * and agglutinative affixes (e.g. 'wanadhokoma' -> 'wana' + 'dhokoma').
   */
  public resolveWordPhonetic(word: string, targetMode: TTSTargetMode = 'en'): string | null {
    const clean = word.toLowerCase().trim();
    if (!clean) return null;

    // 1. Direct match
    const direct = this.dictionary.get(clean);
    if (direct) {
      return targetMode === 'en' ? direct.phoneticEn : direct.phoneticSw;
    }

    // 2. Morphological decomposition (prefix + root)
    const decomp: AffixDecomposition = this.parser.decompose(clean);
    if (decomp.isRecognizedPrefix) {
      const rootEntry = this.dictionary.get(decomp.root);
      if (rootEntry) {
        const rootPhonetic = targetMode === 'en' ? rootEntry.phoneticEn : rootEntry.phoneticSw;
        return this.parser.reconstructPhonetics(decomp.prefixPhonetic, rootPhonetic);
      }
    }

    return null;
  }

  /**
   * Fast-path deterministic sentence scan and substitution.
   * Returns transformed text and an indicator if unseen slang remains.
   */
  public fastPathTransform(
    sentence: string,
    targetMode: TTSTargetMode = 'en'
  ): { transformed: string; transformedCount: number } {
    let transformedCount = 0;

    // Replace words while preserving punctuation and spacing
    const result = sentence.replace(/\b([a-zA-Z'-]+)\b/g, (match) => {
      const phonetic = this.resolveWordPhonetic(match, targetMode);
      if (phonetic) {
        transformedCount++;
        // Maintain first letter capitalization if source was capitalized
        if (match[0] === match[0].toUpperCase() && match[0] !== match[0].toLowerCase()) {
          return phonetic.charAt(0).toUpperCase() + phonetic.slice(1);
        }
        return phonetic;
      }
      return match;
    });

    return { transformed: result, transformedCount };
  }
}

