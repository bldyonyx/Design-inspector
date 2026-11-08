import { readTarget, verifyTarget } from './targetTab.ts';
import { validateFontResult, type FontResult } from './types.ts';
import type { FontBrowserApi, TargetTab } from './browserApi.ts';
import { renderSpecimen, type SpecimenRequest } from './renderSpecimen.ts';

export const RASTER_WIDTH = 480;
export const RASTER_HEIGHT = 144;
export const RASTER_BASE64_LENGTH = RASTER_WIDTH * RASTER_HEIGHT * 4 / 3 * 4;
export interface SpecimenRaster {
  width: 480; height: 144; format: 'rgba8'; pixels: string;
  stretchApplied: boolean; spacingApplied: boolean;
}
export interface SpecimenApi extends Pick<FontBrowserApi, 'runtime' | 'tabs'> {
  scripting: { executeScript(options: { target: { tabId: number; frameIds: number[] }; world: 'ISOLATED';
    func: typeof renderSpecimen; args: [SpecimenRequest] }): Promise<Array<{ frameId: number; result?: unknown }>> };
}

export function specimenApi(): SpecimenApi {
  const api = (globalThis as typeof globalThis & { chrome?: SpecimenApi }).chrome;
  if (!api?.runtime?.sendMessage || !api.tabs?.get || !api.scripting?.executeScript) throw new Error('Specimen extension APIs unavailable.');
  return api;
}

export function validateRaster(value: unknown, requestId: string, pageUrl: string): SpecimenRaster {
  if (requestId.length > 64 || pageUrl.length > 8192) throw new Error('Specimen envelope is too large.');
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid specimen response.');
  const v = value as Record<string, unknown>;
  if (v.type !== 'designInspector.fontSpecimen.v1' || v.requestId !== requestId || v.pageUrl !== pageUrl) throw new Error('Stale specimen response.');
  if (v.status === 'error') {
    if (Object.keys(v).length !== 5 || !['document-changed', 'canvas-unavailable', 'render-failed'].includes(v.code as string)) throw new Error('Invalid specimen failure.');
    throw new Error(`Specimen unavailable: ${v.code}.`);
  }
  if (Object.keys(v).length !== 10 || v.status !== 'ok' || v.width !== RASTER_WIDTH || v.height !== RASTER_HEIGHT
    || v.format !== 'rgba8' || typeof v.stretchApplied !== 'boolean' || typeof v.spacingApplied !== 'boolean'
    || typeof v.pixels !== 'string' || v.pixels.length !== RASTER_BASE64_LENGTH || !/^[A-Za-z0-9+/]+$/.test(v.pixels)) {
    throw new Error('Invalid specimen raster.');
  }
  return { width: 480, height: 144, format: 'rgba8', pixels: v.pixels, stretchApplied: v.stretchApplied, spacingApplied: v.spacingApplied };
}

// One-shot script return: separate from production selection messages, no relay
// listener. Aborting/replacing discards a result; synchronous page work is bounded.
export async function requestSpecimen(api: SpecimenApi, target: TargetTab, fonts: FontResult, signal: AbortSignal): Promise<SpecimenRaster> {
  if (target.url.length > 8192) throw new Error('Specimen target URL is too long.');
  const check = async () => {
    signal.throwIfAborted();
    const current = await readTarget(api);
    if (current.token !== target.token || current.id !== target.id || current.windowId !== target.windowId || current.url !== target.url) {
      throw new Error('The specimen target changed. Select text again.');
    }
    await verifyTarget(api, target); signal.throwIfAborted();
  };
  const safeFonts = validateFontResult(fonts);
  await check();
  const requestId = crypto.randomUUID();
  const results = await api.scripting.executeScript({ target: { tabId: target.id, frameIds: [0] }, world: 'ISOLATED', func: renderSpecimen,
    args: [{ requestId, pageUrl: target.url, fonts: safeFonts }] });
  await check();
  if (results.length !== 1 || results[0].frameId !== 0) throw new Error('Invalid specimen frame.');
  return validateRaster(results[0].result, requestId, target.url);
}

export function paintRaster(canvas: HTMLCanvasElement, raster: SpecimenRaster) {
  canvas.width = raster.width; canvas.height = raster.height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas unavailable in inspector.');
  const binary = atob(raster.pixels);
  const bytes = Uint8ClampedArray.from(binary, c => c.charCodeAt(0));
  context.putImageData(new ImageData(bytes, raster.width, raster.height), 0, 0);
}
