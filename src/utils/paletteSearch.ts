import type { SavedPalette } from '../storage/savedPalettes.ts';
export function filterPalettes(palettes: readonly SavedPalette[], query: string): SavedPalette[] {
  const search = query.trim().toLowerCase();
  return palettes.filter(palette => palette.name.toLowerCase().includes(search));
}
export function recentPalettes(palettes: readonly SavedPalette[]): SavedPalette[] {
  return [...palettes].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 3);
}
