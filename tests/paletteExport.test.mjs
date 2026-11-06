import assert from 'node:assert/strict';
import test from 'node:test';
import { palettePrefix, colorVariableNames, paletteToCss, paletteToJson, paletteExportFilename, createPaletteExport, downloadPalette } from '../src/utils/paletteExport.ts';
import { copyText } from '../src/utils/color.ts';
const palette = { id: 'internal', name: 'Autumn mood', colors: ['#6a4d5b', '#E8D8CB', '#b9c89b'], createdAt: 1, updatedAt: 2 };

test('CSS preserves order, normalizes colors, and does not mutate data', () => {
  const before = structuredClone(palette);
  assert.equal(paletteToCss({ ...palette, colors: ['#6a4d5b', '#ffffff', '#000000'] }), ':root {\n  --dusty-plum: #6A4D5B;\n  --white: #FFFFFF;\n  --black: #000000;\n}\n');
  assert.deepEqual(palette, before);
});

test('JSON uses two-space indentation, actual name and colors, without metadata', () => {
  const text = paletteToJson(palette);
  assert.deepEqual(JSON.parse(text), { name: palette.name, colors: ['#6A4D5B', '#E8D8CB', '#B9C89B'] });
  assert.ok(text.startsWith('{\n  "name":'));
  assert.equal(text, JSON.stringify(JSON.parse(text), null, 2) + '\n');
});

test('empty palettes produce valid empty formats; malformed HEX throws', () => {
  assert.equal(paletteToCss({ name: 'Empty', colors: [] }), ':root {\n}\n');
  assert.deepEqual(JSON.parse(paletteToJson({ name: 'Empty', colors: [] })), { name: 'Empty', colors: [] });
  assert.throws(() => paletteToCss({ name: 'Unsafe', colors: ['red; } body {}'] }));
  assert.throws(() => paletteToJson({ name: 'Unsafe', colors: ['#fff'] }));
});

test('prefixes handle accents, punctuation, emojis, non-Latin text, digits, and injection safely', () => {
  for (const [name, expected] of [[' Crème Brûlée ', 'creme-brulee'], ['A/B: C!?', 'a-b-c'], ['🎨✨', 'palette'], ['東京', 'palette'], ['   ', 'palette'], ['123!', 'palette-123'], ['}; body { color: red; } /*', 'body-color-red']]) {
    const prefix = palettePrefix(name);
    assert.equal(prefix, expected); assert.match(prefix, /^[a-z][a-z0-9-]*$/);
    assert.equal(palettePrefix(name), prefix);
    assert.match(paletteToCss({ name, colors: ['#FFFFFF'] }), /--white: #FFFFFF;/);
  }
  assert.ok(palettePrefix('a'.repeat(200)).length <= 64);
});

test('safe filenames handle reserved devices and punctuation, with correct MIME types', () => {
  assert.equal(paletteExportFilename('CON', 'css'), 'palette-con.css');
  assert.equal(paletteExportFilename('.. / 🎨 \\ : * ? " < > |', 'json'), 'palette.json');
  assert.equal(paletteExportFilename('Été', 'css'), 'ete.css');
  assert.equal(createPaletteExport(palette, 'css').mimeType, 'text/css;charset=utf-8');
  assert.equal(createPaletteExport(palette, 'json').mimeType, 'application/json;charset=utf-8');
});

test('clipboard writes generated CSS exactly and rejects failure', async t => {
  const original = Object.getOwnPropertyDescriptor(navigator, 'clipboard');
  t.after(() => { if (original) Object.defineProperty(navigator, 'clipboard', original); else delete navigator.clipboard; });
  let captured;
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async value => { captured = value; } } });
  await copyText(paletteToCss(palette)); assert.equal(captured, paletteToCss(palette));
  navigator.clipboard.writeText = async () => { throw Error('Denied'); };
  await assert.rejects(copyText(paletteToCss(palette)), /Denied/);
});

test('downloads build correct Blobs/files, clean anchors, defer URL revocation, and propagate errors', async t => {
  let blob, scheduled, delay, failClick = false, removed = 0;
  const revoked = [];
  const anchor = { click() { if (failClick) throw Error('Blocked'); }, remove() { removed++; } };
  const original = Object.getOwnPropertyDescriptor(globalThis, 'document');
  Object.defineProperty(globalThis, 'document', { configurable: true, value: {
    createElement: name => { assert.equal(name, 'a'); return anchor; },
    body: { append: value => assert.equal(value, anchor) },
  } });
  t.after(() => { if (original) Object.defineProperty(globalThis, 'document', original); else delete globalThis.document; });
  t.mock.method(URL, 'createObjectURL', value => { blob = value; return 'blob:test'; });
  t.mock.method(URL, 'revokeObjectURL', value => revoked.push(value));
  t.mock.method(globalThis, 'setTimeout', (callback, ms) => { scheduled = callback; delay = ms; });
  downloadPalette(palette, 'css');
  assert.equal(await blob.text(), paletteToCss(palette));
  assert.equal(anchor.download, 'autumn-mood.css'); assert.equal(anchor.href, 'blob:test'); assert.equal(anchor.hidden, true);
  assert.equal(removed, 1); assert.deepEqual(revoked, []); assert.equal(delay, 60_000);
  scheduled(); assert.deepEqual(revoked, ['blob:test']);
  downloadPalette(palette, 'json'); assert.equal(await blob.text(), paletteToJson(palette));
  assert.equal(anchor.download, 'autumn-mood.json'); scheduled();
  failClick = true; assert.throws(() => downloadPalette(palette, 'css'), /Blocked/);
  assert.equal(removed, 3); assert.equal(revoked.length, 3);
  t.mock.method(URL, 'createObjectURL', () => { throw Error('Unavailable'); });
  assert.throws(() => downloadPalette(palette, 'css'), /Unavailable/);
});


test('semantic names suffix every duplicate and preserve original color order', () => {
  const input = { name: 'Ignored for CSS names', colors: ['#6A4D5B', '#FFFFFF', '#6B4D5B'] };
  assert.equal(paletteToCss(input), ':root {\n  --dusty-plum-1: #6A4D5B;\n  --white: #FFFFFF;\n  --dusty-plum-2: #6B4D5B;\n}\n');
  assert.equal(paletteToCss(input), createPaletteExport(input, 'css').content);
  assert.equal(paletteToCss(input), paletteToCss(input));
});

test('slug collisions, suffix collisions, accents and unusual names stay unique and valid', () => {
  const names = ['Rosé', 'Rose', 'Rose 1', 'Rose 2', '🎨', '東京', 'COLOR 1', '123', 'A/B', 'A B'];
  const result = colorVariableNames(names);
  assert.deepEqual(result, ['rose-3', 'rose-4', 'rose-1', 'rose-2', 'color-2', 'color-3', 'color-1', 'color-123', 'a-b-1', 'a-b-2']);
  assert.equal(new Set(result).size, names.length);
  for (const name of result) assert.match(name, /^[a-z][a-z0-9-]*$/);
  assert.deepEqual(colorVariableNames(names), result);
  assert.deepEqual(colorVariableNames(['Crème Brûlée', '---', '⚡']), ['creme-brulee', 'color-1', 'color-2']);
});
