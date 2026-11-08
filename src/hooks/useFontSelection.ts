import { diagnoseFontError, FontInspectionError } from '../font/errors';
import { readTarget, verifyTarget } from '../font/targetTab';
import { useEffect, useRef, useState } from 'react';
import { cancelSelection, checkSelection, selectionApi, selectionResult, startSelection, type SelectionApi, type SelectionSession } from '../font/selectionSession';
import type { FontResult } from '../font/types';
import { usePageFontPreview } from './usePageFontPreview';

export function useFontSelection(enabled: boolean) {
  const [phase, setPhase] = useState<'idle' | 'starting' | 'active'>('idle');
  const [fonts, setFonts] = useState<FontResult | null>(null);
  const [message, setMessage] = useState('');
  const pagePreview = usePageFontPreview(enabled);
  const selected = useRef<{ session: SelectionSession; fonts: FontResult } | null>(null);
  const active = useRef<SelectionSession | null>(null);
  const generation = useRef(0);
  const mounted = useRef(true);
  const busy = useRef(false);
  const activationFailure = useRef<string | null>(null);
  const validating = useRef<string | null>(null);
  const listenerError = useRef<FontInspectionError | null>(null);
  const cancelCurrent = useRef<() => void>(() => undefined);
  useEffect(() => {
    mounted.current = true;
    if (!enabled) return;
    let api: SelectionApi;
    try { api = selectionApi(); } catch { return; }
    let checking = false;
    const end = (text: string, cancelPage = true) => {
      const session = active.current; active.current = null; validating.current = null; generation.current++; busy.current = false;
      if (session && cancelPage) void cancelSelection(api, session).catch(() => undefined);
      if (mounted.current) { setPhase('idle'); setMessage(text); }
    };
    cancelCurrent.current = () => end('Font inspection cancelled.');
    const receive: Parameters<SelectionApi['runtime']['onMessage']['addListener']>[0] = (value, sender) => {
      const session = active.current;
      if (!session || activationFailure.current === session.id) return;
      try {
        const result = selectionResult(value, sender, session, api.runtime.id);
        if (!result) return;
        if (result.status === 'selected') {
          if (validating.current === session.id) return;
          validating.current = session.id;
          // Recheck target generation before accepting an asynchronous result.
          void (async () => {
            const target = await readTarget(api); await verifyTarget(api, session.target);
            if (target.token !== session.target.token) throw new FontInspectionError('TARGET_NAVIGATED', 'result-target');
            if (active.current?.id !== session.id || !mounted.current) return;
            selected.current = { session, fonts: result.fonts };
            setFonts(result.fonts); end('Font selected.', false);
          })().catch(error => { if (active.current?.id === session.id) end(diagnoseFontError(error, 'result-validation').message); });
        } else end(result.status === 'cancelled' ? 'Font inspection cancelled.' : 'Font selection failed. Please try again.', false);
      } catch { end('The page returned invalid font properties. Please try again.'); }
    };
    try { api.runtime.onMessage.addListener(receive); listenerError.current = null; }
    catch (error) { listenerError.current = new FontInspectionError('BACKGROUND_MESSAGE_FAILED', 'result-listener'); diagnoseFontError(error, 'result-listener'); return; }
    const heartbeat = setInterval(() => {
      const session = active.current;
      if (!session || checking || validating.current === session.id) return;
      checking = true;
      void checkSelection(api, session).catch(error => {
        if (active.current?.id === session.id && validating.current !== session.id) end(diagnoseFontError(error, 'heartbeat').message);
      }).finally(() => { checking = false; });
    }, 1000);
    const pagehide = () => { const session = active.current; if (session) void cancelSelection(api, session).catch(() => undefined); };
    window.addEventListener('pagehide', pagehide);
    const cleanupSession = () => {
      end('Font inspection cancelled.');
      mounted.current = false;
    };
    return () => {
      cleanupSession();
      clearInterval(heartbeat);
      try { api.runtime.onMessage.removeListener(receive); } catch { /* Extension context may have closed. */ }
      window.removeEventListener('pagehide', pagehide);
    };
  }, [enabled]);
  const start = async () => {
    if (busy.current || active.current || !enabled) return;
    selected.current = null; pagePreview.reset();
    busy.current = true; const operation = ++generation.current;
    setPhase('starting'); setFonts(null); setMessage('Starting font inspection…');
    let session: SelectionSession | undefined;
    let requestedId: string | undefined;
    try {
      const api = selectionApi();
      if (listenerError.current) throw listenerError.current;
      requestedId = crypto.randomUUID();
      session = await startSelection(api, requestedId, prepared => {
        if (!mounted.current || operation !== generation.current) return false;
        active.current = prepared; return true;
      }, () => { activationFailure.current = requestedId ?? null; });
      if (!mounted.current || operation !== generation.current) { void cancelSelection(api, session).catch(() => undefined); return; }
      active.current = session;
      await checkSelection(api, session);
      if (active.current?.id !== session.id) return;
      setPhase('active'); setMessage('Inspection active. Hover over text in the target page and click to select. Escape cancels.');
      try { await api.tabs.update(session.target.id, { active: true }); await api.windows.update(session.target.windowId, { focused: true }); }
      catch { if (active.current?.id === session.id) setMessage('Inspection active. Focus the target webpage to select text. Escape cancels.'); }
    } catch (error) {
      if (activationFailure.current === requestedId) activationFailure.current = null;
      if (session && validating.current === session.id) return;
      if (session) { try { void cancelSelection(selectionApi(), session).catch(() => undefined); } catch { /* API unavailable; page lease handles cleanup. */ } }
      if (mounted.current && operation === generation.current) {
        active.current = null; busy.current = false; setPhase('idle'); setMessage(diagnoseFontError(error, 'activation').message);
      }
    }
  };
  return { phase, fonts, message, start, cancel: () => { pagePreview.reset(); cancelCurrent.current(); },
    pagePreview: { ...pagePreview, generate: () => {
      const value = selected.current;
      if (value) void pagePreview.generate(value.session, value.fonts);
    } },
  };
}
