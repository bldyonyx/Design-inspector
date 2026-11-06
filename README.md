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
