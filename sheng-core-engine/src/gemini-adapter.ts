/**
 * Gemini Adapter Fallback
 * Provides zero-shot and few-shot in-context learning for ambiguous code-switching
 * and unseen Sheng slang, outputting TalkBack-optimized phonetic smoothing.
 */

export interface FewShotExemplar {
  input: string;
  output: string;
}

export class GeminiPhoneticAdapter {
  private apiKey: string;
  private fewShotExamples: FewShotExemplar[];

  constructor(apiKey: string = '', fewShotExamples: FewShotExemplar[] = []) {
    this.apiKey = apiKey;
    this.fewShotExamples = fewShotExamples;
  }

  public setApiKey(key: string): void {
    this.apiKey = key;
  }

  public buildSystemInstruction(): string {
    return [
      'You are a specialized Assistive Technology Speech Normalizer for visually impaired users in Kenya who rely on Android TalkBack.',
      '',
      'CRITICAL DIRECTIVE - PHONETIC SMOOTHING ONLY, NEVER TRANSLATE:',
      '- Blind and low-vision users already understand Sheng, Kiswahili, and English.',
      '- Do NOT translate Sheng into English or standard Kiswahili (semantic translation destroys nuance and identity).',
      '- Only rewrite Sheng words and code-switched phrases into PHONETIC RESPELLINGS so standard English (US/UK) or Swahili Text-To-Speech (TTS) engines pronounce them naturally without butchering or spelling them letter-by-letter.',
      '- Keep standard English words unchanged.',
      '- Retain punctuation, capitalization, and original sentence flow.',
      '- Return ONLY the smoothed text string with zero explanations, notes, or markup.'
    ].join('\n');
  }

  public buildPrompt(text: string): string {
    const examplesBlock = this.fewShotExamples
      .map((ex, i) => `Example ${i + 1}:\nInput: ${ex.input}\nOutput: ${ex.output}`)
      .join('\n\n');

    return `${examplesBlock}\n\nTask:\nInput: ${text}\nOutput:`;
  }

  /**
   * Adapts complex, unseen code-switched text using Gemini API.
   * If API key is missing or request fails, falls back cleanly to original text.
   */
  public async adapt(text: string): Promise<string> {
    if (!this.apiKey) {
      return text;
    }

    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${this.apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [
              {
                role: 'user',
                parts: [{ text: `${this.buildSystemInstruction()}\n\n${this.buildPrompt(text)}` }]
              }
            ],
            generationConfig: {
              temperature: 0.1,
              maxOutputTokens: 1024
            }
          })
        }
      );

      if (!response.ok) {
        console.warn('Gemini API call failed with status:', response.status);
        return text;
      }

      const data = await response.json();
      const output = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
      return output || text;
    } catch (err) {
      console.error('Error invoking Gemini phonetic adapter:', err);
      return text;
    }
  }
}

