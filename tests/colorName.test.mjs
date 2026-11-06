import assert from 'node:assert/strict';
import test from 'node:test';
import { colorNames } from '../src/data/colorNames.ts';
import { closestColorName, hexToOklab } from '../src/utils/colorName.ts';

test('all curated colors match exactly, including lowercase input', () => {
  assert.equal(colorNames.length, 68);
  assert.equal(new Set(colorNames.map(entry => entry.hex)).size, colorNames.length);
  for (const entry of colorNames) {
    assert.deepEqual(closestColorName(entry.hex.toLowerCase()), { ...entry, exact: true });
  }
});

test('approximate names are deterministic and not marked exact', () => {
  for (const [hex, name] of [['#010101', 'Black'], ['#FEFEFE', 'White'], ['#818181', 'Gray'], ['#6B4D5B', 'Dusty Plum']]) {
    const result = closestColorName(hex);
    assert.equal(result.name, name);
    assert.equal(result.exact, false);
    for (let i = 0; i < 10; i++) assert.deepEqual(closestColorName(hex), result);
  }
});

test('black, white and neutral gray anchors match', () => {
  for (const [hex, name] of [['#000000', 'Black'], ['#FFFFFF', 'White'], ['#404040', 'Dark Gray'], ['#808080', 'Gray'], ['#C0C0C0', 'Silver']]) {
    assert.equal(closestColorName(hex).name, name);
    assert.equal(closestColorName(hex).exact, true);
  }
});

test('OKLab conversion matches reference primaries and neutral endpoints', () => {
  const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 0.000001);
  assert.deepEqual(hexToOklab('#000000'), { L: 0, a: 0, b: 0 });
  const white = hexToOklab('#FFFFFF');
  close(white.L, 1); close(white.a, 0); close(white.b, 0);
  const red = hexToOklab('#FF0000');
  close(red.L, 0.62795536); close(red.a, 0.22486306); close(red.b, 0.12584630);
});

test('invalid HEX input throws consistently', () => {
  for (const hex of ['', '#fff', 'red', '#GGGGGG', '#12345678', '#123456\n']) {
    assert.throws(() => closestColorName(hex), /Invalid sampled color/);
    assert.throws(() => hexToOklab(hex), /Invalid sampled color/);
  }
});
