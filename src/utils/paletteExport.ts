import type { SavedPalette } from '../storage/savedPalettes.ts';
import { closestColorName } from './colorName.ts';
import { normalizeHex } from './color.ts';

export type PaletteExportFormat = 'css' | 'json';
type ExportPalette = Pick<SavedPalette, 'name' | 'colors'>;

function safePrefix(name: string, fallback: string): string {
  const slug = name.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 64).replace(/-+$/g, '');
  if (!slug) return fallback;
  return /^[a-z]/.test(slug) ? slug : `${fallback}-${slug}`;
}

export function palettePrefix(name: string): string {
  return safePrefix(name, 'palette');
}

export function colorVariableNames(names: readonly string[]): string[] {
  const bases = names.map(name => safePrefix(name, 'color'));
  const counts = new Map<string, number>();
  for (const base of bases) counts.set(base, (counts.get(base) ?? 0) + 1);
  // Reserve all source slugs so generated suffixes never steal another name
  // (for example, repeated "Rose" alongside a literal "Rose 1").
  const reserved = new Set(bases);
  const used = new Set<string>();
  const next = new Map<string, number>();
  return bases.map(base => {
    let name = base;
    if (counts.get(base)! > 1) {
      let index = next.get(base) ?? 1;
      do { name = `${base}-${index++}`; } while (reserved.has(name) || used.has(name));
      next.set(base, index);
    }
    used.add(name);
    return name;
  });
}

export function paletteToCss(palette: ExportPalette): string {
  const colors = palette.colors.map(normalizeHex);
  const names = colorVariableNames(colors.map(hex => closestColorName(hex).name));
  const properties = colors.map((hex, index) => `  --${names[index]}: ${hex};`);
  return [':root {', ...properties, '}', ''].join('\n');
}

export function paletteToJson(palette: ExportPalette): string {
  return JSON.stringify({ name: palette.name, colors: palette.colors.map(normalizeHex) }, null, 2) + '\n';
}

export function paletteExportFilename(name: string, format: PaletteExportFormat): string {
  let base = palettePrefix(name);
  // Avoid reserved Windows device filenames, including their extension forms.
  if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i.test(base)) base = `palette-${base}`;
  return `${base}.${format}`;
}

export function createPaletteExport(palette: ExportPalette, format: PaletteExportFormat) {
  return {
    content: format === 'css' ? paletteToCss(palette) : paletteToJson(palette),
    filename: paletteExportFilename(palette.name, format),
    mimeType: format === 'css' ? 'text/css;charset=utf-8' : 'application/json;charset=utf-8',
  };
}

// A download request is not a guarantee that the browser saved a file. Allow
// time for browser handoff before revocation; the document also owns URL cleanup
// when it closes. No extension downloads permission is needed.
export function downloadPalette(palette: ExportPalette, format: PaletteExportFormat): void {
  const file = createPaletteExport(palette, format);
  const url = URL.createObjectURL(new Blob([file.content], { type: file.mimeType }));
  let anchor: HTMLAnchorElement | undefined;
  let requested = false;
  try {
    anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = file.filename;
    anchor.hidden = true;
    document.body.append(anchor);
    anchor.click();
    requested = true;
  } finally {
    anchor?.remove();
    if (requested) setTimeout(() => URL.revokeObjectURL(url), 60_000);
    else URL.revokeObjectURL(url);
  }
}
