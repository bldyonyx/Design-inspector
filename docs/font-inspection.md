# Font Inspector Phase 7.1

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
