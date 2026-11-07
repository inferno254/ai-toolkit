export type Pronunciation = {
  word: string;
  phonetic: string;
  language: "en" | "sw";
};

const WORD_PATTERN = /^[\p{L}\p{M}][\p{L}\p{M}'’-]{0,39}$/u;
const PHONETIC_PATTERN = /^[\p{L}\p{M}'’-]{1,60}$/u;

export function validateRequestedWords(value: unknown): string[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > 20) {
    throw new Error("Provide between 1 and 20 unknown words.");
  }

  const words = value.map((word) => {
    if (typeof word !== "string" || !WORD_PATTERN.test(word)) {
      throw new Error("Each word must be a single valid word of at most 40 characters.");
    }
    return word;
  });

  if (new Set(words.map((word) => word.toLocaleLowerCase("en"))).size !== words.length) {
    throw new Error("Words must be unique within a request.");
  }

  return words;
}

export function validateContext(value: unknown): string {
  if (
    typeof value !== "string" ||
    value.length > 280 ||
    value.includes("\u0000")
  ) {
    throw new Error("Context must be text of at most 280 characters.");
  }
  return value;
}

export function validateImage(value: unknown, mimeType: unknown): string {
  const maxBytes = 1_500_000;
  if (
    mimeType !== "image/jpeg" ||
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > Math.ceil(maxBytes / 3) * 4
  ) {
    throw new Error("Provide a JPEG image smaller than 1.5 MB.");
  }

  const bytes = Buffer.from(value, "base64");
  if (
    bytes.length === 0 ||
    bytes.length > maxBytes ||
    bytes[0] !== 0xff ||
    bytes[1] !== 0xd8 ||
    bytes[2] !== 0xff ||
    bytes.toString("base64") !== value
  ) {
    throw new Error("The image data is invalid or too large.");
  }
  return value;
}

export function validateOcrText(value: unknown): string {
  if (
    typeof value !== "string" ||
    value.length > 6000 ||
    /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/u.test(value)
  ) {
    throw new Error("The OCR result was invalid or too long.");
  }
  return value.trim();
}

export function validateModelPronunciations(
  requestedWords: string[],
  value: unknown,
): Pronunciation[] {
  if (!Array.isArray(value) || value.length !== requestedWords.length) {
    throw new Error("The model returned an invalid result count.");
  }

  const requestedByLowercase = new Map(
    requestedWords.map((word) => [word.toLocaleLowerCase("en"), word]),
  );
  const seen = new Set<string>();

  const pronunciations = value.map((entry): Pronunciation => {
    if (typeof entry !== "object" || entry === null) {
      throw new Error("The model returned an invalid pronunciation.");
    }
    const candidate = entry as Record<string, unknown>;
    if (
      typeof candidate.word !== "string" ||
      typeof candidate.phonetic !== "string" ||
      (candidate.language !== "en" && candidate.language !== "sw")
    ) {
      throw new Error("The model returned an invalid pronunciation.");
    }

    const canonicalWord = requestedByLowercase.get(candidate.word.toLocaleLowerCase("en"));
    if (
      canonicalWord === undefined ||
      seen.has(canonicalWord.toLocaleLowerCase("en")) ||
      !PHONETIC_PATTERN.test(candidate.phonetic)
    ) {
      throw new Error("The model returned an unrequested or malformed pronunciation.");
    }
    seen.add(canonicalWord.toLocaleLowerCase("en"));

    return {
      word: canonicalWord,
      phonetic: candidate.phonetic,
      language: candidate.language,
    };
  });

  if (seen.size !== requestedWords.length) {
    throw new Error("The model did not return every requested word.");
  }

  return pronunciations;
}
