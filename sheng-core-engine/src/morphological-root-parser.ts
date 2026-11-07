/**
 * Morphological Root Parser
 * Handles Bantu / Swahili agglutinative affixes (ku-, wana-, zili-, etc.)
 * attached to dynamic Sheng roots.
 */

export interface AffixDecomposition {
  prefix: string;
  prefixPhonetic: string;
  root: string;
  isRecognizedPrefix: boolean;
}

export class MorphologicalRootParser {
  private prefixes: Map<string, string>;

  constructor(prefixList: { prefix: string; phonetic: string }[]) {
    // Sort descending by length so longer prefixes (wana-, zili-) match first
    const sorted = [...prefixList].sort((a, b) => b.prefix.length - a.prefix.length);
    this.prefixes = new Map(sorted.map((p) => [p.prefix.toLowerCase(), p.phonetic]));
  }

  public decompose(word: string): AffixDecomposition {
    const lower = word.toLowerCase().trim();

    for (const [prefix, phonetic] of this.prefixes.entries()) {
      if (lower.startsWith(prefix) && lower.length > prefix.length + 2) {
        const root = lower.slice(prefix.length);
        return {
          prefix,
          prefixPhonetic: phonetic,
          root,
          isRecognizedPrefix: true
        };
      }
    }

    return {
      prefix: '',
      prefixPhonetic: '',
      root: lower,
      isRecognizedPrefix: false
    };
  }

  public reconstructPhonetics(prefixPhonetic: string, rootPhonetic: string): string {
    if (!prefixPhonetic) return rootPhonetic;
    const needsSeparator = !/[\s-]$/.test(prefixPhonetic);
    return `${prefixPhonetic}${needsSeparator ? '-' : ''}${rootPhonetic}`;
  }
}
