import assert from 'node:assert/strict';
import test from 'node:test';
import { createPalettesRepository, PALETTES_KEY, paletteName, parsePalettes } from '../src/storage/savedPalettes.ts';
import { createHistoryRepository, HISTORY_KEY } from '../src/storage/colorHistory.ts';

function mock(initial = {}) {
  const data = structuredClone(initial);
  const flags = { readFail: false, writeFail: false, writes: 0 };
  const api = {
    async get(key) { if (flags.readFail) throw Error('Read failed'); return { [key]: structuredClone(data[key]) }; },
    async set(items) { flags.writes++; if (flags.writeFail) throw Error('Write failed'); Object.assign(data, structuredClone(items)); },
  };
  return { data, flags, api, repo: createPalettesRepository(() => api) };
}

test('creates empty palettes with trimmed names and stable distinct IDs', async () => {
  const m = mock();
  const first = (await m.repo.create('  Studio  ')).palette;
  const second = (await m.repo.create('Studio')).palette;
  assert.equal(first.name, 'Studio'); assert.deepEqual(first.colors, []);
  assert.notEqual(first.id, second.id);
  assert.ok(Number.isSafeInteger(first.createdAt)); assert.equal(first.createdAt, first.updatedAt);
  assert.deepEqual((await createPalettesRepository(() => m.api).load()).palettes, m.data[PALETTES_KEY]);
});

test('creates with selected color and appends normalized colors without duplicates', async () => {
  const m = mock();
  const { palette } = await m.repo.create('Test', '#abcdef');
  await m.repo.addColor(palette.id, '#123456');
  const before = structuredClone(m.data[PALETTES_KEY]);
  const writes = m.flags.writes;
  const result = await m.repo.addColor(palette.id, '#ABCDEF');
  assert.equal(result.alreadySaved, true);
  assert.deepEqual(result.palette.colors, ['#ABCDEF', '#123456']);
  assert.deepEqual(m.data[PALETTES_KEY], before); assert.equal(m.flags.writes, writes);
});

test('same color can belong to different palettes', async () => {
  const m = mock();
  await m.repo.create('One', '#FFFFFF'); await m.repo.create('Two', '#FFFFFF');
  assert.equal(m.data[PALETTES_KEY].length, 2);
  assert.ok(m.data[PALETTES_KEY].every(p => p.colors[0] === '#FFFFFF'));
});

test('validates names and HEX before writing', async () => {
  const m = mock();
  for (const name of ['', '  ', 'x'.repeat(51)]) {
    assert.throws(() => paletteName(name)); await assert.rejects(m.repo.create(name));
  }
  assert.equal(paletteName('x'.repeat(50)).length, 50);
  await assert.rejects(m.repo.create('Valid', '#xyzxyz'));
  await assert.rejects(m.repo.addColor('missing', '#FFFFFF'));
  assert.equal(m.flags.writes, 0);
});

test('recovers valid palettes and valid neighboring colors from malformed records', () => {
  const good = { id: 'one', name: ' One ', colors: ['#abcdef', '#ABCDEF', 'bad', '#000000'], createdAt: 1, updatedAt: 2 };
  const result = parsePalettes([null, good, { ...good, name: '' }, { ...good, id: 'two', updatedAt: -1 }, good]);
  assert.equal(result.malformed, true);
  assert.deepEqual(result.palettes, [{ ...good, name: 'One', colors: ['#ABCDEF', '#000000'] }]);
  assert.deepEqual(parsePalettes(undefined), { palettes: [], malformed: false });
  for (const value of [null, {}, 'bad']) assert.throws(() => parsePalettes(value));
});

test('failed loads and malformed containers never overwrite stored palettes', async () => {
  const m = mock({ [PALETTES_KEY]: { corrupt: true } });
  await assert.rejects(m.repo.create('New'));
  assert.equal(m.flags.writes, 0);
  m.flags.readFail = true;
  await assert.rejects(m.repo.load()); await assert.rejects(m.repo.create('New'));
  assert.equal(m.flags.writes, 0);
  assert.deepEqual(m.data[PALETTES_KEY], { corrupt: true });
});

test('failed writes preserve existing records and allow retry', async () => {
  const m = mock(); const { palette } = await m.repo.create('Existing');
  m.flags.writeFail = true;
  await assert.rejects(m.repo.addColor(palette.id, '#FFFFFF'));
  await assert.rejects(m.repo.create('Failed'));
  assert.equal(m.data[PALETTES_KEY].length, 1); assert.deepEqual(m.data[PALETTES_KEY][0].colors, []);
  m.flags.writeFail = false;
  await m.repo.addColor(palette.id, '#FFFFFF');
  assert.deepEqual(m.data[PALETTES_KEY][0].colors, ['#FFFFFF']);
});

test('serializes concurrent creations and additions without lost updates', async () => {
  const m = mock(); const { palette } = await m.repo.create('Base');
  await Promise.all([m.repo.addColor(palette.id, '#FFFFFF'), m.repo.create('Other'), m.repo.addColor(palette.id, '#000000'), m.repo.addColor(palette.id, '#ffffff')]);
  assert.equal(m.data[PALETTES_KEY].length, 2);
  assert.deepEqual(m.data[PALETTES_KEY].find(p => p.id === palette.id).colors, ['#FFFFFF', '#000000']);
});

