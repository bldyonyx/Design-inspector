import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { colorNames } from '../src/data/colorNames.ts';
import { closestColorName, createColorNameLookup, hexToOklab } from '../src/utils/colorName.ts';

test('all curated colors match exactly, including lowercase input', () => {
  assert.equal(colorNames.length, 849);
  assert.equal(new Set(colorNames.map(entry => entry.name.toLowerCase())).size, colorNames.length);
  for (const entry of colorNames) {
    assert.match(entry.hex, /^#[0-9A-F]{6}$/);
    assert.equal(entry.name.trim(), entry.name);
    assert.ok(entry.name.length > 0);
    assert.doesNotMatch(entry.name.toLowerCase(), /\b(shit|poop|poo|puke|vomit|piss|barf|diarrhea|booger|snot|bile|ugly|nasty|gross|icky)\b/);
  }
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


test('required representative inputs remain in reviewed descriptive families', () => {
  const cases = [
    ['#B9C89B', /olive|sage|green/i], ['#A4B494', /^Sage$/], ['#808000', /^Olive$/],
    ['#D4BE98', /sand|beige/i], ['#E8D8CB', /linen|beige/i],
    ['#6A4D5B', /plum|purple/i], ['#624955', /plum|purple/i],
    ['#808080', /gray/i], ['#818181', /gray/i], ['#4682B4', /^Steel Blue$/],
    ['#64748B', /slate|gray.*blue/i], ['#008080', /^Teal$/], ['#C4B5E8', /^Lavender$/],
    ['#000000', /^Black$/], ['#FFFFFF', /^White$/],
  ];
  for (const [hex, family] of cases) assert.match(closestColorName(hex).name, family, hex);
  assert.notEqual(closestColorName('#B9C89B').name, 'Sand');
});

test('nearby sage/olive, plum and neutral samples do not jump to unrelated families', () => {
  for (const [samples, family] of [
    [['#B9C89B', '#B8C79A', '#BAC99C'], /olive|sage|green/i],
    [['#624955', '#634A56', '#614854'], /plum|purple/i],
    [['#7F7F7F', '#808080', '#818181'], /gray/i],
  ]) for (const hex of samples) assert.match(closestColorName(hex).name, family);
});

test('equal-distance candidates resolve in stable catalog order', () => {
  const entries = [{ name: 'First', hex: '#000000' }, { name: 'Second', hex: '#000000' }];
  const lookup = createColorNameLookup(entries);
  for (let i = 0; i < 20; i++) assert.equal(lookup('#010101').name, 'First');
  assert.equal(createColorNameLookup([...entries].reverse())('#010101').name, 'Second');
  assert.throws(() => createColorNameLookup([]));
});


test('catalog matches its pinned source hash and documented curation decisions', () => {
  const raw = fs.readFileSync(new URL('../data/color-names/xkcd-rgb.txt', import.meta.url));
  const manifest = JSON.parse(fs.readFileSync(new URL('../data/color-names/curation.json', import.meta.url)));
  const anchors = JSON.parse(fs.readFileSync(new URL('../data/color-names/project-anchors.json', import.meta.url)));
  assert.equal(createHash('sha256').update(raw).digest('hex'), manifest.sha256);
  assert.ok(raw.toString().startsWith('# License: https://creativecommons.org/publicdomain/zero/1.0/'));
  assert.equal(manifest.version, 2);
  const imported = manifest.decisions.filter(row => row.action === 'include').map(({ name, hex }) => ({ name, hex }));
  assert.deepEqual(colorNames, [...anchors, ...imported]);
  assert.equal(manifest.decisions.length, 949);
  assert.equal(manifest.project, 68); assert.equal(manifest.xkcd, 781);
});
