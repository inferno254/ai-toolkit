import assert from "node:assert/strict";
import test from "node:test";
import {
  validateContext,
  validateImage,
  validateModelPronunciations,
  validateOcrText,
  validateRequestedWords,
} from "../lib/validation.js";

test("accepts bounded unique Sheng words", () => {
  assert.deepEqual(validateRequestedWords(["msee", "form"]), ["msee", "form"]);
});

test("rejects empty, oversized, duplicate, or malformed requests", () => {
  for (const input of [[], Array(21).fill("word"), ["sawa", "SAWA"], ["one two"]]) {
    assert.throws(() => validateRequestedWords(input));
  }
});

test("bounds phrase context", () => {
  assert.equal(validateContext("leo tuko stage"), "leo tuko stage");
  assert.throws(() => validateContext("x".repeat(281)));
  assert.throws(() => validateContext(null));
});

test("accepts bounded JPEG image data and rejects invalid uploads", () => {
  const image = Buffer.from([0xff, 0xd8, 0xff]).toString("base64");
  assert.equal(validateImage(image, "image/jpeg"), image);
  assert.throws(() => validateImage(image, "image/png"));
  assert.throws(() => validateImage("not base64", "image/jpeg"));
  assert.throws(() => validateImage(Buffer.alloc(1_500_001).toString("base64"), "image/jpeg"));
});

test("bounds OCR output and rejects control characters", () => {
  assert.equal(validateOcrText("  readable text\n"), "readable text");
  assert.throws(() => validateOcrText("x".repeat(6001)));
  assert.throws(() => validateOcrText("text\u0000"));
});

test("validates exact one-for-one pronunciation results", () => {
  assert.deepEqual(
    validateModelPronunciations(["Msee", "form"], [
      { word: "msee", phonetic: "m-say", language: "sw" },
      { word: "form", phonetic: "form", language: "en" },
    ]),
    [
      { word: "Msee", phonetic: "m-say", language: "sw" },
      { word: "form", phonetic: "form", language: "en" },
    ],
  );
});

test("rejects hallucinated words and unsafe phonetic output", () => {
  assert.throws(() =>
    validateModelPronunciations(["msee"], [
      { word: "other", phonetic: "other", language: "en" },
    ]),
  );
  assert.throws(() =>
    validateModelPronunciations(["msee"], [
      { word: "msee", phonetic: "run arbitrary output", language: "en" },
    ]),
  );
});
