import type { inspectPageFont } from './inspectPageFont.ts';
export interface TargetTab { id: number; windowId: number; url: string; token: string }
export interface FontBrowserApi {
  runtime: { sendMessage(message: { type: 'designInspector.fontTarget.get' }): Promise<unknown> };
  tabs: { get(id: number): Promise<{ id?: number; windowId: number; url?: string; pendingUrl?: string; status?: string }> };
  scripting: { executeScript(injection: {
    target: { tabId: number; frameIds: number[] }; world: 'ISOLATED'; func: typeof inspectPageFont;
  }): Promise<Array<{ frameId: number; result?: unknown }>> };
}
export function fontBrowserApi(): FontBrowserApi {
  const chrome = (globalThis as typeof globalThis & { chrome?: Partial<FontBrowserApi> }).chrome;
  if (!chrome?.runtime?.sendMessage || !chrome.tabs?.get || !chrome.scripting?.executeScript) {
    throw new Error('Font testing is unavailable. Reload the extension and open it from a webpage toolbar icon.');
  }
  return chrome as FontBrowserApi;
}
