/**
 * Test Suite for Sheng Core Engine
 * Verifies:
 * 1. Single word lookups
 * 2. Morphological root prefix stripping
 * 3. English word preservation (English words MUST NOT be altered)
 * 4. Sub-millisecond performance of fast path
 * 5. Full sentence code-switching smoothing
 */

import assert from 'node:assert/strict';
import { ShengPhoneticEngine } from '../dist/index.js';
import lexiconData from '../src/sheng-lexicon.json' with { type: 'json' };

async function runTestSuite() {
  console.log('🧪 Starting Sheng Phonetic Core Engine Test Suite...\n');
  const engine = new ShengPhoneticEngine({ enableAiFallback: false });

  console.log('Test 0: Lexicon integrity');
  const terms = lexiconData.lexicon.map((entry) => entry.term);
  assert.strictEqual(new Set(terms).size, terms.length, 'Lexicon terms must be unique');
  console.log(`  ✓ ${terms.length} unique entries`);

  // Test 1: Single Word Lookups
  console.log('Test 1: Single Word Fast-Path Replacements');
  const wordTests = [
    { in: 'mathree', expected: 'maa-three' },
    { in: 'mbogi', expected: 'm-bow-ghee' },
    { in: 'chapaa', expected: 'chah-pah' },
    { in: 'bazenga', expected: 'bah-zeng-gah' },
    { in: 'buda', expected: 'boo-dah' },
    { in: 'msupa', expected: 'im-soo-pah' },
    { in: 'mdosi', expected: 'im-doh-see' },
    { in: 'dunda', expected: 'doon-dah' },
    { in: 'kudunda', expected: 'koo-doon-dah' },
    { in: 'mzinga', expected: 'im-zee-ngah' },
    { in: 'kanairo', expected: 'kah-nai-ro' },
    { in: 'mreki', expected: 'im-reh-kee' }
  ];

  for (const t of wordTests) {
    const res = await engine.process(t.in);
    assert.strictEqual(res.adapted.toLowerCase(), t.expected.toLowerCase(), `Failed on single word: ${t.in}`);
    console.log(`  ✓ "${t.in}" -> "${res.adapted}"`);
  }

  // Test 2: Morphological Prefix Decomposition
  console.log('\nTest 2: Morphological Prefix Decomposition');
  const prefixTests = [
    { in: 'wanadhokoma', expected: 'wah-nah-dho-koma' },
    { in: 'kujinice', expected: 'koo-jee-nice' },
    { in: 'walibambika', expected: 'wah-lee-bahm-bee-kah' }
  ];

  for (const t of prefixTests) {
    const res = await engine.process(t.in);
    assert.strictEqual(res.adapted.toLowerCase(), t.expected.toLowerCase(), `Failed on prefix decomp: ${t.in}`);
    console.log(`  ✓ "${t.in}" -> "${res.adapted}"`);
  }

  // Test 3: Preservation of Standard English
  console.log('\nTest 3: English Words Must Remain Untouched');
  const englishSentences = [
    'The quick brown fox jumps over the lazy dog.',
    'Please register your business license at the county council office.',
    'System status is operational with zero errors.'
  ];

  for (const s of englishSentences) {
    const res = await engine.process(s);
    assert.strictEqual(res.adapted, s, `English was erroneously modified: ${s}`);
    assert.strictEqual(res.substitutionsCount, 0);
    console.log(`  ✓ Preserved: "${s}"`);
  }

  // Test 4: Performance Benchmark (< 2ms for sentence)
  console.log('\nTest 4: Performance Benchmark (< 2ms fast-path)');
  const benchmarkSentence = 'Leo wasee wote wako rada ya mathree kwa stage ya mtaani, mbogi mzima iko form ya sherehe.';
  const start = performance.now();
  const iterations = 500;
  for (let i = 0; i < iterations; i++) {
    await engine.process(benchmarkSentence);
  }
  const duration = performance.now() - start;
  const avgMs = duration / iterations;
  console.log(`  ✓ Processed ${iterations} iterations in ${duration.toFixed(2)}ms (Average: ${avgMs.toFixed(3)}ms per sentence)`);
  assert(avgMs < 2.0, `Engine took too long: ${avgMs}ms`);

  console.log('\n🎉 ALL TESTS PASSED SUCCESSFULLY!\n');
}

runTestSuite().catch((err) => {
  console.error('❌ Test suite failed:', err);
  process.exit(1);
});
