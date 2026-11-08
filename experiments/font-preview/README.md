# Phase 7.4B — page canvas specimen experiment

This retains the isolated Phase 7.4B comparison harness. Phase 7.4C now uses the
same renderer and transport in production, behind an explicit user action.
Shared implementation lives in `src/font/renderSpecimen.ts`,
`src/font/specimenSession.ts`, and `src/components/PageFontSpecimen.tsx`.
The separate harness remains in `src/experiments/font-preview/`; it is not
included in the normal build. Selection-result messages, background messaging,
permissions, and CSP are unchanged.

## Build and compare

```sh
npm run build
node node_modules/vite/bin/vite.js build --config experiments/font-preview/vite.config.ts
```

The second command creates a separate unpacked extension at
`/tmp/design-inspector-font-preview`. For another OS/location, supply an absolute
`--outDir` path. The experiment config copies the existing public manifest and
worker and emits its harness as `index.html`, preserving the worker's exact
inspector-page sender check. Do not publish this build.

In Opera GX:

1. Temporarily disable the production extension to avoid confusing toolbar icons.
   Load the experiment output using **Load unpacked** at `opera://extensions`.
2. On the desired HTTP(S) webpage, click its extension toolbar icon. In the
   experiment window, choose **Select typography**, then click eligible live text.
3. Choose **Render comparison**. Compare the unchanged extension DOM preview,
   the experimental page canvas, and the extension canvas control. The two
   canvases use identical drawing code, making document-font differences easier
   to separate from DOM-versus-canvas differences.
4. Test system fonts, a page-only web font, missing families, fallback stacks,
   italic/bold, and variable weights. Compare DevTools rendered-font evidence
   separately; the experiment does not identify rendered faces.
5. With DevTools Network open, disable cache and test unicode-range fonts where
   the selected text uses fewer characters than the specimen. Watch for new
   font-subset requests when drawing. Repeat after loading completes.
6. Cancel while rendering, start a new selection, navigate/reload the target,
   retarget via another toolbar icon, and close the experiment window. No late
   raster should repopulate a cancelled/replaced operation. No canvas should
   appear in the inspected DOM. Check narrow resizing and long-family values.
7. Remove the experimental extension and re-enable production when finished.

## Architecture and protocol

The harness reuses the existing selection hook and ten-property validator.
It captures a toolbar target before selection and verifies that same target
generation before and after rendering. A fresh request ID and AbortController
belong to each render. Cancellation, replacement, pagehide, and unmount invalidate
the operation. The page function is synchronous and bounded; cancellation drops
its return rather than interrupting a running canvas draw.

`requestSpecimen` injects the packaged, self-contained `renderSpecimen` function
into isolated main frame 0 using the existing activeTab/scripting grant. The
result returns through the scripting Promise, not production selection messages
or a new runtime/postMessage listener. No worker relay or persistent page
controller is added. Results from other frames, URLs, request IDs, or target
generations are rejected.

The page creates one detached XHTML canvas and draws only:

- `Aa Bb Cc`
- `The quick brown fox jumps over the lazy dog.`

The bitmap is always 480 × 144 at 1× resolution, white with dark text. Family,
weight, and style use the selected metadata. Specimen sizes are bounded to
40–64px and 16–24px; spacing to 0–3px. Supported canvas stretch keywords are used,
including exact standard percentage equivalents; other percentages are not
approximated. Letter spacing is feature-detected. If canvas rejects angled oblique
syntax, it tries plain oblique while retaining the requested family/weight/size.
Text clips at bitmap edges rather than being horizontally scaled. Baselines are fixed, so source line
height is not reproduced. Variation/features/optical sizing are not explicitly
controlled by this canvas prototype; canvas defaults can differ from the DOM
preview. It is not a full CSS renderer.

Only raw RGBA8 pixels and a small protocol envelope return. There is no image
URL, PNG/JPEG decoder, selected text, font URL, or font resource in the payload.
The bitmap is 276,480 bytes, encoded as exactly 368,640 base64 characters.
Validation enforces the protocol, exact field count/types, fixed dimensions and
format, base64 alphabet/length, request ID, and expected URL. URLs are capped at
8,192 characters. Errors have a fixed allowlist and cannot carry raster data.
The receiver paints validated bytes using ImageData. Raster state is memory-only,
cleared on cancel/replacement/unmount; canvas backing stores are released.
No raster content is logged or persisted.

