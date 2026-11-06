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

chrome.action.onClicked.addListener(() => {
  // Coalesce clicks while creation/discovery is in flight.
  opening ??= openInspector()
    .catch((error) => console.error('Could not open Design Inspector:', error))
    .finally(() => { opening = undefined; });
  return opening;
});
