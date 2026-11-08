// Self-contained: Chrome serializes this function into the isolated main frame.
export function startPageSelection(options: { sessionId: string; url: string; leaseMs: number }) {
  let rollback: (() => void) | undefined;
  let stage = 'environment';
  try {
  type Sender = { id?: string; url?: string; frameId?: number };
  type Listener = (message: unknown, sender: Sender, reply: (response: unknown) => void) => boolean | void;
  type Runtime = { id: string; getURL(path: string): string; sendMessage(message: unknown): Promise<unknown>;
    onMessage: { addListener(listener: Listener): void; removeListener(listener: Listener): void } };
  const scope = globalThis as typeof globalThis & { chrome?: { runtime: Runtime }; __designInspectorFontSelection?: { stop: () => void } };
  const runtime = scope.chrome?.runtime;
  if (!/^https?:/.test(location.protocol)) return { failure: { code: 'RESTRICTED_PAGE', stage: 'page-validation' } };
  if (location.href !== options.url) return { failure: { code: new URL(location.href).origin !== new URL(options.url).origin ? 'TARGET_NAVIGATED_ORIGIN' : 'TARGET_NAVIGATED', stage: 'page-validation' } };
  if (!runtime?.onMessage) return { failure: { code: 'CONTROLLER_INIT_FAILED', stage: 'runtime' } };
  stage = 'previous-session';
  scope.__designInspectorFontSelection?.stop();
  let ended = false;
  let candidate: Element | null = null;
  let frame = 0;
  let watchdog: ReturnType<typeof setInterval> | undefined;
  let lastHeartbeat = Date.now();
  stage = 'overlay-element';
  const host = document.createElement('div');
  host.setAttribute('data-design-inspector-font', ''); host.setAttribute('aria-hidden', 'true');
  host.style.cssText = 'all:initial!important;position:fixed!important;top:0!important;left:0!important;width:0!important;height:0!important;pointer-events:none!important;z-index:2147483647!important;';
  stage = 'shadow-root';
  const shadow = host.attachShadow({ mode: 'closed' });
  const outline = document.createElement('div');
  outline.style.cssText = 'display:none;position:fixed;box-sizing:border-box;border:2px solid #292929;box-shadow:0 0 0 1px white;pointer-events:none;background:transparent;';
  shadow.append(outline);
  const excluded = 'input,textarea,select,button,form,option,datalist,[role="searchbox"],[role="spinbutton"],[role="checkbox"],[role="radio"],[role="switch"],[contenteditable]:not([contenteditable="false"]),[role="textbox"],[role="combobox"],[role="button"],[role="slider"],[hidden],[aria-hidden="true"],svg,canvas,video,iframe,script,style';
  const findCandidate = (element: Element | null): Element | null => {
    if (!element || element.closest(excluded)) return null;
    for (let count = 0; element && count < 6; count++, element = element.parentElement) {
      if (element === document.body || element === document.documentElement) return null;
      const style = getComputedStyle(element), rect = element.getBoundingClientRect();
      if (style.visibility !== 'visible' || style.display === 'none' || !rect.width || !rect.height) continue;
      // Text-node layout proves visible text without reading its string/value.
      for (const node of [...element.childNodes].slice(0, 200)) {
        if (node.nodeType !== Node.TEXT_NODE) continue;
        const range = document.createRange(); range.selectNodeContents(node);
        const hasText = [...range.getClientRects()].some(rect => rect.width > 0 && rect.height > 0);
        range.detach();
        if (hasText) return element;
      }
    }
    return null;
  };
  const cleanup = () => {
    if (ended) return;
    ended = true; cancelAnimationFrame(frame); clearInterval(watchdog);
    window.removeEventListener('pointermove', move, true);
    window.removeEventListener('pointerdown', suppress, true); window.removeEventListener('mousedown', suppress, true);
    window.removeEventListener('pointerup', suppress, true); window.removeEventListener('mouseup', suppress, true);
    window.removeEventListener('click', click, true); window.removeEventListener('keydown', keydown, true);
    window.removeEventListener('pagehide', pagehide);
    try { runtime.onMessage.removeListener(message); } catch { /* Extension context may have been unloaded. */ }
    host.remove(); candidate = null;
    if (scope.__designInspectorFontSelection === controller) delete scope.__designInspectorFontSelection;
  };
  const finish = (status: 'selected' | 'cancelled' | 'error', fonts?: Record<string, string>) => {
    if (ended) return;
    cleanup();
    try {
      void runtime.sendMessage({ type: 'designInspector.fontSelection.result', sessionId: options.sessionId, status, fonts, pageUrl: options.url }).catch(() => undefined);
    } catch { /* Cleanup must still complete when the extension is unloaded. */ }
  };
  const move = (event: PointerEvent) => {
    try { candidate = findCandidate(document.elementFromPoint(event.clientX, event.clientY)); } catch { finish('error'); }
  };
  const suppress = (event: MouseEvent) => {
    try {
      if (findCandidate(event.target instanceof Element ? event.target : null)) { event.preventDefault(); event.stopImmediatePropagation(); }
    } catch { finish('error'); }
  };
  const click = (event: MouseEvent) => {
    try {
      const selected = findCandidate(event.target instanceof Element ? event.target : null);
      if (!selected) return;
      event.preventDefault(); event.stopImmediatePropagation();
      const style = getComputedStyle(selected);
      finish('selected', { fontFamily: style.fontFamily, fontSize: style.fontSize, fontWeight: style.fontWeight,
        lineHeight: style.lineHeight, letterSpacing: style.letterSpacing,
        fontStyle: style.fontStyle, fontStretch: style.fontStretch,
        fontVariationSettings: style.fontVariationSettings, fontFeatureSettings: style.fontFeatureSettings,
        fontOpticalSizing: style.fontOpticalSizing });
    } catch { finish('error'); }
  };
  const keydown = (event: KeyboardEvent) => { if (event.key === 'Escape') { event.preventDefault(); event.stopImmediatePropagation(); finish('cancelled'); } };
  const pagehide = () => finish('cancelled');
  const message: Listener = (value, sender, reply) => {
    if (sender.id !== runtime.id || sender.url !== runtime.getURL('index.html') || (sender.frameId !== undefined && sender.frameId !== 0)) return false;
    if (!value || typeof value !== 'object' || !('sessionId' in value) || value.sessionId !== options.sessionId || !('type' in value)) return false;
    if (value.type === 'designInspector.fontSelection.heartbeat') { lastHeartbeat = Date.now(); reply({ ok: true }); }
    else if (value.type === 'designInspector.fontSelection.cancel') { finish('cancelled'); reply({ ok: true }); }
    return false;
  };
  const draw = () => {
    if (ended) return;
    try {
      if (!host.isConnected) { finish('error'); return; }
      if (!candidate?.isConnected) outline.style.display = 'none';
      else {
        const rect = candidate.getBoundingClientRect();
        Object.assign(outline.style, { display: 'block', left: `${rect.left}px`, top: `${rect.top}px`, width: `${rect.width}px`, height: `${rect.height}px` });
      }
      frame = requestAnimationFrame(draw);
    } catch { finish('error'); }
  };
  rollback = cleanup;
  const controller = { stop: () => finish('cancelled') };
  try {
    stage = 'overlay-mount';
    document.documentElement.append(host);
    stage = 'message-listener';
    runtime.onMessage.addListener(message);
    stage = 'event-listeners';
    window.addEventListener('pointermove', move, true);
    window.addEventListener('pointerdown', suppress, true); window.addEventListener('mousedown', suppress, true);
    window.addEventListener('pointerup', suppress, true); window.addEventListener('mouseup', suppress, true);
    window.addEventListener('click', click, true); window.addEventListener('keydown', keydown, true);
    window.addEventListener('pagehide', pagehide);
    scope.__designInspectorFontSelection = controller;
    stage = 'watchdog';
    watchdog = setInterval(() => { if (Date.now() - lastHeartbeat > options.leaseMs) finish('cancelled'); }, 1000);
    frame = requestAnimationFrame(draw);
    return { started: options.sessionId };
  } catch (error) { cleanup(); throw error; }
  } catch (error) {
    try { rollback?.(); } catch { /* Preserve the initialization diagnosis. */ }
    return { failure: { code: 'CONTROLLER_INIT_FAILED', stage, name: error instanceof Error ? error.name : 'UnknownError' } };
  }
}

