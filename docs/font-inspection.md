# Font Inspector architecture

The Phase 7.1 sections below are retained as implementation history. Current
interactive usage and lifecycle are documented under **Phase 7.2** below.

## Phase 7.1 communication foundation

## Architecture audit and decision

Before this phase, the MV3 manifest had only `storage`; there were no content
scripts, host permissions, page messaging, or inspection APIs. The plain
JavaScript worker in `public/background.js` opened/focused one independent popup
window at `index.html`. Vite copies public assets unchanged; React/TypeScript is
bundled through Vite with the Tailwind v4 plugin. The test setup uses Node's built-in
runner plus optional CDP browser scripts, without a browser testing dependency.

The worker/window architecture remains. This phase adds only `activeTab` and
`scripting`, following [Chrome's activeTab model](https://developer.chrome.com/docs/extensions/develop/concepts/activeTab).
There is no `tabs` permission, broad host access, persistent content script,
content-script registration, remote code, or overlay. Minimum Chrome version stays
116. No dependency or extension framework was added.

## Targeting

The actual `chrome.action.onClicked` tab argument supplies the intended tab before
the inspector is opened/focused. The worker stores a session-only record under
`designInspector.fontTarget.session.v1`: tab ID, original window ID, full URL, and
an opaque generation token. It is separate from all local user-data keys and
contains no font result or page text. `storage.session` survives worker suspension
but clears when the extension/browser session ends; it uses the existing storage
permission. Existing local history/palette keys and schemas are unchanged.

There is deliberately no query for the currently focused/active tab: when the
inspector has focus, that could identify the inspector itself. The target remains
the last toolbar-selected tab even when the user switches to another webpage.
Click the toolbar icon on the desired webpage to retarget. Multiple browser windows
are supported by capturing/checking the original window ID. Moving the target tab
to another window conservatively requires another toolbar click.

The worker invalidates the record on target navigation/loading, URL changes, or
tab closure. This also invalidates on same-origin reloads even where Chromium may
retain activeTab access. Click the toolbar again after navigation finishes. Invalid
or restricted toolbar targets never fall back to an unrelated tab. Capture and
invalidation operations are serialized; targeting/storage failures do not prevent
the Color Inspector window from opening.

## Communication and validation

1. Test font inspection, under the Fonts tab's DEVELOPMENT TEST section, requests
   `{type: 'designInspector.fontTarget.get'}` with `runtime.sendMessage`.
2. The worker accepts only the extension's own index page, rejects other senders,
   waits for queued capture/invalidation, and responds using a callback with
   `return true` for Chromium 116 compatibility. Callers cannot supply a tab ID.
3. `targetTab.ts` validates the returned target and checks it with `tabs.get`.
   Missing/closed tabs, unavailable URLs, loading, navigation or window changes
   produce actionable errors rather than guessing a replacement.
4. `inspectFont.ts` invokes `scripting.executeScript` with one packaged function,
   isolated world, and main frame `[0]`. No arbitrary code or function arguments
   come from the page or UI. Its returned Promise carries the response to React;
   a persistent content-script message listener is unnecessary for this milestone.
5. After injection, the target token and tab metadata are checked again. Navigation
   or retargeting during the request rejects the result. The returned page URL
   must match the captured target. All five properties are validated and copied
   into a new object before display.

HTTP(S) pages are allowed candidates; browser/extension/file pages are rejected.
HTTP(S) browser stores and other protected documents may still refuse injection;
permission failures are caught with guidance to reopen from an eligible webpage.
No errors are treated as successful inspection, and old results clear on retry.

## Inspection function and scope

`inspectPageFont.ts` is self-contained so Vite's bundled function can be serialized
by Chrome. It examines up to 500 headings/paragraphs in DOM order and returns the
first visible candidate with a direct text node. It excludes form descendants,
editable, hidden and aria-hidden ancestors. It does not read text-node values,
input values, selection, HTML, or arbitrary page content; it reads computed CSS
and layout visibility only. There are no persistent DOM changes.

Only `fontFamily`, `fontSize`, `fontWeight`, `lineHeight`, and `letterSpacing` reach
React. The internal page URL supports race checks and the UI shows its hostname
as the source. Results stay in component memory, never history or storage. A
font-family stack describes computed CSS, not proof of the actual rendered font
face. The prototype does not search iframes or shadow roots, select hovered
nodes, inspect arbitrary elements, or read every font on the page.

## Verification completed

- `npm run build` and `npm run lint` pass without warnings.
- All 62 unit/repository tests pass. New/extended tests cover tab capture from
  different windows, worker restart, navigation/close invalidation, guarded target
  messaging, session failure, correct injection ID/world/frame/function,
  restricted/missing/closed/loading/changed targets, retargeting races,
  malformed/incomplete results, and fractional font weights.
- `dist/manifest.json` references the existing `background.js`; the file exists
  and is an exact JavaScript copy. No uncompiled TypeScript is referenced by the
  manifest. Built permissions are exactly storage, activeTab, and scripting.
- `tests/fontInspection.browser.mjs` executes the **bundled** serialized function
  standalone in a real local fixture document, skips form/editable candidates,
  and checks computed properties displayed by React. It checks failure states,
  280–800px widths, and natural document scrolling. Browser grants, messaging,
  and scripting transport are mocked; test-only eval is used to emulate Chrome
  function serialization, never by application code.
- Existing history, palette creation/management, and export browser suites pass.

Browser scripts use the isolated Chrome debugging-port/production-preview setup
already documented in the README. They do not establish native Opera GX activeTab
compatibility. The actual toolbar grant, worker/page communication, and native
injection permission must be verified manually below.

## Exact Opera GX manual verification

1. Run `npm run build`. Reload the unpacked `dist` extension in Opera GX's
   extension manager so the added permissions take effect. Close any old
   inspector window and inspect the service-worker console for load errors.
2. Open **https://example.com/** in a normal tab. Wait for loading to finish and
   click Design Inspector's toolbar icon on that tab. Its movable window should
   open/focus exactly as before.
3. In the inspector, choose **Fonts**, then **Test font inspection**. Verify a
   source-host success message and all five properties. In the webpage DevTools,
   compare `getComputedStyle(document.querySelector('h1'))` for those properties.
   The ordinary Inspect a font / Coming soon action remains disabled intentionally.
4. Focus another webpage/tab without clicking its toolbar icon, return to the
   inspector and test again: it must still inspect example.com, not the currently
   focused tab or the inspector. Click the icon on the new webpage and test: its
   source/results should now be used.
5. Repeat step 4 from a webpage in another Opera GX window. Only the explicitly
   toolbar-selected tab should be inspected. Move that tab to a different window;
   retrying should require a fresh toolbar click.
6. Reload/navigate the target, including a cross-origin navigation. Before a new
   toolbar click, testing must show a missing/changed/expired-target error. Once
   loading finishes, click the icon there and test successfully again.
7. Close the target tab, then test from the still-open inspector: expect an error,
   with no automatic switch to another tab. Reopen/choose a webpage and click its
   toolbar icon to recover.
8. Try from Opera/browser settings, an extension page, or a protected browser
   store. Expect useful restricted/permission feedback, never unrelated results.
9. Close worker DevTools and let the service worker idle, or stop it with browser
   service-worker tools. Retry against an unchanged eligible target: session
   targeting should survive worker restart. Browser restart clears session
   metadata; a fresh toolbar click reacquires the target and activeTab grant.
10. Keyboard through the Fonts tab and test control. Rapid requests should not
    overlap. Resize narrow/short windows; confirm visible focus, wrapping, and
    normal scrolling. Smoke-test EyeDropper, history, palettes and exports.

Record the Opera GX/Chromium version and OS if any native step fails. Do not add
host permissions as a workaround before identifying the actual failure.

## Phase 7.2 boundary

Next work can build an explicit element-selection lifecycle on the proven target
and validated result boundary. Hover/click selection, cleanup/cancellation,
iframe/shadow-root policy, and a full inspector UI need separate design and tests.
This phase deliberately does not implement them or persist font inspection data.

# Phase 7.2 — interactive element selection

## Architecture and UI

Inspect a font is now functional. It resolves the same toolbar-captured tab via
Phase 7.1 worker messaging and validates it before injecting the fixed
`startPageSelection` function into isolated main frame 0. No target guessing,
router, injected React, persistent content-script registration, new permissions,
remote code, or dependencies are introduced. Target navigation invalidation and
session metadata remain the existing worker's responsibility.

The UI shows starting/active states and Cancel. Once injection is acknowledged,
it attempts to activate the captured tab and focus its original browser window.
If focusing fails, it asks the user to focus that webpage manually. The previous
non-interactive test is retained in a closed, explicitly labeled Development
prototype disclosure; it no longer competes with the normal inspection action.
Results remain a simple list of the same five validated computed properties.
There is no final results dashboard or saved font data.

## Temporary page controller

`pageSelection.ts` is self-contained so Chrome can serialize its bundled function.
It owns exactly one isolated-world controller for this document. Re-injection
stops the previous controller before creating listeners/overlay. The only page
DOM addition is an aria-hidden, pointer-events-none fixed host with a closed
shadow root. Its transparent outline has a dark border and white halo, does not
cover text or change layout, and is removed at session end. Frame-by-frame bounds
updates keep it aligned through scrolling, resizing, and ordinary layout shifts.

Pointer movement finds the nearest meaningful element with visible direct text
layout, examining at most six ancestors and 200 direct child nodes per candidate.
Text-node Range rectangles are checked without reading text values. Forms,
inputs/passwords/textareas/selects/buttons, editable ancestors, common sensitive
ARIA controls, hidden/aria-hidden content, SVG/canvas/video and iframe elements
are excluded. The controller does not capture strings, HTML, selections, user
input, IDs, classes, or text snippets. Links may be inspected; capture-phase
pointer/mouse/click handling prevents the selected text's ordinary action.

A selection sends only the five style properties plus session ID, status and the
original page URL used for matching. Escape cancels. No page styling is rewritten
and no font properties enter extension storage.

## Messaging and stale-session guards

The worker's existing target request remains the authorization/target boundary.
Completion uses Chrome runtime messaging directly from the temporary isolated
controller to the extension window. The worker can suspend without losing a result
relay because it does not own the active selection or need to hold a Promise open.
The window validates extension ID, sender tab ID, top frame, sender URL, payload
URL, session ID, status and the existing font-result validator. It rechecks the
worker target generation and tab before accepting a selected result. Messages
from a webpage, another tab/frame/session, or an older operation cannot replace
the current result. No `window.postMessage` channel is used.

The inspector sends scoped `tabs.sendMessage` heartbeat/cancel commands to main
frame 0. The controller accepts only this extension's index page and its own
session ID. Clicking a webpage selection first removes its UI/listeners, then
sends completion. Heartbeat failures from that completed controller do not race
and erase a result while validation is pending.

## Cancellation and cleanup

- Escape and inspector Cancel end the session.
- Tab switches or navigation away from the inspector component cancel it.
- Window `pagehide` makes a best-effort cancel request on inspector close.
- A missing heartbeat for five seconds makes the page controller self-clean on
  its next watchdog tick; closing the inspector cannot leave it active forever.
- Target pagehide cancels; navigation/closure destroys that document and the
  inspector detects a missing/changed target on its next heartbeat.
- Controller errors remove listeners/outline. Cleanup also tolerates an unloaded
  extension runtime. Starting/cancelling overlapping requests uses generation
  guards; a late injection acknowledgment is cancelled instead of reactivating UI.
- Ending removes all temporary page listeners, runtime listener, animation frame,
  watchdog, overlay host, candidate reference and isolated-world global controller.

Heartbeats run every second only while a session is active. Worker target checks
may wake/reset the MV3 worker idle timer as ordinary extension API activity; no
service-worker timer, port keepalive, or persistent font session is required.
Lease expiry is a safety mechanism, not an exact wall-clock guarantee: browser
freezing/throttling can delay timers. A resumed page cleans up when its watchdog
runs. Minimized/throttled inspector windows can therefore cancel an otherwise
active selection. A live session is not resumed automatically after closing the
inspector; the user explicitly starts another one.

## Automated verification

- Build and lint pass without warnings; the manifest/permissions are unchanged:
  storage, activeTab, scripting; no host permissions or persistent content scripts.
- All 66 unit/repository tests pass, including the existing Phase 7.1 target tests
  and new activation/session validation, restricted/closed/permission failures,
  forged/stale-session rejection and cancellation-before-injection tests.
- All six browser suites pass. `fontSelection.browser.mjs` runs the real bundled
  controller in fixture DOM and checks hover candidate filtering, outline
  scroll/resize alignment, attempted tab/window focus, click suppression on
  links, exactly five style properties, selection cleanup, rapid/repeated starts,
  stale completion rejection, forged cancellation rejection, Escape, UI Cancel,
  cancellation during startup, component unmount, pagehide, retarget/closed-tab
  detection, hover errors, permission failure, heartbeat lease expiry, and
  280–800px layouts.
- The prior deterministic font, history, palette creation/management and CSS/JSON
  export browser suites pass. No existing saved schemas or color feature logic
  changed.

Native Chrome grants, runtime transport and window focus are mocked in the fixture
suites. Event handlers and computed styles run on real DOM, but this is not proof
of native cross-window Opera GX behavior. The test-only serialization/eval harness
is not application code and is not bundled.

## Exact Opera GX manual test

1. Build and reload the unpacked extension; close the old inspector window. Open
   a normal HTTPS webpage with visible headings/paragraphs and wait for loading.
2. Click Design Inspector's toolbar icon on that page. In its independent window,
   choose Fonts, then Inspect a font. Confirm active feedback and that the
   original page/tab/window is focused, or follow the manual-focus guidance.
3. Hover headings, paragraphs, inline text and links. Confirm a thin transparent
   outline follows the candidate, does not block text, and remains aligned while
   scrolling/resizing. Inputs, password fields, editable text and forms should
   not be candidates; do not enter any real sensitive test data.
4. Click a heading/paragraph. The outline should disappear immediately and the
   inspector should display fontFamily, fontSize, fontWeight, lineHeight and
   letterSpacing. Compare against that element's DevTools computed styles.
   Click a link in a new inspection: it should be selected without navigating.
5. Activate again and press Escape on the target page. Confirm cancellation in
   the inspector and no leftover outline. Start again to verify recovery.
6. Activate again, focus the inspector window, and click Cancel font inspection.
   Confirm immediate cleanup in the webpage and that another activation works.
7. During selection, navigate/reload or close the target. Confirm no remaining UI
   and actionable cancellation/error feedback. Click the toolbar icon again on
   an eligible loaded page to reacquire access. Repeat from another browser
   window; switching unrelated tabs must never silently retarget the session.
8. Activate, then close the inspector. The outline should disappear after the
   best-effort cancellation or roughly the five-second lease plus timer cadence.
   Reopen via the toolbar and repeat multiple sessions. After each completion,
   `document.querySelectorAll('[data-design-inspector-font]').length` in webpage
   DevTools should be zero.
9. Let the worker suspend (with its DevTools closed), then start/select/cancel
   again. Try protected browser/store pages and revoked access: expect helpful
   failure, not injection into another tab. Record browser/OS-specific failures.
10. Verify narrow/short inspector windows, keyboard tabs/focus, and the existing
    EyeDropper, history, saved palettes, management, and exports.

## Limits and Phase 7.3 recommendations

Selection is main-frame DOM only; cross-origin iframes and shadow-root traversal
are intentionally unsupported. Captured values describe computed CSS, not proof
of the rendered font face. Very large direct-child lists are bounded as above.
A page's earlier window-capture listeners, browser-reserved interactions, pointer
capture, and hostile DOM behavior cannot be universally overridden; verify real
sites before claiming complete click interception. No persistent page changes
remain after normal completion; page freeze can delay watchdog-based cleanup.

Phase 7.3 can refine the minimal results presentation, keyboard/element traversal
and focus-return experience, and define an explicit iframe/shadow-root policy.
Do not broaden host permissions or add saved font history as an incidental fix.

## Phase 7.2.1 — activation diagnostics and reliability

Activation runs through the inspector result listener → background target request
→ captured tab/window/URL validation → isolated-world `executeScript` → controller
initialization acknowledgment → validated heartbeat → best-effort target focus.
Results are still checked against the session ID, originating main frame, extension
sender, original URL, and current target generation. Focus failure does not undo a
successfully active selector; the UI asks the user to focus the webpage manually.

Confirmed defects addressed:

- The hook replaced all activation exceptions with one permission-like message.
  Actual injection, transport, initialization and target errors were hidden.
- Background navigation/close invalidation removed the captured record, losing
  the reason. Session-only records now retain an invalidation code; clicking the
  toolbar replaces the record. No saved history/palette schema changed.
- Controller setup before listener installation was outside the initialization
  guard. Setup now returns a sanitized stage and rolls back partial installation.
- Missing/malformed acknowledgments could leave a controller installed until its
  lease expired. Activation failure now cancels the session immediately, and its
  cleanup cancellation cannot replace the original initialization error.

Error messages are centrally defined in `src/font/errors.ts`: no captured target,
closed tab, same-origin navigation, cross-origin navigation, loading, moved tab,
unavailable URL, restricted page, browser-reported missing permission, injection
failure, initialization failure (with safe step), lost controller, background
transport failure, unavailable API, and unexpected internal error. These messages
contain no target URLs or page content. Development builds log error code, stage
and a URL-redacted browser diagnostic; production builds omit these logs.
Only explicit browser permission error wording is classified as a permission
failure. An unavailable tab URL or arbitrary injection rejection is not evidence
of permission expiration.

The existing strict navigation policy is retained: even same-origin reloads or
SPA URL changes require clicking the toolbar again after loading. Chrome may
retain activeTab across same-origin navigation, but this app deliberately retains
an exact originating document/URL session. Cross-origin navigation can revoke the
temporary browser grant. No active-tab query or fallback silently selects another
page. No permissions were added.

Ordinary site CSP is not assumed to block isolated-world extension injection.
See Chrome's [content script execution-world documentation](https://developer.chrome.com/docs/extensions/develop/concepts/content-scripts)
and [activeTab lifecycle](https://developer.chrome.com/docs/extensions/develop/concepts/activeTab).
A native Chrome audit successfully activated on example.com and local HTML,
strict-CSP/Trusted-Types, and XHTML documents. This does not prove Opera behavior
on every site or identify the user's unprovided failing domains. The public MDN,
React and Wikipedia run was incomplete and is not reported as passing.

### Automated verification

- `node --test tests/*.test.mjs`: 10 files, 72 test cases. Includes target and
  permission classification, transport failures, navigation, initialization and
  acknowledgment failures, cleanup ordering and retries.
- The six existing `*.browser.mjs` suites (excluding the new native suite) cover
  bundled real-DOM selection, partial setup failures, missing acknowledgment,
  retry, result validation, cancellation, heartbeat cleanup, and existing color,
  history, palette and export behavior. Native extension APIs are mocked there.
- `node tests/fontActivation.native.browser.mjs` uses a **fresh isolated** Chrome
  profile on port 9223 with `--enable-unsafe-extension-debugging`, plus the built
  `dist` directory. It uses native MV3 toolbar grants, service worker, storage,
  injection and messaging on HTML, strict CSP/Trusted Types and XHTML fixtures,
  plus same-origin navigation and toolbar recapture. An already loaded unpacked
  extension must be reloaded or tested in a new profile after rebuilding.
- `npm run build` and `npm run lint` are required. There is no npm test script;
  use the Node test command above.

### Opera GX activation matrix (manual, still required)

1. Build, reload the unpacked extension at `opera://extensions`, and close any old
   inspector window. Test each of: https://example.com,
   https://developer.mozilla.org/en-US/docs/Web/CSS/font-family,
   https://react.dev/learn, and https://en.wikipedia.org/wiki/Typography.
2. Wait for each page to finish loading. Click its Design Inspector toolbar icon;
   choose Fonts → Inspect a font. Confirm active status and original page focus.
   Hover and click headings, paragraphs and nested inline text. Compare the five
   returned properties with the selected element's computed styles. React/DOM
   updates should not prevent activation. Escape and UI Cancel must clean up.
3. Retry immediately after each cancellation and selection. Verify no residual
   `[data-design-inspector-font]` elements. Switch to Colors and back during
   selection; cancellation and existing color features must still work.
4. After capturing a page, navigate to another path on the same origin or reload.
   Start inspection before clicking the toolbar again: expect navigation guidance.
   Click the toolbar on the loaded destination; inspection must work again.
5. Repeat across origins (for example example.com → react.dev). Expect cross-origin
   guidance if the browser exposes the destination, otherwise navigation guidance;
   no claim of permission expiry without an explicit API rejection. Re-click the
   toolbar to reacquire access. Close the captured tab and expect closed-tab feedback.
6. Use two ordinary browser windows and multiple tabs. Capture A, focus B, then
   Inspect: only A may be targeted. Click the toolbar on B and repeat: B becomes
   the target. Moving the captured tab to another window requires recapture.
7. Try `opera://settings` and an extension page: expect restricted-page feedback,
   never injection into an unrelated webpage. Revoke extension access where Opera
   supports it; record the browser's actual error and verify retry after regrant.
8. Test worker suspension with worker DevTools closed, short/narrow inspector
   windows, and repeated activation. If a normal site still fails, record browser
   version, safe public reproduction steps, UI error and development code/stage.
   Do not include private URLs or page content in reports.

Remaining boundaries: main-frame only, no iframe/shadow-root traversal, computed
CSS rather than rendered-font identification. Browser/page freezes or background
window timer throttling can delay heartbeat/lease cleanup. No specific failing
user website was supplied, so site-specific resolution still needs Opera testing.

## Phase 7.3 — typography preview

The Fonts tab now leads with “find your font.” and Inspect a font. The normal UI
no longer mounts the development prototype. Empty/active states use a restrained
specimen; selected results show Aa Bb Cc and a pangram above native, keyboard
operable Font details. Original computed values remain unchanged in details.
Existing selection, errors, navigation guidance, permissions and color data flows
are unchanged. No animation is added, including for reduced-motion users.

Preview styling is presentation only: specimen size is bounded to 40–64px,
sentence size to 16–24px, line-height ratio to 1.2–1.8, and spacing to 0–3px.
Words may wrap anywhere in narrow windows. Negative spacing is neutralized to
avoid overlapping letters. These bounds intentionally prevent pixel-perfect
reproduction of extreme source typography.

### Font availability decision

A webpage's FontFaceSet and @font-face definitions are scoped to its document;
computed font-family only supplies a requested stack. The extension tries that
stack using local/bundled fonts, via React's individual style properties, without
copying CSS rules or fetching page fonts. FontFaceSet.check() is not proof of
actual face identity: a nonexistent family can return true when no matching
unloaded font faces exist. See MDN's FontFaceSet.check documentation:
https://developer.mozilla.org/en-US/docs/Web/API/FontFaceSet/check

Therefore every selected specimen says “Preview may use a fallback font.” Even
installed fonts do not prove the webpage used the same face, subset or version.
No arbitrary font requests, CSS injection, CORS/CSP workarounds, new permissions,
font persistence or export are added. Next phase could investigate explicit,
user-controlled local font selection and stronger rendered-face evidence before
making availability claims.

### Phase 7.3 Opera GX checks (manual)

1. Build and reload dist at opera://extensions; close the old inspector window.
2. On a loaded webpage, click the toolbar icon, choose Fonts, inspect and select
   text. Check the large specimen, pangram and subtle fallback notice. Compare
   all five expanded detail values to DevTools computed styles.
3. Repeat with a webfont unavailable locally, a long font stack, tiny/huge sizes,
   zero/large line heights and negative/large letter spacing. Details must retain
   exact values while the specimen stays readable and wraps.
4. Tab to Font details, press Enter/Space to toggle; verify visible focus. Resize
   through 280, 380 and 800px widths and short heights; scroll to all content.
5. Test active feedback, Escape, UI Cancel, retry, closed/navigated/restricted
   targets and toolbar recapture. Enable reduced motion and repeat.
6. Smoke-test Colors, history, saved palettes, and CSS/JSON exports.

Automated preview checks are in fontPreview.test.mjs and the updated
fontInspection.browser.mjs; the real DOM/controller flow remains covered by
fontSelection.browser.mjs, with native activation in fontActivation.native.browser.mjs.
Native Opera GX verification remains manual.

Phase 7.3 verification completed: npm run build; npm run lint (no warnings);
node --test tests/*.test.mjs (11 files passed); all six UI browser suites passed
(fontInspection, fontSelection, historyView, savedPalettes, paletteManagement,
paletteExport); native MV3 activation suite passed for HTML, strict CSP/Trusted
Types, XHTML, same-origin navigation diagnosis and toolbar recapture. Browser
checks used isolated headless Chrome profiles; they do not replace Opera GX.

## Phase 7.4A — typography metadata accuracy

Both extractors now capture font style, stretch, variation settings, feature
settings, and optical sizing alongside the original five computed properties.
These remain CSS metadata, not evidence of the face that rendered any glyph.
The existing isolated-world injection, sender/session validation, target checks,
and selection cleanup are unchanged. No permissions or dependencies were added.

New fields are optional for compatibility with five-property results. Missing or
empty computed fields display as “Unavailable”; present values must satisfy
bounded property-specific grammars (512 characters, no control characters).
Validation does not evaluate CSS, load fonts, or query font availability.
The details preserve accepted computed strings, use “CSS font family”, and retain
the existing wrapping layout.

The approximate preview applies validated style and stretch through individual
React style properties; unsupported browser values are ignored by CSS.
Variation and feature settings remain metadata because the inspector may use a
different face. Optical sizing is explicitly disabled because preview sizes are
normalized. Existing size/line-height/spacing bounds and the fallback warning
remain. No page text, font URLs, or font files are collected.

Verification: build, lint, 79 unit tests, all six existing browser UI suites, and
native Chrome MV3 activation/selection/cancellation tests pass. Coverage includes
legacy and unavailable fields, malformed/long values, extended message transport,
non-default computed properties, strict CSP/XHTML, and 280–800px wrapping.
Opera GX still requires a manual reload of dist and comparison of all ten detail
values against getComputedStyle on normal, italic, condensed, and variable-font
text. Check narrow resizing, cancellation/Escape, navigation/retry, and the
persistent fallback notice. These tests do not prove actual rendered-face identity.
