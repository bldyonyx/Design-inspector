# React + TypeScript + Vite

This template provides a minimal setup to get React working in Vite with HMR and some Oxlint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the Oxlint configuration

If you are developing a production application, we recommend enabling type-aware lint rules by installing `oxlint-tsgolint` and editing `.oxlintrc.json`:

```json
{
  "$schema": "./node_modules/oxlint/configuration_schema.json",
  "plugins": ["react", "typescript", "oxc"],
  "options": {
    "typeAware": true
  },
  "rules": {
    "react/rules-of-hooks": "error",
    "react/only-export-components": ["warn", { "allowConstantExport": true }]
  }
}
```

See the [Oxlint rules documentation](https://oxc.rs/docs/guide/usage/linter/rules) for the full list of rules and categories.

## Movable extension window experiment

Run `npm run build`, then load (or reload) `dist` as an unpacked extension in
Opera GX's extension manager with Developer mode enabled. The toolbar action
runs `background.js` instead of an anchored action popup. Vite copies this plain
JavaScript service worker from `public`; no second UI or extra build pipeline is
needed. React continues to use the existing `index.html`.

The worker discovers its own `index.html` contexts on each cold start, so an
open inspector survives worker suspension without storing a window ID. A cached
ID bridges page loading, concurrent clicks share one operation, and closed or
stale IDs are ignored. A minimized inspector is restored before focusing.
Failures are logged in the extension service worker console and later clicks
can retry. No permissions or browser storage are used. The context discovery API
requires Chromium 116 or newer, declared in the manifest.

The initial outer window size is 396 × 590px, allowing approximately 380 × 550px
for content. Native frame dimensions and browser minimum window sizes vary by OS
and browser. Resizing uses the existing responsive layout: narrow windows wrap,
short windows scroll, and wider windows expand the single-column interface. Window
position and resized dimensions are not remembered after closing.

### Verification

- `npm run build`
- `npm run lint`
- `node --test tests/background.test.mjs` (mocked Chrome APIs: rapid clicks,
  focus, minimized restore, close/reopen, worker restart, and failure/retry)
- Confirm `dist/manifest.json` references `background.js`, that file exists, and
  there is no `action.default_popup` or permission declaration.

Manual checks in Opera GX:

1. Click the toolbar icon: one independent window opens with the approved UI.
2. Click the icon repeatedly: the existing window gains focus; no duplicate opens.
3. Minimize it, then click the icon: it restores and gains focus.
4. Leave it open, close the service worker DevTools, and let the worker go idle
   (or stop it using browser service-worker tools). Click the icon again: the
   existing window is reused. Keeping worker DevTools open prevents idle suspension.
5. Close the inspector, then click the icon: a new window opens.
6. Move it using its native title bar and resize it. Check initial content width,
   wrapping, scrolling, and empty space on your OS.
7. Interact with another webpage: the inspector stays open.
8. Verify both tabs, arrow keys, Home/End, focus indicators, decorative dots,
   archive empty states, and disabled Coming soon actions.

To revert the experiment, restore `action.default_popup: "index.html"`, remove
`background` and `minimum_chrome_version` from `public/manifest.json`, delete
`public/background.js` and its lifecycle test, then rebuild. The React UI and
Vite configuration do not need changes.

## Color Inspector phase 1 — native EyeDropper experiment

`useEyeDropper` calls `new EyeDropper().open({ signal })` directly from the React
button's click handler, before any awaited work. The independent extension page
hosts the API; the service worker does not perform sampling or change focus.
The [EyeDropper specification](https://wicg.github.io/eyedropper-api/) requires a
secure window context and transient user activation. This architecture can meet
those requirements, but API presence and successful builds do not prove native
screen sampling works in Opera GX or on a particular OS/display server.

No manifest permissions, content scripts, or dependencies were added. The feature
checks availability, disables repeated sampling, treats AbortError as cancellation,
and reports other failures through a polite live region. Unmounting aborts an
active selection. A successful sRGB HEX result is validated and displayed in
uppercase alongside a bordered swatch. Copy HEX writes exactly the displayed
value, announces success only after the promise resolves, and offers manual
selection/copy if access fails. Results live only in React memory; there is no
history or persistence. The archive remains an empty state. Fonts remain disabled.

Automated verification:

- `npm run build` and `npm run lint`.
- `node tests/color.test.mjs`: HEX validation/normalization and clipboard
  exact-value success, rejection, and unavailable API.
- `node tests/background.test.mjs`: existing window lifecycle regression checks.
- Headless Chrome with mocked EyeDropper/clipboard: selection, rapid repeated
  clicks, cancellation, unexpected errors, unsupported API, clipboard success and
  failure, disabled Fonts action, and result overflow at 320/380/500/650/800px.
  These mocks verify application behavior, not native sampling compatibility.

Manual Opera GX compatibility test (required):

1. Build, reload the unpacked `dist` extension, close any old inspector window,
   and open it from the toolbar icon.
2. In Colors, click **Pick a color**. Confirm the native screen sampler opens.
   If the button is disabled with an unsupported-browser message, record the
   Opera GX/Chromium version and OS; this browser does not expose the API here.
3. Move the sampler outside the inspector onto a webpage in the other browser
   window. Select a known color. Confirm the inspector remains open and displays
   the sampled HEX and matching swatch. Repeat on a white area to check the border.
4. Start another pick and press Escape. Confirm a neutral cancellation message,
   the previous result remains, and another pick is possible. Check that moving
   between windows or losing focus does not leave the action stuck; record any
   native rejection or cancellation specific to Opera GX.
5. Click repeatedly while starting a pick: only one sampler should open. Confirm
   sampling works again after both selection and cancellation.
6. Click **Copy HEX** and paste into a text editor. The pasted value must exactly
   match the displayed HEX. If clipboard access is denied or unavailable, expect
   failure feedback and verify the HEX can be selected and copied manually.
7. Resize with a result visible, including a short window: verify no horizontal
   overflow, normal document scrolling, and visible focus indicators. Operate the
   Colors/Fonts tabs with keyboard arrows; Fonts must still show Coming soon.
8. Close/reopen the inspector: the result should be cleared. Sampling must work
   again. This is expected for the memory-only milestone.

Known limitations: EyeDropper availability and cross-window behavior depend on
the browser and OS. Clipboard writes may be denied by browser policy or focus
requirements; no clipboard permission or fallback API is requested. Native
sampling and actual clipboard contents have not been verified in Opera GX by the
automated checks.

## Color Inspector phase 2 — HEX, RGB, HSL

The selected-color details now show three selectable, labeled values. Each row
copies only its formatted value and has an independent two-second check-icon
confirmation, announced through a polite live region. A new selection resets all
confirmations, even if the sampled color is unchanged. Clipboard logic is shared;
failed writes never show a success icon. Timers and pending UI updates are cleaned
up when details unmount. Nothing is saved.

Pure utilities in `src/utils/color.ts` provide `normalizeHex`, `hexToRgb`,
`rgbToHsl`, `formatRgb`, and `formatHsl`. HEX requires exactly six digits and a
leading `#`; invalid input throws. RGB channels must be integers in 0–255.
HSL uses standard sRGB channel min/max conversion, rounds hue and percentages to
whole numbers, assigns hue 0 to grays, and wraps rounded hue into 0–359. Invalid
RGB/HSL inputs throw RangeError. Shared `copyText` replaces the HEX-only helper.
Whole-number HSL is a rounded representation and may not round-trip exactly.

Verification completed: build, lint, four color utility tests (including all
requested reference colors and hue edges), three window lifecycle tests, and
headless Chrome UI checks with mocked native APIs. UI checks covered all three
copy values, independent confirmation icons, two-second reset, resetting on a new
selection of the same color, denied clipboard access, both sampling triggers,
cancellation, disabled Fonts, widths 280/320/380/500/650/800px, and document
scrolling in a 300px-high viewport.

Opera GX manual regression: reload the built extension and reopen the inspector;
sample a webpage using each trigger; copy each format and paste into a text editor;
confirm the row values match, check icons reset after two seconds or a new pick,
and Escape preserves the previous result. Recheck narrow resizing and keyboard
focus for each copy button. Native sampling and real clipboard writes were not
retested by the automated mocks. No permissions, dependencies, or window behavior
changed in phase 2.

## Closest color names

The summary uses a compact offline dataset of **68 original, hand-curated naming
anchors** in `src/data/colorNames.ts`. Familiar descriptive names were assigned to
fixed swatches for this project; the list is not imported from a third-party
color dictionary and is not an official naming standard. Arbitrary sampled colors
receive the closest anchor name, not a dynamically generated name. Even a dataset
match means only that the HEX equals an anchor, not an official universal name.

`src/utils/colorName.ts` linearizes sRGB channels, converts them to OKLab using
[Björn Ottosson's public-domain matrices](https://bottosson.github.io/posts/oklab/),
and minimizes squared Euclidean distance in OKLab. Anchor coordinates are
precomputed once; dataset order breaks ties deterministically. The lookup returns
the name, anchor HEX, and an exact flag that is true only for equal normalized HEX
values. Invalid inputs throw the same validation error as existing conversions.
No runtime network requests, dependencies, storage, or permissions are involved.
Names are approximate and subjective; coverage is limited to the curated list.

Selection success is announced in a visually hidden live region rather than
repeated below the details. Cancellation, unsupported-browser feedback, sampling
errors, clipboard errors, and clipboard success feedback remain available.

`node tests/colorName.test.mjs` checks every exact anchor, approximate matches,
black/white/grays, determinism, invalid inputs, and OKLab reference values.
Existing color and window lifecycle tests also pass. Mocked browser checks cover
the name summary, hidden selection announcement, disclosure keyboard behavior,
copy confirmations, and layouts from 280 to 800px without chevron overlap or
horizontal overflow. Native EyeDropper and real clipboard behavior remain manual
Opera GX checks; their interaction paths were not changed.

## Phase 3 — persistent color history

Color history uses `chrome.storage.local` under
`designInspector.colorHistory.v1`. The value is an array of
`{ hex: "#AABBCC", capturedAt: 1730000000000 }` records; timestamps are Unix
milliseconds. Only normalized uppercase six-digit HEX and capture time are
stored. RGB, HSL, and approximate names remain derived values. The manifest adds
only the `storage` permission, as required by the Chrome storage API.

`src/storage/colorHistory.ts` validates records individually, retains valid
neighbors, deduplicates by HEX using the newest timestamp, sorts newest first,
and caps history at 100 unique colors. Missing history is empty. A corrupt
container or failed read prevents writes instead of replacing unread data.
Partially damaged arrays recover valid records and show a warning. Captures use
serialized read/merge/write operations; failed captures remain in memory and are
retried together with the next capture. Persistence is not reported as successful
when a write fails. A completely corrupt container is preserved rather than
silently overwritten; saving remains unavailable until that data is repaired.

`useColorHistory` loads on opening, exposes loading/error states, and updates the
preview optimistically. Failures show a non-blocking warning. The archive shows
the total count and up to five newest swatches. Choosing a swatch displays its
existing inspector details without capturing, writing, updating timestamps, or
reordering history. Copy actions remain in those details to keep the preview
compact. Fonts retains its empty state. No full history page is provided.

Automated verification:

- `npm run build` and `npm run lint`.
- `node tests/colorHistory.test.mjs`: seven tests covering normalization,
  validation, partial corruption, duplicates, recency, the 100-entry cap,
  serialized captures, persistence across repository recreation, unavailable
  storage, read/write failures, preservation of unread data, and retry recovery.
- Existing `color.test.mjs`, `colorName.test.mjs`, and `background.test.mjs` pass.
- Browser tests with mocked Chrome storage and EyeDropper verify newest-first
  ordering, duplicate movement, selection without writes or reordering, reloading
  saved history, optimistic failed saves and recovery, cancellation exclusion,
  no overflow at 280/320/380/500/650/800px, and natural vertical scrolling.
  The browser mock uses localStorage only as its test backing store; production
  code uses Chrome extension storage exclusively.

Required manual Opera GX checks:

1. Build, reload the unpacked extension to activate its storage permission, and
   close/reopen the inspector. Pick several real colors and verify the count and
   five-swatch preview update.
2. Sample an earlier color again: it moves to the front without increasing count.
3. Select an older archive swatch: its details appear, but count/order stay fixed.
   Copy HEX/RGB/HSL from the details and verify pasted values and confirmations.
4. Close and reopen the inspector, then restart Opera GX and reopen it: stored
   colors remain. Escape cancellation must not create entries.
5. Inspect the extension's Local storage in DevTools: only the versioned history
   key and HEX/timestamp records should be written by this feature.
6. Resize narrow/short windows and keyboard through history swatches and inspector
   controls. Check visible focus and normal page scrolling.

Limitations: the preview exposes only five of up to 100 stored colors. Storage
failures leave recent captures memory-only until a later capture retries saving;
closing before an outstanding write finishes may lose that capture. Serialization
covers this application's single inspector window, not concurrent writes from
unrelated extension contexts or manual DevTools edits. Native storage durability
across actual Opera GX shutdown is a manual check, not proved by browser mocks.

## Phase 4 — full color history management

The compact preview still shows five swatches and the total count. **View all**
opens the single-column `ColorHistoryView` inside the same React app. **Back to
inspector** restores the selected tab/color and returns focus to View all (or the
selected tab if history is now empty). Entering history focuses its heading.
The full list uses natural document scrolling and shows every stored color with
Copy HEX and Delete controls. Copy success uses a two-second check icon plus a
live announcement; failed clipboard writes do not show confirmation.

Deletion updates the UI after storage confirms success. The most recent deletion
can be undone for five seconds; Undo restores its original capture timestamp and
does not overwrite a more recent capture of the same color. Clear history first
shows an inline confirmation focused on Cancel and requires **Yes, clear history**.
Clear-all has no Undo. Back/cancel never clears history. Empty history shows the
existing dotted empty-state treatment. Deleting/clearing history does not remove
the inspector's currently selected color.

The versioned key, HEX/timestamp schema, 100-entry limit, and existing storage
permission remain unchanged. Repository capture/delete/clear/restore operations
share one serial queue, re-read current storage, and write only the history key.
Failed reads prevent writes. Failed destructive operations leave visible/stored
history intact and announce an error. Failed captures remain retryable; deleting
or clearing one cannot resurrect it through an older optimistic snapshot. The
hook overlays only newer pending captures onto successful operation results.
Management actions are disabled while persistence is pending, with synchronous
guards against repeated clicks. Undo expires or is replaced by a newer deletion;
it is intentionally limited to the currently open history view.

Tests:

- `npm run build`, `npm run lint`
- `node tests/colorHistory.test.mjs` (12 repository cases, including deletion,
  persistence on reload, clear, Undo, mixed concurrent operations, failure safety,
  and preventing resurrection of deleted unsaved captures)
- `node tests/color.test.mjs`, `node tests/colorName.test.mjs`,
  `node tests/background.test.mjs` (12 existing regression tests)
- `node tests/historyView.browser.mjs` (optional integration test; Node 24+, a
  production preview at `http://127.0.0.1:4173`, and isolated Chrome with remote
  debugging on port 9222 required). Build, run `npm run preview -- --host 127.0.0.1`,
  and start a dedicated headless Chrome profile with `--remote-debugging-port=9222`
  before invoking it. This test mocks Chrome storage, clipboard, and EyeDropper;
  its localStorage backing is test-only. It verifies View all/Back, focus,
  selection preservation, copy, deletion/Undo, explicit clear confirmation/cancel,
  write failures, empty state, persisted reload, and 280–800px layouts.

Manual Opera GX regression:

1. Reload the built extension, sample at least six colors, and verify the preview
   remains five swatches. Open View all and check newest-first ordering/count.
2. Copy a HEX and paste it into an editor. Delete one entry; close/reopen the
   inspector to verify persistence. Delete another and Undo within five seconds;
   verify its original order returns. Check Undo disappears after five seconds.
3. Start Clear history and cancel: everything remains. Confirm on the second
   attempt: the list and preview become empty. Close/reopen Opera GX to verify.
4. Navigate back with a selected color and check the selected color/tab remain.
   Keyboard through navigation/actions/confirmation and verify focus visibility.
5. Resize narrow/short windows; check horizontal overflow and normal page scroll.

Native clipboard, EyeDropper, and actual Chrome storage durability across an Opera
GX restart remain manual checks. The repository serializes the intended single
inspector app, not writes from unrelated extension contexts/DevTools. No router,
new dependencies, permissions, windows, or unrelated features were introduced.

## Phase 5.1 — saved palettes foundation

Palettes use the separate `designInspector.savedPalettes.v1` local storage key:

```ts
{ id: string, name: string, colors: string[], createdAt: number, updatedAt: number }[]
```

IDs use `crypto.randomUUID()` with a cryptographically generated UUID v4 fallback.
Names are trimmed, required, and limited to 50 characters. Identical names are
allowed for different IDs. Colors are normalized six-digit uppercase HEX strings
in insertion order, with duplicates prevented within each palette. The same HEX
can belong to multiple palettes. Timestamps are Unix milliseconds. All repository
read/modify/write operations are serialized and read current storage before
writing only the palette key. History operations continue to write only their own
key, so deleting/clearing history leaves palette colors intact.

Validation recovers valid palettes and valid colors within partially malformed
records, with a warning. A malformed root container or failed read prevents
writes; unread existing palettes are never replaced with an empty list. Failed
writes preserve the displayed/stored palette list and report an error. Duplicate
additions return “Already saved” without writing or changing timestamps. Success
feedback appears only after storage resolves. No permissions or dependencies were
added.

Saved Collections lists **all** palettes, each with its name, count, and a compact
strip of up to eight swatches. Opening a palette displays every saved HEX/swatch
in a read-only, naturally scrolling view. Back restores the inspector's selected
color/tab and focuses the palette's preview button. Create palette opens a small
labeled form and can create an empty palette. Add to palette beneath selected
color details opens an inline picker: choose an existing palette or create a new
one with the selected color. Escape/Close returns focus to the trigger. Colors
opened from history use the same flow without capturing or reordering history.

Automated checks:

- `npm run build`, `npm run lint`.
- `node tests/savedPalettes.test.mjs`: 10 new tests for creation, selected-color
  creation, ordered additions, duplicates, cross-palette colors, names/HEX
  validation, reload persistence, malformed records, storage failures, concurrent
  updates, and independence from history deletion/clear.
- All 24 existing utility, history repository, and window lifecycle tests pass.
- `node tests/savedPalettes.browser.mjs`: creation/validation, picker focus and
  Escape, sampled/historical colors, duplicate feedback, same-color membership,
  no history mutations, read-only navigation with selected color/tab restoration,
  failed writes without false success, mock reload persistence, history clear
  independence, long-name layouts at 280–800px, and natural document scrolling.
- Existing `node tests/historyView.browser.mjs` also passes.

Both browser suites require Node 24+, a production preview on port 4173 and an
isolated headless Chrome with remote debugging on port 9222, as described above.
Chrome storage, EyeDropper and clipboard are mocked; test-only localStorage backs
the storage mock. They do not prove actual Opera GX storage durability.

Required manual Opera GX checks:

1. Build and reload the unpacked extension. Create an empty named palette in
   Saved Collections; verify whitespace/empty-name feedback and a long name.
2. Sample a real color, open Add to palette, select the empty palette and add it.
   Repeat to see Already saved. Create a second palette from the picker and
   verify it starts with the selected color.
3. Open a historical color and add it to a palette. Verify history ordering and
   capture timestamps stay unchanged.
4. Open each palette preview and inspect the read-only swatches/HEX values; Back
   should preserve the selected inspector color/tab. Try keyboard navigation,
   Escape from the picker, and narrow/short window resizing.
5. Close/reopen the extension window, then restart Opera GX: palettes should
   persist. Clear history and confirm palette colors remain.

This phase intentionally omits palette renaming/deletion, color removal, exports,
and palette actions in full history rows. There is no multi-context storage lock;
serialization covers the intended single inspector application. Failed palette
operations are not automatically replayed; retry them explicitly. Closing before
an outstanding write completes may lose that operation.

## Phase 5.2 — palette management and collections

The inspector now previews only the **three most recently updated palettes**.
View all collections opens the in-app `CollectionsView`, showing the total count,
case-insensitive name search, every matching palette, and a working Back control.
The main collections page scrolls with the document; it has no nested scroll
panel. Empty collections and empty search results have separate feedback.

Palette details support rename, explicit-confirmation deletion, Copy HEX, and
individual color removal. Rename starts with the existing name, validates using
the existing trimmed 50-character rule, and preserves ID, colors, and createdAt.
Cancel does not write. Unchanged names do not write or update timestamps.
Deletion explains that only the palette and its color associations are removed;
color history is unaffected. A successful deletion returns to collections.
Color removal preserves all other colors and palettes, including an empty palette
when its last color is removed. The latest removal can be undone for five seconds,
restoring the original list position. Undo expires on navigation. Copy and Remove
are sibling controls of the Inspect color button and never navigate themselves.
Inspect color reuses the history selection path, opens Colors with expanded
details, and does not write or reorder history.

The Existing palette picker now has a labeled search field followed by selectable
buttons with previews and a Selected state. Buttons use standard keyboard Tab and
Enter/Space activation. Selecting only chooses a destination; Add color to palette
remains an explicit action. The two Existing/New mode tabs and creation flow are
preserved. Only this picker result list has a bounded 220px vertical scroll area.
Selected destination feedback remains visible when search hides the selected row.

Storage remains `designInspector.savedPalettes.v1` with the same schema. Rename,
delete, color removal, restore, create, and add share the repository's serial
read/modify/write queue. Each operation re-reads the current data, validates it,
and writes only the palette key. No migration, data clearing, permissions, or
dependencies were added. Failed reads never cause writes; failed writes retain
the prior persisted and visible state. A stale Undo cannot recreate a deleted
palette. No-op mutations leave updatedAt unchanged.

Verification:

- Build and lint pass.
- 41 unit/repository tests pass across `savedPalettes.test.mjs`,
  `paletteSearch.test.mjs`, `colorHistory.test.mjs`, `color.test.mjs`,
  `colorName.test.mjs`, and `background.test.mjs`.
- `paletteManagement.browser.mjs` checks 300 palettes, compact preview, full
  collection/search/empty states, bounded searchable picker, keyboard selection,
  explicit add, rename validation/cancel/failures, remove/Undo, copy isolation,
  inspection navigation, confirmed deletion/cancel/failure, reload persistence,
  history independence, 280–800px layouts, and natural scrolling.
- Existing `savedPalettes.browser.mjs` and `historyView.browser.mjs` also pass.
  Browser suites use the isolated Chrome/preview setup described above and mocked
  Chrome storage, EyeDropper, and clipboard; they are not native Opera GX tests.

Manual Opera GX checks after rebuilding and reloading the extension:

1. Open pre-existing palettes; confirm their IDs/colors remain. Create more than
   three and verify the inspector preview stays compact. Browse/search all of
   them through View all collections.
2. Rename and cancel a rename; delete and cancel a deletion. Confirm successful
   changes survive closing/reopening the inspector and restarting Opera GX.
3. Remove a color, Undo within five seconds, and check order. Remove the last
   color and verify the palette remains. Confirm history and another palette
   containing the same color stay untouched.
4. In the picker, search by name, keyboard-select a destination, and explicitly
   add. Check duplicate feedback and Existing/New mode keyboard navigation.
5. Inspect a palette color; verify Colors opens with expanded HEX/RGB/HSL details
   and history order/timestamps do not change. Copy and Remove must not navigate.
6. Check focus after Back, cancelling forms/confirmations, and operations; resize
   from narrow to wide and short windows, verifying document scrolling and the
   picker-only bounded result list.

The intended single inspector app is serialized; unrelated extension contexts or
DevTools writes do not participate in that queue. Native clipboard writes and
actual storage durability across Opera GX restarts remain manual verification.
