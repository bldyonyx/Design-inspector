import assert from 'node:assert/strict';
import test from 'node:test';
import { createHistoryRepository, HISTORY_KEY, mergeHistory, parseHistory } from '../src/storage/colorHistory.ts';

function mockStorage(initial) {
  let value = initial;
  let readFails = false, writeFails = false, writes = 0;
  const storage = {
    async get(key) {
      assert.equal(key, HISTORY_KEY);
      if (readFails) throw new Error('Read failed');
      return { [key]: structuredClone(value) };
    },
    async set(items) {
      assert.deepEqual(Object.keys(items), [HISTORY_KEY]);
      writes++;
      if (writeFails) throw new Error('Write failed');
      value = structuredClone(items[HISTORY_KEY]);
    },
  };
  return { storage, get value() { return value; }, get writes() { return writes; },
    set readFails(v) { readFails = v; }, set writeFails(v) { writeFails = v; } };
}
const entry = (hex, capturedAt) => ({ hex, capturedAt });

test('normalizes and validates records while retaining valid neighbors', () => {
  const result = parseHistory([entry('#abcdef', 10), null, entry('#GGGGGG', 3), entry('#123456', NaN), entry('#000000', -1), entry('#FFFFFF', 2)]);
  assert.deepEqual(result, { entries: [entry('#ABCDEF', 10), entry('#FFFFFF', 2)], malformed: true });
  assert.deepEqual(parseHistory(undefined), { entries: [], malformed: false });
  for (const value of [null, {}, 'bad']) assert.throws(() => parseHistory(value));
});

test('deduplicates newest first, updates timestamp and caps at 100', () => {
  const result = mergeHistory([entry('#aaaaaa', 1), entry('#BBBBBB', 3), entry('#AAAAAA', 4)]);
  assert.deepEqual(result, [entry('#AAAAAA', 4), entry('#BBBBBB', 3)]);
  const entries = Array.from({ length: 110 }, (_, i) => entry(`#${i.toString(16).padStart(6, '0')}`, i));
  assert.equal(mergeHistory(entries).length, 100);
  assert.equal(mergeHistory(entries)[99].capturedAt, 10);
});

test('serialized captures merge with loaded history and survive repository recreation', async () => {
  const mock = mockStorage([entry('#123456', 1)]);
  const repo = createHistoryRepository(() => mock.storage);
  await Promise.all([repo.load(), repo.capture(entry('#abcdef', 2)), repo.capture(entry('#000000', 3)), repo.capture(entry('#ABCDEF', 4))]);
  assert.deepEqual(mock.value, [entry('#ABCDEF', 4), entry('#000000', 3), entry('#123456', 1)]);
  const reopened = createHistoryRepository(() => mock.storage);
  assert.deepEqual((await reopened.load()).entries, mock.value);
});

test('failed reads never write; later capture retries and preserves unread history', async () => {
  const original = [entry('#123456', 1)];
  const mock = mockStorage(original);
  const repo = createHistoryRepository(() => mock.storage);
  mock.readFails = true;
  await assert.rejects(repo.load());
  await assert.rejects(repo.capture(entry('#FFFFFF', 2)));
  assert.equal(mock.writes, 0);
  assert.deepEqual(mock.value, original);
  mock.readFails = false;
  await repo.capture(entry('#000000', 3));
  assert.deepEqual(mock.value, [entry('#000000', 3), entry('#FFFFFF', 2), entry('#123456', 1)]);
});

test('failed writes retain pending captures for retry without erasing stored entries', async () => {
  const mock = mockStorage([entry('#123456', 1)]);
  const repo = createHistoryRepository(() => mock.storage);
  mock.writeFails = true;
  await assert.rejects(repo.capture(entry('#FFFFFF', 2)));
  assert.deepEqual(mock.value, [entry('#123456', 1)]);
  mock.writeFails = false;
  await repo.capture(entry('#000000', 3));
  assert.equal(mock.value.length, 3);
});

test('corrupt containers are never overwritten; corrupt entries preserve valid neighbors', async () => {
  const mock = mockStorage({ unexpected: true });
  const repo = createHistoryRepository(() => mock.storage);
  await assert.rejects(repo.capture(entry('#FFFFFF', 2)));
  assert.equal(mock.writes, 0);
  const partial = mockStorage([entry('#123456', 1), { broken: true }]);
  const result = await createHistoryRepository(() => partial.storage).capture(entry('#FFFFFF', 2));
  assert.equal(result.malformed, true);
  assert.deepEqual(partial.value, [entry('#FFFFFF', 2), entry('#123456', 1)]);
});

