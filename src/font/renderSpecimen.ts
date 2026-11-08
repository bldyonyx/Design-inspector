import type { FontResult } from './types.ts';

export interface SpecimenRequest { requestId: string; pageUrl: string; fonts: FontResult }

// Self-contained for scripting.executeScript. Never reads selected DOM/text,
// attaches a canvas, waits for fonts, or installs a listener.
export function renderSpecimen(request: SpecimenRequest) {
  const type = 'designInspector.fontSpecimen.v1' as const;
  const fail = (code: 'document-changed' | 'canvas-unavailable' | 'render-failed') =>
    ({ type, requestId: request.requestId, pageUrl: request.pageUrl, status: 'error' as const, code });
  if (location.href !== request.pageUrl) return fail('document-changed');
  let canvas: HTMLCanvasElement | undefined;
  try {
    canvas = document.createElementNS('http://www.w3.org/1999/xhtml', 'canvas') as HTMLCanvasElement;
    canvas.width = 480; canvas.height = 144;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) return fail('canvas-unavailable');
    const fonts = request.fonts;
    const clamp = (n: number, min: number, max: number) => Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : min;
    const spacing = clamp(Number.parseFloat(fonts.letterSpacing) || 0, 0, 3);
    // Canvas fontStretch supports keywords, whereas computed CSS often uses %.
    // Preserve only exactly representable values; do not quantize arbitrary axes.
    const stretches: Record<string, CanvasFontStretch> = {
      '50%': 'ultra-condensed', '62.5%': 'extra-condensed', '75%': 'condensed',
      '87.5%': 'semi-condensed', '100%': 'normal', '112.5%': 'semi-expanded',
      '125%': 'expanded', '150%': 'extra-expanded', '200%': 'ultra-expanded',
    };
    const stretch = fonts.fontStretch ? (stretches[fonts.fontStretch] ||
      (/^(normal|ultra-condensed|extra-condensed|condensed|semi-condensed|semi-expanded|expanded|extra-expanded|ultra-expanded)$/.test(fonts.fontStretch) ? fonts.fontStretch as CanvasFontStretch : undefined)) : undefined;
    const stretchApplied = 'fontStretch' in context && stretch !== undefined;
    const spacingApplied = 'letterSpacing' in context;
    context.fillStyle = '#ffffff'; context.fillRect(0, 0, 480, 144);
    context.fillStyle = '#202020'; context.textBaseline = 'alphabetic';
    context.direction = 'ltr';
    const draw = (text: string, size: number, baseline: number) => {
      // Establish a valid family/weight/size even if an older canvas rejects
      // the angled-oblique syntax accepted by getComputedStyle.
      context.font = `${fonts.fontWeight} ${size}px ${fonts.fontFamily}`;
      const plainFont = context.font;
      context.font = `${fonts.fontStyle || 'normal'} ${fonts.fontWeight} ${size}px ${fonts.fontFamily}`;
      if (context.font === plainFont && fonts.fontStyle?.startsWith('oblique ')) {
        context.font = `oblique ${fonts.fontWeight} ${size}px ${fonts.fontFamily}`;
      }
      if (stretchApplied) context.fontStretch = stretch;
      if (spacingApplied) context.letterSpacing = `${spacing}px`;
      // Fixed clipping, never shrink text horizontally or read page strings.
      context.fillText(text, 16, baseline);
    };
    draw('Aa Bb Cc', clamp(Number.parseFloat(fonts.fontSize), 40, 64), 68);
    draw('The quick brown fox jumps over the lazy dog.', clamp(Number.parseFloat(fonts.fontSize), 16, 24), 116);
    const bytes = context.getImageData(0, 0, 480, 144).data;
    let binary = '';
    for (let offset = 0; offset < bytes.length; offset += 8192) {
      binary += String.fromCharCode(...bytes.subarray(offset, offset + 8192));
    }
    return { type, requestId: request.requestId, pageUrl: location.href, status: 'ok' as const,
      width: 480 as const, height: 144 as const, format: 'rgba8' as const, pixels: btoa(binary), stretchApplied, spacingApplied };
  } catch { return fail('render-failed'); }
  finally {
    // Release the backing store immediately. The element was never connected.
    if (canvas) { canvas.width = 0; canvas.height = 0; }
  }
}