test('palette writes and history deletion/clear leave one another untouched', async () => {
  const m = mock({ [HISTORY_KEY]: [{ hex: '#FFFFFF', capturedAt: 1 }] });
  const before = structuredClone(m.data[HISTORY_KEY]);
  await m.repo.create('Independent', '#FFFFFF');
  assert.deepEqual(m.data[HISTORY_KEY], before);
  const saved = structuredClone(m.data[PALETTES_KEY]);
  const history = createHistoryRepository(() => m.api);
  await history.remove('#FFFFFF'); await history.capture({ hex: '#000000', capturedAt: 2 }); await history.clear();
  assert.deepEqual(m.data[PALETTES_KEY], saved);
});

test('unavailable storage fails safely', async () => {
  const repo = createPalettesRepository(() => { throw Error('Unavailable'); });
  await assert.rejects(repo.load()); await assert.rejects(repo.create('New'));
});

test('renaming preserves identity and colors, validates names, and changes time only on commit', async () => {
  const m = mock(); const { palette } = await m.repo.create('Original', '#ABCDEF');
  await assert.rejects(m.repo.rename(palette.id, '  '));
  const renamed = (await m.repo.rename(palette.id, '  Updated  ')).palette;
  assert.equal(renamed.name, 'Updated'); assert.equal(renamed.id, palette.id);
  assert.deepEqual(renamed.colors, palette.colors); assert.equal(renamed.createdAt, palette.createdAt);
  assert.ok(renamed.updatedAt > palette.updatedAt);
  const writes = m.flags.writes;
  await m.repo.rename(palette.id, 'Updated'); assert.equal(m.flags.writes, writes);
  m.flags.writeFail = true; await assert.rejects(m.repo.rename(palette.id, 'Failed'));
  assert.equal(m.data[PALETTES_KEY][0].name, 'Updated');
});

test('removal and Undo preserve other palettes, color order, and history', async () => {
  const history = [{ hex: '#ABCDEF', capturedAt: 1 }];
  const m = mock({ [HISTORY_KEY]: history });
  const a = (await m.repo.create('One', '#ABCDEF')).palette;
  await m.repo.addColor(a.id, '#123456');
  const b = (await m.repo.create('Two', '#ABCDEF')).palette;
  await m.repo.removeColor(a.id, '#abcdef');
  assert.deepEqual(m.data[PALETTES_KEY].find(p => p.id === a.id).colors, ['#123456']);
  assert.deepEqual(m.data[PALETTES_KEY].find(p => p.id === b.id).colors, ['#ABCDEF']);
  await m.repo.restoreColor(a.id, '#abcdef', 0);
  assert.deepEqual(m.data[PALETTES_KEY].find(p => p.id === a.id).colors, ['#ABCDEF', '#123456']);
  await m.repo.removeColor(a.id, '#ABCDEF'); await m.repo.removeColor(a.id, '#123456');
  assert.deepEqual(m.data[PALETTES_KEY].find(p => p.id === a.id).colors, []);
  assert.deepEqual(m.data[HISTORY_KEY], history);
});

test('deletion persists without affecting neighbors and cannot be undone by a stale color restore', async () => {
  const m = mock(); const a = (await m.repo.create('One', '#ABCDEF')).palette;
  const b = (await m.repo.create('Two')).palette;
  await m.repo.delete(a.id);
  await assert.rejects(m.repo.restoreColor(a.id, '#ABCDEF', 0));
  assert.deepEqual((await createPalettesRepository(() => m.api).load()).palettes.map(p => p.id), [b.id]);
});

test('failed management reads/writes preserve all data and allow retries', async () => {
  const m = mock(); const a = (await m.repo.create('One', '#ABCDEF')).palette;
  const before = structuredClone(m.data);
  for (const flag of ['readFail', 'writeFail']) {
    m.flags[flag] = true;
    await assert.rejects(m.repo.rename(a.id, 'Changed'));
    await assert.rejects(m.repo.removeColor(a.id, '#ABCDEF'));
    await assert.rejects(m.repo.delete(a.id));
    assert.deepEqual(m.data, before); m.flags[flag] = false;
  }
  await m.repo.delete(a.id); assert.deepEqual(m.data[PALETTES_KEY], []);
});

test('mixed concurrent palette operations use fresh data and preserve history', async () => {
  const m = mock({ [HISTORY_KEY]: [{ hex: '#FFFFFF', capturedAt: 1 }] });
  const a = (await m.repo.create('One', '#ABCDEF')).palette;
  const b = (await m.repo.create('Two')).palette;
  await Promise.all([m.repo.addColor(a.id, '#FFFFFF'), m.repo.rename(a.id, 'Renamed'), m.repo.removeColor(a.id, '#ABCDEF'), m.repo.delete(b.id), m.repo.restoreColor(a.id, '#ABCDEF', 0)]);
  assert.equal(m.data[PALETTES_KEY].length, 1);
  assert.equal(m.data[PALETTES_KEY][0].name, 'Renamed');
  assert.deepEqual(m.data[PALETTES_KEY][0].colors, ['#ABCDEF', '#FFFFFF']);
  assert.deepEqual(m.data[HISTORY_KEY], [{ hex: '#FFFFFF', capturedAt: 1 }]);
});
