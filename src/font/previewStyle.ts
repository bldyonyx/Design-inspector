import type { FontResult } from './types';

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

// Presentation only: never rewrite the computed values shown in Font details.
export function previewStyle(fonts: FontResult, specimen = true) {
  const sourceSize = Number.parseFloat(fonts.fontSize);
  const size = clamp(sourceSize, specimen ? 40 : 16, specimen ? 64 : 24);
  const sourceLine = Number.parseFloat(fonts.lineHeight);
  const ratio = sourceSize > 0 && Number.isFinite(sourceLine) ? sourceLine / sourceSize : 1.4;
  const spacing = Number.parseFloat(fonts.letterSpacing);
  return {
    fontFamily: fonts.fontFamily,
    fontWeight: fonts.fontWeight,
    fontSize: `${size}px`,
    lineHeight: clamp(ratio, 1.2, 1.8),
    letterSpacing: `${Number.isFinite(spacing) ? clamp(spacing, 0, 3) : 0}px`,
  };
}
