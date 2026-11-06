import type { FontBrowserApi, TargetTab } from './browserApi.ts';
export const FONT_TARGET_KEY = 'designInspector.fontTarget.session.v1';
const reopen = 'Open a normal webpage and click the Design Inspector toolbar icon again.';
export async function readTarget(api: FontBrowserApi): Promise<TargetTab> {
  let stored: unknown;
  try {
    const response = await api.runtime.sendMessage({ type: 'designInspector.fontTarget.get' });
    if (!response || typeof response !== 'object' || !('ok' in response) || response.ok !== true || !('target' in response)) throw new Error('Target unavailable');
    stored = response.target;
  }
  catch { throw new Error(`The target tab is unavailable. ${reopen}`); }
  if (!stored || typeof stored !== 'object') throw new Error(`No target tab is available. ${reopen}`);
  const value = stored as Record<string, unknown>;
  if (!Number.isSafeInteger(value.id) || (value.id as number) < 0 || !Number.isSafeInteger(value.windowId)
    || typeof value.url !== 'string' || typeof value.token !== 'string' || !value.token) {
    throw new Error(`The target tab reference is invalid. ${reopen}`);
  }
  let url: URL;
  try { url = new URL(value.url); } catch { throw new Error(`The target URL is invalid. ${reopen}`); }
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error(`This browser or extension page cannot be inspected. ${reopen}`);
  return { id: value.id as number, windowId: value.windowId as number, url: value.url, token: value.token };
}
export async function verifyTarget(api: FontBrowserApi, target: TargetTab): Promise<void> {
  let tab: Awaited<ReturnType<FontBrowserApi['tabs']['get']>>;
  try { tab = await api.tabs.get(target.id); }
  catch { throw new Error(`The target tab was closed or is unavailable. ${reopen}`); }
  if (tab.id !== target.id || tab.windowId !== target.windowId || tab.url !== target.url || tab.pendingUrl || tab.status === 'loading') {
    throw new Error(`The target page changed or access expired. ${reopen}`);
  }
}
