import assert from 'node:assert/strict';
import test from 'node:test';
import { copyText, normalizeHex, hexToRgb, rgbToHsl, formatRgb, formatHsl } from '../src/utils/color.ts';

test('normalizes six-digit sampled HEX and rejects malformed values', () => {
  assert.equal(normalizeHex('#aBc123'), '#ABC123');
  assert.equal(normalizeHex('#ffffff'), '#FFFFFF');
  for (const value of ['#fff', 'red', '#12345678', '#gggggg', '#123456\n']) {
    assert.throws(() => normalizeHex(value));
  }
});

test('clipboard writes the exact value and propagates failure or absence', async () => {
  let copied;
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: {
    writeText: async value => { copied = value; },
  } });
  await copyText('#ABC123');
  assert.equal(copied, '#ABC123');
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: {
    writeText: async () => { throw new Error('Denied'); },
  } });
  await assert.rejects(copyText('#ABC123'), /Denied/);
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: undefined });
  await assert.rejects(copyText('#ABC123'), /unavailable/);
  delete navigator.clipboard;
});


test('converts reference colors to CSS RGB and HSL', () => {
  const cases = [
    ['#000000', [0, 0, 0], [0, 0, 0]],
    ['#FFFFFF', [255, 255, 255], [0, 0, 100]],
    ['#FF0000', [255, 0, 0], [0, 100, 50]],
    ['#00FF00', [0, 255, 0], [120, 100, 50]],
    ['#0000FF', [0, 0, 255], [240, 100, 50]],
    ['#808080', [128, 128, 128], [0, 0, 50]],
    ['#c2e798', [194, 231, 152], [88, 62, 75]],
  ];
  for (const [hex, [r, g, b], [h, s, l]] of cases) {
    const rgb = hexToRgb(hex);
    assert.deepEqual(rgb, { r, g, b });
    assert.deepEqual(rgbToHsl(rgb), { h, s, l });
    assert.equal(formatRgb(rgb), `rgb(${r}, ${g}, ${b})`);
    assert.equal(formatHsl(rgbToHsl(rgb)), `hsl(${h}, ${s}%, ${l}%)`);
  }
});

test('rejects invalid conversions and normalizes rounded hue edges', () => {
  assert.throws(() => hexToRgb('#fff'));
  for (const r of [-1, 256, NaN, Infinity, 0.5]) {
    assert.throws(() => rgbToHsl({ r, g: 0, b: 0 }), RangeError);
    assert.throws(() => formatRgb({ r, g: 0, b: 0 }), RangeError);
  }
  assert.deepEqual(rgbToHsl({ r: 255, g: 0, b: 1 }), { h: 0, s: 100, l: 50 });
  assert.deepEqual(rgbToHsl({ r: 255, g: 0, b: 4 }), { h: 359, s: 100, l: 50 });
  assert.equal(formatHsl({ h: 359.6, s: 62.4, l: 74.5 }), 'hsl(0, 62%, 75%)');
  assert.equal(formatHsl({ h: -1, s: 0, l: 0 }), 'hsl(359, 0%, 0%)');
  assert.throws(() => formatHsl({ h: NaN, s: 0, l: 0 }), RangeError);
  assert.throws(() => formatHsl({ h: 0, s: 101, l: 0 }), RangeError);
});
