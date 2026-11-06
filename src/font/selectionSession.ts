import { FontInspectionError, browserFontError, isFontErrorCode } from './errors.ts';
import { readTarget, verifyTarget } from './targetTab.ts';
import { startPageSelection } from './pageSelection.ts';
import { validateFontResult, type FontResult } from './types.ts';
import type { FontBrowserApi, TargetTab } from './browserApi.ts';
export interface SelectionSender { id?: string; url?: string; frameId?: number; tab?: { id?: number } }
export interface SelectionApi extends Omit<FontBrowserApi, 'runtime' | 'scripting' | 'tabs'> {
  runtime: FontBrowserApi['runtime'] & { id: string; onMessage: {
    addListener(listener: (value: unknown, sender: SelectionSender) => void): void;
    removeListener(listener: (value: unknown, sender: SelectionSender) => void): void;
  } };
  tabs: FontBrowserApi['tabs'] & { update(id: number, values: { active: boolean }): Promise<unknown>;
    sendMessage(id: number, message: { type: string; sessionId: string }, options: { frameId: number }): Promise<unknown> };
  windows: { update(id: number, values: { focused: boolean }): Promise<unknown> };
  scripting: { executeScript(options: { target: { tabId: number; frameIds: number[] }; world: 'ISOLATED'; func: typeof startPageSelection;
    args: [{ sessionId: string; url: string; leaseMs: number }] }): Promise<Array<{ frameId: number; result?: unknown }>> };
}
export function selectionApi(): SelectionApi {
  const chrome = (globalThis as typeof globalThis & { chrome?: SelectionApi }).chrome;
  if (!chrome?.runtime?.onMessage || !chrome.tabs?.sendMessage || !chrome.scripting?.executeScript) throw new FontInspectionError('API_UNAVAILABLE', 'api-availability');
  return chrome;
}
export interface SelectionSession { id: string; target: TargetTab }
export async function startSelection(api: SelectionApi, id: string, prepared?: (session: SelectionSession) => boolean | void, failed?: () => void): Promise<SelectionSession> {
  const target = await readTarget(api); await verifyTarget(api, target);
  if (prepared?.({ id, target }) === false) throw new Error('Selection cancelled before activation.');
  const session = { id, target };
  try {
    let results: Awaited<ReturnType<SelectionApi['scripting']['executeScript']>>;
    try {
      results = await api.scripting.executeScript({ target: { tabId: target.id, frameIds: [0] }, world: 'ISOLATED', func: startPageSelection,
        args: [{ sessionId: id, url: target.url, leaseMs: 5000 }] });
    } catch (error) { throw browserFontError(error, 'injection', 'INJECTION_FAILED'); }
    const result = results.find(item => item.frameId === 0)?.result;
    if (result && typeof result === 'object' && 'failure' in result && result.failure && typeof result.failure === 'object') {
      const failure = result.failure as Record<string, unknown>;
      const code = isFontErrorCode(failure.code) ? failure.code : 'CONTROLLER_INIT_FAILED';
      const stage = typeof failure.stage === 'string' && /^[a-z-]{1,40}$/.test(failure.stage) ? failure.stage : 'controller-init';
      throw new FontInspectionError(code, stage);
    }
    if (!result || typeof result !== 'object' || !('started' in result) || result.started !== id) throw new FontInspectionError('CONTROLLER_INIT_FAILED', 'controller-acknowledgment');
    return session;
  } catch (error) {
    failed?.();
    // Even a malformed/missing acknowledgment can follow partial installation.
    await cancelSelection(api, session).catch(() => undefined);
    throw error;
  }
}
export async function cancelSelection(api: SelectionApi, session: SelectionSession) {
  await api.tabs.sendMessage(session.target.id, { type: 'designInspector.fontSelection.cancel', sessionId: session.id }, { frameId: 0 });
}
export async function checkSelection(api: SelectionApi, session: SelectionSession) {
  const current = await readTarget(api);
  if (current.token !== session.target.token) throw new FontInspectionError('TARGET_NAVIGATED', 'heartbeat-target');
  await verifyTarget(api, session.target);
  let response: unknown;
  try { response = await api.tabs.sendMessage(session.target.id, { type: 'designInspector.fontSelection.heartbeat', sessionId: session.id }, { frameId: 0 }); }
  catch (error) { throw browserFontError(error, 'controller-heartbeat', 'CONTROLLER_LOST'); }
  if (!response || typeof response !== 'object' || !('ok' in response) || response.ok !== true) throw new FontInspectionError('CONTROLLER_LOST', 'controller-heartbeat');
}
export function selectionResult(value: unknown, sender: SelectionSender, session: SelectionSession, extensionId: string):
  { status: 'selected'; fonts: FontResult } | { status: 'cancelled' | 'error' } | null {
  if (sender.id !== extensionId || sender.tab?.id !== session.target.id || sender.frameId !== 0 || sender.url !== session.target.url) return null;
  if (!value || typeof value !== 'object') return null;
  const message = value as Record<string, unknown>;
  if (message.type !== 'designInspector.fontSelection.result' || message.sessionId !== session.id || message.pageUrl !== session.target.url) return null;
  if (message.status === 'cancelled' || message.status === 'error') return { status: message.status };
  if (message.status !== 'selected') return null;
  return { status: 'selected', fonts: validateFontResult(message.fonts) };
}
