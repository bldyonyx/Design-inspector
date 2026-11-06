import assert from 'node:assert/strict';
import test from 'node:test';
import { copyHex, normalizeHex } from '../src/utils/color.ts';

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
  await copyHex('#ABC123');
  assert.equal(copied, '#ABC123');
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: {
    writeText: async () => { throw new Error('Denied'); },
  } });
  await assert.rejects(copyHex('#ABC123'), /Denied/);
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: undefined });
  await assert.rejects(copyHex('#ABC123'), /unavailable/);
  delete navigator.clipboard;
});