## Chromium results

Native tests ran on Chrome 156.0.8078.73 with real MV3 action grants, worker
targeting, selection messages, and isolated-world scripting. No extension API
was mocked in the native suite. Local HTTP fixtures serve existing repository
font assets; an optional existing Ubuntu Sans Mono variable font supplies the
variable test. No external network or new font download is needed by the tests.

| Fixture | Page canvas versus extension canvas | Additional font requests during first render |
| --- | --- | --- |
| System serif | Identical pixels | 0 |
| Missing family followed by serif | Identical pixels | 0 |
| Page-only custom web font | Different pixels | 0, already loaded |
| Missing family followed by page web font | Different pixels | 0, already loaded |
| Italic/bold page face | Different pixels | 0, already loaded |
| Variable page font | Different pixels; changing weight changes output | 0, already loaded |
| Unicode-range subset font | Different pixels; changes again after subset load | 1 |

The injected isolated-world raster matched the same renderer in the page's main
world for all seven fixtures after relevant fonts loaded. This demonstrates
access to the tested page-loaded faces without MAIN-world injection. It does
not prove which face rendered the originally selected glyphs. No inference uses
`document.fonts.check()`; tests wait for fixture fonts only to establish controlled
conditions. Production experiment code never waits for or explicitly loads fonts.

The native test asserts unchanged element count and selected-element dimensions,
absence of page canvas/selection overlay after completion, and rejection of a
same-turn cancel. Tests compare hashes only; they do not print or save raster data.

## Privacy, limitations, and recommendation

There are no explicit remote requests, font enumeration, font-file access,
cross-origin stylesheet reads, screenshots, new permissions, or remote code.
The renderer reads no page text/input values and attaches no DOM nodes/listeners.
The existing selector still temporarily outlines eligible live text and performs
its established cleanup. Browser CSP/security boundaries remain intact.

**Drawing can cause browser font requests.** The subset fixture initially uses
only `A`. Drawing the fixed sample requests a second unicode-range face for other
letters. The first raster can contain fallback and the next can change after
loading. Cancellation cannot undo a browser request already triggered. Thus this
approach cannot satisfy a strict guarantee of zero network side effects merely
by avoiding fetch(), FontFace.load(), and document.fonts.load(). No workaround is
attempted.

The specimen is more useful for page-only fonts, but is not a screenshot or an
exact reproduction: glyph coverage, language, shaping, variable axes, optical
sizing, line layout, clipping, and raster resolution can differ. It inspects the
existing main-frame selection scope only; iframes, shadow roots, and image-based
font previews remain unsupported. A font pictured on DaFont cannot be recovered
by drawing its container's CSS stack.

Phase 7.4B's recommendation was an opt-in experiment pending Opera GX validation.
That validation is now complete. Phase 7.4C integrates an optional production
specimen with the subset-loading caveat next to its action. The approximate
preview remains the default and fallback. Neither view identifies rendered faces;
this pathway still cannot guarantee zero additional font requests.

## Verification

```sh
npm run build
npm run lint
node --test --test-isolation=none tests/*.test.mjs
node tests/fontSpecimen.native.browser.mjs
node tests/fontSpecimen.native.browser.mjs --production
node tests/fontActivation.native.browser.mjs
```

The native specimen suite needs isolated Chrome at port 9223 with
`--enable-unsafe-extension-debugging`; it loads and uninstalls the separate
experimental build. Override `DESIGN_INSPECTOR_SPECIMEN_DIST` if the build is
elsewhere. With `--production`, it loads `dist` and exercises the production
Fonts tab instead of the harness. It skips the variable fixture if the optional local font is absent.
The six existing browser UI suites still use the production preview at port 4173
and isolated Chrome at 9222, and must run sequentially because they share a page.
CDP is test infrastructure only; the extension has no debugger permission.
