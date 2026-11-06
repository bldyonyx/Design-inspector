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
