import { normalizeHex } from '../utils/color.ts';

export const HISTORY_KEY = 'designInspector.colorHistory.v1';
export interface HistoryEntry { hex: string; capturedAt: number }
export interface HistoryStorage {
  get(key: string): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
}

export function parseHistory(value: unknown): { entries: HistoryEntry[]; malformed: boolean } {
  if (value === undefined) return { entries: [], malformed: false };
  if (!Array.isArray(value)) throw new Error('Invalid color history');
  const entries: HistoryEntry[] = [];
  let malformed = false;
  for (const item of value) {
    try {
      if (typeof item !== 'object' || item === null || typeof item.hex !== 'string'
        || !Number.isSafeInteger(item.capturedAt) || item.capturedAt < 0) throw new Error('Invalid entry');
      entries.push({ hex: normalizeHex(item.hex), capturedAt: item.capturedAt });
    } catch { malformed = true; }
  }
  return { entries: mergeHistory(entries), malformed };
}

export function mergeHistory(...lists: readonly HistoryEntry[][]): HistoryEntry[] {
  const unique = new Map<string, HistoryEntry>();
  for (const entry of lists.flat()) {
    const hex = normalizeHex(entry.hex);
    const previous = unique.get(hex);
    if (!previous || entry.capturedAt > previous.capturedAt) unique.set(hex, { hex, capturedAt: entry.capturedAt });
  }
  return [...unique.values()].sort((a, b) => b.capturedAt - a.capturedAt).slice(0, 100);
}

function chromeStorage(): HistoryStorage {
  const chrome = (globalThis as typeof globalThis & { chrome?: { storage?: { local?: HistoryStorage } } }).chrome;
  if (!chrome?.storage?.local) throw new Error('Storage unavailable');
  return chrome.storage.local;
}

export function createHistoryRepository(getStorage: () => HistoryStorage = chromeStorage) {
  let queue: Promise<unknown> = Promise.resolve();
  let unsaved: HistoryEntry[] = [];
  function serialize<T>(operation: () => Promise<T>): Promise<T> {
    const result = queue.then(operation);
    queue = result.catch(() => undefined);
    return result;
  }
  const read = async () => {
    const storage = getStorage();
    const data = await storage.get(HISTORY_KEY);
    return parseHistory(data[HISTORY_KEY]);
  };
  function update(transform: (entries: HistoryEntry[]) => { entries: HistoryEntry[]; removed?: HistoryEntry }) {
    return serialize(async () => {
      const stored = await read();
      const result = transform(mergeHistory(unsaved, stored.entries));
      await getStorage().set({ [HISTORY_KEY]: result.entries });
      unsaved = [];
      return { ...result, malformed: stored.malformed };
    });
  }
  return {
    load: () => serialize(read),
    capture: (entry: HistoryEntry) => {
      const validated = parseHistory([entry]).entries[0];
      if (!validated) return Promise.reject(new Error('Invalid capture'));
      return serialize(async () => {
        unsaved = mergeHistory([validated], unsaved);
        const stored = await read();
        const entries = mergeHistory(unsaved, stored.entries);
        await getStorage().set({ [HISTORY_KEY]: entries });
        unsaved = [];
        return { entries, malformed: stored.malformed };
      });
    },
    remove: (value: string) => {
      const hex = normalizeHex(value);
      return update(entries => ({ entries: entries.filter(entry => entry.hex !== hex), removed: entries.find(entry => entry.hex === hex) }));
    },
    clear: () => update(() => ({ entries: [] })),
    restore: (entry: HistoryEntry) => {
      const validated = parseHistory([entry]).entries[0];
      if (!validated) return Promise.reject(new Error('Invalid restore'));
      return update(entries => ({ entries: mergeHistory(entries, [validated]) }));
    },
  };
}

export const colorHistoryRepository = createHistoryRepository();
