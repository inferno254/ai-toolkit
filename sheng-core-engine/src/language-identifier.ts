/**
 * Language Identifier (LID) Module
 * Fast regex and n-gram classifier identifying English, Kiswahili, and Sheng spans.
 */

export type LanguageCategory = 'english' | 'swahili' | 'sheng' | 'mixed' | 'neutral';

export interface TokenSpan {
  token: string;
  cleanToken: string;
  category: LanguageCategory;
  isSlangCandidate: boolean;
  prefix?: string;
  root?: string;
}

const COMMON_ENGLISH_WORDS = new Set([
  'the', 'be', 'to', 'of', 'and', 'a', 'in', 'that', 'have', 'i', 'it', 'for', 'not', 'on',
  'with', 'he', 'as', 'you', 'do', 'at', 'this', 'but', 'his', 'by', 'from', 'they', 'we',
  'say', 'her', 'she', 'or', 'an', 'will', 'my', 'one', 'all', 'would', 'there', 'their',
  'what', 'so', 'up', 'out', 'if', 'about', 'who', 'get', 'which', 'go', 'me', 'when',
  'make', 'can', 'like', 'time', 'no', 'just', 'him', 'know', 'take', 'people', 'into',
  'year', 'your', 'good', 'some', 'could', 'them', 'see', 'other', 'than', 'then', 'now',
  'look', 'only', 'come', 'its', 'over', 'think', 'also', 'back', 'after', 'use', 'two',
  'how', 'our', 'work', 'first', 'well', 'way', 'even', 'new', 'want', 'because', 'any',
  'these', 'give', 'day', 'most', 'us', 'meeting', 'office', 'service', 'registration'
]);

const COMMON_SWAHILI_WORDS = new Set([
  'na', 'ya', 'wa', 'kwa', 'katika', 'ni', 'la', 'za', 'cha', 'vya', 'ili', 'hata', 'kama',
  'lakini', 'au', 'bila', 'zaidi', 'yake', 'yake', 'wake', 'zao', 'yetu', 'yenu', 'pale',
  'hapa', 'sana', 'wote', 'yote', 'chote', 'kila', 'mtu', 'watu', 'kitu', 'vitu', 'leo',
  'kesho', 'jana', 'sasa', 'bado', 'basi', 'tafadhali', 'asante', 'habari', 'nzuri', 'mzuri',
  'wazuri', 'ndio', 'hapana', 'kwamba', 'sababu', 'wakati', 'nchi', 'mji', 'nyumbani'
]);

export class LanguageIdentifier {
  private shengRoots: Set<string>;

  constructor(knownShengTerms: string[] = []) {
    this.shengRoots = new Set(knownShengTerms.map((t) => t.toLowerCase().trim()));
  }

  public updateShengTerms(terms: string[]): void {
    terms.forEach((t) => this.shengRoots.add(t.toLowerCase().trim()));
  }

  public tokenize(text: string): TokenSpan[] {
    const rawTokens = text.split(/(\s+|[.,!?;:()[\]{}"])/);
    const spans: TokenSpan[] = [];

    for (const raw of rawTokens) {
      if (!raw) continue;
      const clean = raw.toLowerCase().replace(/[^a-z0-9'-]/g, '');
      if (!clean) {
        spans.push({
          token: raw,
          cleanToken: '',
          category: 'neutral',
          isSlangCandidate: false
        });
        continue;
      }

      const cat = this.classifyToken(clean);
      spans.push({
        token: raw,
        cleanToken: clean,
        category: cat,
        isSlangCandidate: cat === 'sheng' || (cat !== 'english' && !COMMON_SWAHILI_WORDS.has(clean))
      });
    }

    return spans;
  }

  public classifyToken(token: string): LanguageCategory {
    const clean = token.toLowerCase();

    if (this.shengRoots.has(clean)) {
      return 'sheng';
    }

    if (COMMON_ENGLISH_WORDS.has(clean)) {
      return 'english';
    }

    if (COMMON_SWAHILI_WORDS.has(clean)) {
      return 'swahili';
    }

    // Swahili prefix patterns
    if (/^(ku|wana|wame|wali|tuna|tuta|nita|nina|ana|ali|ata|zili|vina|kuji)[a-z]{3,}$/.test(clean)) {
      return 'swahili';
    }

    return 'neutral';
  }

  public containsShengOrCodeSwitching(text: string): boolean {
    const spans = this.tokenize(text);
    let shengCount = 0;
    let swahiliCount = 0;
    let englishCount = 0;

    for (const span of spans) {
      if (span.category === 'sheng') shengCount++;
      else if (span.category === 'swahili') swahiliCount++;
      else if (span.category === 'english') englishCount++;
    }

    // Direct Sheng detected
    if (shengCount > 0) return true;

    // Mixed English and Swahili/slang detected
    if (englishCount > 0 && swahiliCount > 0) return true;

    return false;
  }
}

