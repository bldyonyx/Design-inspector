import fs from 'node:fs';
import { performance } from 'node:perf_hooks';
import { colorNames } from '../src/data/colorNames.ts';
import { createColorNameLookup } from '../src/utils/colorName.ts';
const original = JSON.parse(fs.readFileSync(new URL('../data/color-names/project-anchors.json', import.meta.url)));
let seed = 123456789;
const samples = Array.from({ length: 4096 }, () => {
  seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
  return `#${(seed & 0xffffff).toString(16).padStart(6, '0')}`;
});
for (const [label, entries] of [['original', original], ['catalog v2', colorNames]]) {
  const start = performance.now(); const lookup = createColorNameLookup(entries); const initializationMs = performance.now() - start;
  for (let i = 0; i < 5000; i++) lookup(samples[i % samples.length]);
  const rounds = [];
  for (let round = 0; round < 5; round++) {
    const begin = performance.now();
    for (let i = 0; i < 20000; i++) lookup(samples[i % samples.length]);
    rounds.push((performance.now() - begin) / 20000);
  }
  const medianMs = rounds.sort((a, b) => a - b)[2];
  console.log(JSON.stringify({ label, count: entries.length, serializedBytes: Buffer.byteLength(JSON.stringify(entries)), initializationMs, medianLookupMicroseconds: medianMs * 1000 }));
}
