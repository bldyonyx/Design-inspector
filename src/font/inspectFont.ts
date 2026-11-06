import { browserFontError } from './errors.ts';
import { fontBrowserApi, type FontBrowserApi } from './browserApi.ts';
import { inspectPageFont } from './inspectPageFont.ts';
import { readTarget, verifyTarget } from './targetTab.ts';
import { validateFontResult } from './types.ts';

export async function inspectFont(api: FontBrowserApi = fontBrowserApi()) {
  const target = await readTarget(api);
  await verifyTarget(api, target);
  let results: Awaited<ReturnType<FontBrowserApi['scripting']['executeScript']>>;
  try {
    results = await api.scripting.executeScript({ target: { tabId: target.id, frameIds: [0] }, world: 'ISOLATED', func: inspectPageFont });
  } catch (error) { throw browserFontError(error, 'prototype-injection', 'INJECTION_FAILED'); }
  const current = await readTarget(api);
  if (current.token !== target.token) throw new Error('The target changed during inspection. Click Test font inspection again.');
  await verifyTarget(api, target);
  const result = results.find(item => item.frameId === 0)?.result;
  if (result === null) throw new Error('No suitable visible heading or paragraph was found on this page.');
  if (!result || typeof result !== 'object' || !('pageUrl' in result) || result.pageUrl !== target.url || !('fonts' in result)) {
    throw new Error('The page changed or returned an invalid inspection result. Reopen from its toolbar icon.');
  }
  return { fonts: validateFontResult(result.fonts), source: new URL(target.url).hostname };
}
