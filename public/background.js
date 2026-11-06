// Plain JavaScript is copied unchanged by Vite into dist/background.js.
const inspectorUrl = chrome.runtime.getURL('index.html');
let inspectorWindowId;
let opening;

async function focusWindow(windowId) {
  try {
    const window = await chrome.windows.get(windowId);
    if (window.type !== 'popup') return false;
    await chrome.windows.update(windowId, {
      focused: true,
      ...(window.state === 'minimized' ? { state: 'normal' } : {}),
    });
    inspectorWindowId = windowId;
    return true;
  } catch {
    // The window may have closed between discovery and focus.
    return false;
  }
}

async function openInspector() {
  // The cached ID also covers rapid clicks while the new page is loading.
  if (inspectorWindowId !== undefined && await focusWindow(inspectorWindowId)) return;
  inspectorWindowId = undefined;

  // Rediscover our own UI after MV3 suspends/restarts the worker. No storage or
  // access to other sites' tab URLs is required.
  const contexts = await chrome.runtime.getContexts({ documentUrls: [inspectorUrl] });
  for (const context of contexts) {
    if (context.windowId >= 0 && await focusWindow(context.windowId)) return;
  }

  const window = await chrome.windows.create({
    url: inspectorUrl,
    type: 'popup',
    focused: true,
    // Outer dimensions: allow roughly 16px for borders and 40px for the title
    // bar around the existing 380 × 550px UI. Native decorations vary by OS.
    width: 396,
    height: 590,
  });
  inspectorWindowId = window?.id;
}

// Session-only targeting survives worker suspension, never browser restarts.
// The toolbar event supplies the intended tab; inspector focus is irrelevant.
const fontTargetKey = 'designInspector.fontTarget.session.v1';
let targetQueue = Promise.resolve();
let targetUnavailable = false;
const updateTarget = (operation) => {
  const result = targetQueue.then(operation);
  targetQueue = result.catch(() => undefined);
  return result;
};

chrome.tabs.onUpdated.addListener((tabId, change) => {
  if (change.status !== 'loading' && change.url === undefined) return;
  void updateTarget(async () => {
    const saved = (await chrome.storage.session.get(fontTargetKey))[fontTargetKey];
    if (saved?.id === tabId) await chrome.storage.session.remove(fontTargetKey);
  }).catch(() => { targetUnavailable = true; });
});
chrome.tabs.onRemoved.addListener(tabId => {
  void updateTarget(async () => {
    const saved = (await chrome.storage.session.get(fontTargetKey))[fontTargetKey];
    if (saved?.id === tabId) await chrome.storage.session.remove(fontTargetKey);
  }).catch(() => { targetUnavailable = true; });
});

chrome.action.onClicked.addListener(tab => {
  const targetSaved = updateTarget(async () => {
    targetUnavailable = true;
    // Clear the previous target before replacing it; invalid clicks fail closed.
    await chrome.storage.session.remove(fontTargetKey);
    if (!Number.isSafeInteger(tab?.id) || typeof tab.url !== 'string') { targetUnavailable = false; return; }
    await chrome.storage.session.set({ [fontTargetKey]: {
      id: tab.id, windowId: tab.windowId, url: tab.url,
      token: `${Date.now()}-${Math.random()}`,
    } });
    targetUnavailable = false;
  }).catch(() => { targetUnavailable = true; });
  opening ??= targetSaved.then(openInspector)
    .catch((error) => console.error('Could not open Design Inspector:', error))
    .finally(() => { opening = undefined; });
  return Promise.all([opening, targetSaved]);
});

// Only our own top-level inspector page can request the captured target. Wait
// for capture/invalidation work before responding; never accept a requested ID.
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type !== 'designInspector.fontTarget.get') return false;
  if (sender.id !== chrome.runtime.id || sender.url !== inspectorUrl || (sender.frameId !== undefined && sender.frameId !== 0)) {
    sendResponse({ ok: false, error: 'Font targeting is only available in the inspector window.' });
    return false;
  }
  void targetQueue.then(async () => {
    if (targetUnavailable) throw new Error('Target unavailable');
    const data = await chrome.storage.session.get(fontTargetKey);
    sendResponse({ ok: true, target: data[fontTargetKey] ?? null });
  }).catch(() => sendResponse({ ok: false, error: 'The target tab is unavailable. Click the toolbar icon on the webpage again.' }));
  return true;
});
