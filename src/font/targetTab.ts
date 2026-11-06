import type { FontBrowserApi, TargetTab } from './browserApi.ts';
import { FontInspectionError, browserFontError, isFontErrorCode } from './errors.ts';
export const FONT_TARGET_KEY = 'designInspector.fontTarget.session.v1';
export async function readTarget(api: Pick<FontBrowserApi, 'runtime'>): Promise<TargetTab> {
  let response: unknown;
  try { response = await api.runtime.sendMessage({ type: 'designInspector.fontTarget.get' }); }
  catch (error) { throw browserFontError(error, 'target-message', 'BACKGROUND_MESSAGE_FAILED'); }
  if (!response || typeof response !== 'object' || !('ok' in response)) throw new FontInspectionError('BACKGROUND_MESSAGE_FAILED', 'target-response');
  if (response.ok !== true) {
    const code = 'code' in response && isFontErrorCode(response.code) ? response.code : 'BACKGROUND_MESSAGE_FAILED';
    throw new FontInspectionError(code, 'target-response');
  }
  const stored = 'target' in response ? response.target : null;
  if (!stored) throw new FontInspectionError('NO_TARGET', 'target-response');
  if (typeof stored !== 'object') throw new FontInspectionError('TARGET_UNAVAILABLE', 'target-validation');
  const value = stored as Record<string, unknown>;
  if (isFontErrorCode(value.invalidated)) throw new FontInspectionError(value.invalidated, 'target-invalidated');
  if (!Number.isSafeInteger(value.id) || (value.id as number) < 0 || !Number.isSafeInteger(value.windowId)
    || typeof value.url !== 'string' || typeof value.token !== 'string' || !value.token) {
    throw new FontInspectionError('TARGET_UNAVAILABLE', 'target-validation');
  }
  let url: URL;
  try { url = new URL(value.url); } catch { throw new FontInspectionError('TARGET_UNAVAILABLE', 'target-url'); }
  if (!['http:', 'https:'].includes(url.protocol)) throw new FontInspectionError('RESTRICTED_PAGE', 'target-url');
  return { id: value.id as number, windowId: value.windowId as number, url: value.url, token: value.token };
}
export async function verifyTarget(api: Pick<FontBrowserApi, 'tabs'>, target: TargetTab): Promise<void> {
  let tab: Awaited<ReturnType<FontBrowserApi['tabs']['get']>>;
  try { tab = await api.tabs.get(target.id); }
  catch (error) { throw browserFontError(error, 'target-tab', 'TARGET_UNAVAILABLE'); }
  if (tab.id !== target.id || !tab.url) throw new FontInspectionError('TARGET_UNAVAILABLE', 'target-tab');
  if (tab.windowId !== target.windowId) throw new FontInspectionError('TARGET_MOVED', 'target-tab');
  const destination = tab.pendingUrl || tab.url;
  let origin: string;
  try { origin = new URL(destination).origin; } catch { throw new FontInspectionError('TARGET_UNAVAILABLE', 'target-tab'); }
  if (origin !== new URL(target.url).origin) throw new FontInspectionError('TARGET_NAVIGATED_ORIGIN', 'target-tab');
  if (tab.url !== target.url) throw new FontInspectionError('TARGET_NAVIGATED', 'target-tab');
  if (tab.pendingUrl || tab.status === 'loading') throw new FontInspectionError('TARGET_LOADING', 'target-tab');
}
