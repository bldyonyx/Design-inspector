import test from 'node:test';
import assert from 'node:assert/strict';
import { filterPalettes, recentPalettes } from '../src/utils/paletteSearch.ts';

test('case-insensitive trimmed search, empty query and no results', () => {
  const palettes = [{ name: 'Morning Sky' }, { name: 'Evening sky' }, { name: 'Forest' }];
  assert.deepEqual(filterPalettes(palettes, '  SKY  '), palettes.slice(0, 2));
  assert.deepEqual(filterPalettes(palettes, ''), palettes);
  assert.deepEqual(filterPalettes(palettes, 'none'), []);
});
test('large collections remain searchable and preview is limited to three most recently updated', () => {
  const palettes = Array.from({ length: 500 }, (_, i) => ({ name: `Palette ${i}`, updatedAt: i }));
  assert.equal(filterPalettes(palettes, 'Palette 499').length, 1);
  assert.deepEqual(recentPalettes(palettes).map(p => p.updatedAt), [499, 498, 497]);
  assert.equal(palettes[0].updatedAt, 0);
});
