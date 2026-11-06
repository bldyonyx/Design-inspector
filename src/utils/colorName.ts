import { colorNames } from '../data/colorNames.ts';
import { hexToRgb, normalizeHex } from './color.ts';

interface OKLab { L: number; a: number; b: number }

// Linear-sRGB → OKLab matrices by Björn Ottosson (public domain):
// https://bottosson.github.io/posts/oklab/
export function hexToOklab(hex: string): OKLab {
  const rgb = hexToRgb(hex);
  const linear = (channel: number) => {
    const value = channel / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  };
  const r = linear(rgb.r), g = linear(rgb.g), b = linear(rgb.b);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return {
    L: 0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s,
    a: 1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s,
    b: 0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s,
  };
}

interface NamedColor { readonly name: string; readonly hex: string }

// Factory also allows deterministic tie behavior to be tested independently of
// the production catalog. Coordinates are computed once per catalog, not lookup.
export function createColorNameLookup(entries: readonly NamedColor[]) {
  if (!entries.length) throw new Error('Color catalog must not be empty');
  const candidates = entries.map(entry => ({ ...entry, hex: normalizeHex(entry.hex), lab: hexToOklab(entry.hex) }));
  return (input: string): { name: string; hex: string; exact: boolean } => {
    const hex = normalizeHex(input);
    const lab = hexToOklab(hex);
    let nearest = candidates[0];
    let bestDistance = Infinity;
    for (const entry of candidates) {
      const distance = (lab.L - entry.lab.L) ** 2 + (lab.a - entry.lab.a) ** 2 + (lab.b - entry.lab.b) ** 2;
      // Strict comparison preserves catalog order for equidistant candidates.
      if (distance < bestDistance) {
        bestDistance = distance;
        nearest = entry;
      }
    }
    return { name: nearest.name, hex: nearest.hex, exact: nearest.hex === hex };
  };
}

const lookup = createColorNameLookup(colorNames);
export function closestColorName(input: string): { name: string; hex: string; exact: boolean } {
  return lookup(input);
}
