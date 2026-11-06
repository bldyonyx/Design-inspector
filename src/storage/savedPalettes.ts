import { normalizeHex } from '../utils/color.ts';
import type { HistoryStorage } from './colorHistory.ts';

export const PALETTES_KEY = 'designInspector.savedPalettes.v1';
export interface SavedPalette { id: string; name: string; colors: string[]; createdAt: number; updatedAt: number }

export function paletteName(value: string): string {
  const name = value.trim();
  if (!name) throw new Error('Enter a palette name.');
  if (name.length > 50) throw new Error('Use 50 characters or fewer.');
  return name;
}

export function parsePalettes(value: unknown): { palettes: SavedPalette[]; malformed: boolean } {
  if (value === undefined) return { palettes: [], malformed: false };
  if (!Array.isArray(value)) throw new Error('Invalid palette storage');
  const palettes: SavedPalette[] = [];
  const ids = new Set<string>();
  let malformed = false;
  for (const item of value) {
    try {
      if (!item || typeof item !== 'object' || typeof item.id !== 'string' || !item.id.trim() || item.id.length > 128
        || ids.has(item.id) || typeof item.name !== 'string' || !Array.isArray(item.colors)
        || !Number.isSafeInteger(item.createdAt) || item.createdAt < 0
        || !Number.isSafeInteger(item.updatedAt) || item.updatedAt < item.createdAt) throw new Error('Invalid palette');
      const name = paletteName(item.name);
      const colors: string[] = [];
      for (const color of item.colors) {
        try {
          if (typeof color !== 'string') throw new Error('Invalid color');
          const hex = normalizeHex(color);
          if (!colors.includes(hex)) colors.push(hex);
        } catch { malformed = true; }
      }
      palettes.push({ id: item.id, name, colors, createdAt: item.createdAt, updatedAt: item.updatedAt });
      ids.add(item.id);
    } catch { malformed = true; }
  }
  return { palettes: palettes.sort((a, b) => b.updatedAt - a.updatedAt), malformed };
}

function localStorageApi(): HistoryStorage {
  const chrome = (globalThis as typeof globalThis & { chrome?: { storage?: { local?: HistoryStorage } } }).chrome;
  if (!chrome?.storage?.local) throw new Error('Storage unavailable');
  return chrome.storage.local;
}

function uniqueId(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 15) | 64;
  bytes[8] = (bytes[8] & 63) | 128;
  const hex = [...bytes].map(value => value.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function createPalettesRepository(getStorage: () => HistoryStorage = localStorageApi) {
  let queue: Promise<unknown> = Promise.resolve();
  const serialize = <T,>(operation: () => Promise<T>) => {
    const result = queue.then(operation);
    queue = result.catch(() => undefined);
    return result;
  };
  const read = async () => {
    const data = await getStorage().get(PALETTES_KEY);
    return parsePalettes(data[PALETTES_KEY]);
  };
  const update = (id: string, transform: (palette: SavedPalette) => SavedPalette) => serialize(async () => {
    const stored = await read();
    const palette = stored.palettes.find(item => item.id === id);
    if (!palette) throw new Error('Palette not found');
    const changed = transform(palette);
    if (changed.name === palette.name && changed.colors.length === palette.colors.length && changed.colors.every((hex, index) => hex === palette.colors[index])) {
      return { ...stored, palette, alreadySaved: false };
    }
    const updated = { ...changed, updatedAt: Math.max(Date.now(), palette.updatedAt + 1) };
    const palettes = [updated, ...stored.palettes.filter(item => item.id !== id)];
    await getStorage().set({ [PALETTES_KEY]: palettes });
    return { ...stored, palettes, palette: updated, alreadySaved: false };
  });
  return {
    load: () => serialize(read),
    create: (input: string, color?: string) => serialize(async () => {
      const name = paletteName(input);
      const colors = color === undefined ? [] : [normalizeHex(color)];
      const stored = await read();
      const now = Date.now();
      let id = uniqueId();
      while (stored.palettes.some(palette => palette.id === id)) id = uniqueId();
      const palette = { id, name, colors, createdAt: now, updatedAt: now };
      const palettes = [palette, ...stored.palettes];
      await getStorage().set({ [PALETTES_KEY]: palettes });
      return { ...stored, palettes, palette, alreadySaved: false };
    }),
    rename: (id: string, name: string) => update(id, palette => ({ ...palette, name: paletteName(name) })),
    removeColor: (id: string, color: string) => update(id, palette => ({ ...palette, colors: palette.colors.filter(hex => hex !== normalizeHex(color)) })),
    restoreColor: (id: string, color: string, index: number) => update(id, palette => {
      const hex = normalizeHex(color);
      const colors = [...palette.colors];
      if (!colors.includes(hex)) colors.splice(Math.max(0, Math.min(index, colors.length)), 0, hex);
      return { ...palette, colors };
    }),
    delete: (id: string) => serialize(async () => {
      const stored = await read();
      const palette = stored.palettes.find(item => item.id === id);
      if (!palette) throw new Error('Palette not found');
      const palettes = stored.palettes.filter(item => item.id !== id);
      await getStorage().set({ [PALETTES_KEY]: palettes });
      return { ...stored, palettes, palette, alreadySaved: false };
    }),
    addColor: (id: string, color: string) => serialize(async () => {
      const hex = normalizeHex(color);
      const stored = await read();
      const palette = stored.palettes.find(item => item.id === id);
      if (!palette) throw new Error('Palette not found');
      if (palette.colors.includes(hex)) return { ...stored, palette, alreadySaved: true };
      const updated = { ...palette, colors: [...palette.colors, hex], updatedAt: Math.max(Date.now(), palette.updatedAt + 1) };
      const palettes = [updated, ...stored.palettes.filter(item => item.id !== id)];
      await getStorage().set({ [PALETTES_KEY]: palettes });
      return { ...stored, palettes, palette: updated, alreadySaved: false };
    }),
  };
}

export const palettesRepository = createPalettesRepository();