test('unavailable storage and invalid captures fail without writes', async () => {
  const repo = createHistoryRepository(() => { throw new Error('Unavailable'); });
  await assert.rejects(repo.load(), /Unavailable/);
  const mock = mockStorage([]);
  await assert.rejects(createHistoryRepository(() => mock.storage).capture(entry('invalid', 1)));
  assert.equal(mock.writes, 0);
});

test('individual deletion changes only the specified HEX and persists on reload', async () => {
  const mock = mockStorage([entry('#FFFFFF', 3), entry('#ABCDEF', 2), entry('#000000', 1)]);
  const repo = createHistoryRepository(() => mock.storage);
  const result = await repo.remove('#abcdef');
  assert.deepEqual(result.removed, entry('#ABCDEF', 2));
  assert.deepEqual(mock.value, [entry('#FFFFFF', 3), entry('#000000', 1)]);
  assert.deepEqual((await createHistoryRepository(() => mock.storage).load()).entries, mock.value);
  await repo.remove('#123456');
  assert.equal(mock.value.length, 2);
});

test('clear writes only the versioned history key; undo restores original timestamp', async () => {
  const mock = mockStorage([entry('#FFFFFF', 3), entry('#000000', 1)]);
  const repo = createHistoryRepository(() => mock.storage);
  const deleted = await repo.remove('#FFFFFF');
  await repo.restore(deleted.removed);
  assert.deepEqual(mock.value, [entry('#FFFFFF', 3), entry('#000000', 1)]);
  await repo.clear();
  assert.deepEqual(mock.value, []);
  assert.deepEqual((await repo.load()).entries, []);
});

test('add, delete, clear, and restore serialize without stale snapshot resurrection', async () => {
  const mock = mockStorage([entry('#FFFFFF', 1)]);
  const repo = createHistoryRepository(() => mock.storage);
  await Promise.all([
    repo.capture(entry('#ABCDEF', 2)), repo.remove('#FFFFFF'),
    repo.clear(), repo.capture(entry('#123456', 3)), repo.restore(entry('#000000', 1)),
  ]);
  assert.deepEqual(mock.value, [entry('#123456', 3), entry('#000000', 1)]);
  await repo.capture(entry('#000000', 4));
  await repo.restore(entry('#000000', 1));
  assert.equal(mock.value[0].capturedAt, 4);
});

test('failed delete, clear, and undo preserve stored history and queue stays usable', async () => {
  const original = [entry('#FFFFFF', 1)];
  const mock = mockStorage(original);
  const repo = createHistoryRepository(() => mock.storage);
  mock.readFails = true;
  await assert.rejects(repo.remove('#FFFFFF'));
  await assert.rejects(repo.clear());
  assert.equal(mock.writes, 0);
  mock.readFails = false;
  mock.writeFails = true;
  await assert.rejects(repo.remove('#FFFFFF'));
  await assert.rejects(repo.clear());
  await assert.rejects(repo.restore(entry('#000000', 2)));
  assert.deepEqual(mock.value, original);
  mock.writeFails = false;
  await repo.remove('#FFFFFF');
  assert.deepEqual(mock.value, []);
});

test('deleting or clearing failed optimistic captures cannot resurrect them later', async () => {
  const mock = mockStorage([entry('#FFFFFF', 1)]);
  const repo = createHistoryRepository(() => mock.storage);
  mock.writeFails = true;
  await assert.rejects(repo.capture(entry('#000000', 2)));
  mock.writeFails = false;
  await repo.remove('#000000');
  await repo.capture(entry('#ABCDEF', 3));
  assert.deepEqual(mock.value, [entry('#ABCDEF', 3), entry('#FFFFFF', 1)]);
  mock.writeFails = true;
  await assert.rejects(repo.capture(entry('#000000', 4)));
  mock.writeFails = false;
  await repo.clear();
  await repo.capture(entry('#123456', 5));
  assert.deepEqual(mock.value, [entry('#123456', 5)]);
});
