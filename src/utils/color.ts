export function normalizeHex(value: string): string {
  if (value.length !== 7 || !/^#[0-9a-f]{6}$/i.test(value)) throw new Error('Invalid sampled color');
  return value.toUpperCase();
}

export async function copyText(value: string): Promise<void> {
  if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable');
  await navigator.clipboard.writeText(value);
}

export interface RGB { r: number; g: number; b: number }
export interface HSL { h: number; s: number; l: number }
export type ColorFormat = 'HEX' | 'RGB' | 'HSL';

function validateRgb({ r, g, b }: RGB): void {
  if (![r, g, b].every(value => Number.isInteger(value) && value >= 0 && value <= 255)) {
    throw new RangeError('RGB channels must be integers from 0 to 255');
  }
}

export function hexToRgb(value: string): RGB {
  const hex = normalizeHex(value);
  return { r: parseInt(hex.slice(1, 3), 16), g: parseInt(hex.slice(3, 5), 16), b: parseInt(hex.slice(5, 7), 16) };
}

export function rgbToHsl(rgb: RGB): HSL {
  validateRgb(rgb);
  const r = rgb.r / 255, g = rgb.g / 255, b = rgb.b / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const delta = max - min;
  const lightness = (max + min) / 2;
  let hue = 0;
  let saturation = 0;
  if (delta !== 0) {
    saturation = delta / (1 - Math.abs(2 * lightness - 1));
    if (max === r) hue = ((g - b) / delta) % 6;
    else if (max === g) hue = (b - r) / delta + 2;
    else hue = (r - g) / delta + 4;
    hue *= 60;
  }
  return { h: ((Math.round(hue) % 360) + 360) % 360, s: Math.round(saturation * 100), l: Math.round(lightness * 100) };
}

export function formatRgb(rgb: RGB): string {
  validateRgb(rgb);
  return `rgb(${rgb.r}, ${rgb.g}, ${rgb.b})`;
}

export function formatHsl({ h, s, l }: HSL): string {
  if (![h, s, l].every(Number.isFinite) || s < 0 || s > 100 || l < 0 || l > 100) {
    throw new RangeError('Invalid HSL color');
  }
  return `hsl(${((Math.round(h) % 360) + 360) % 360}, ${Math.round(s)}%, ${Math.round(l)}%)`;
}
