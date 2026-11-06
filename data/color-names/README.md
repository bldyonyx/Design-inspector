# Offline color-name catalog v2

Catalog v2 contains **849 entries**: **781 xkcd survey entries** plus **68 retained
project-defined anchors**. This is approximately the requested 850-entry lower
bound; no weak labels were restored merely to reach a round count. Names are
approximate descriptive anchors, not official names for arbitrary RGB values.

## Sources and licenses

- Authoritative survey: https://xkcd.com/color/rgb.txt
- Survey background: https://xkcd.com/color/rgb/
- Retrieved: **2026-11-06**. The source has no version tag; this retrieval and hash
  pin the snapshot. It contains 949 data rows and a license header.
- Source SHA-256:
  `450cca88fa6fa9a1e79c969969e05e6900b41a94f0a3a5f134e3d0b79077f890`
- Survey license: **CC0 1.0**, explicitly linked in the original file header:
  https://creativecommons.org/publicdomain/zero/1.0/
- `xkcd-rgb.txt` preserves the authoritative file, including excluded wording,
  strictly as a development/provenance artifact. It is not imported by the app.
- `project-anchors.json` preserves the original 68 name/HEX pairs from this
  repository's pre-expansion `src/data/colorNames.ts`. They are existing
  project-created naming anchors, **not xkcd data**. Retaining them keeps useful
  conventional/basic names and exact anchors, including Sage, Steel Blue,
  Lavender, Dusty Plum, neutral grays, and standard primaries. Their licensing
  remains the project's existing terms; this change does not relicense them as
  CC0. No separate project-anchor license was declared in the original source.
- No meodai data, packages, or other supplementary third-party data are used.

## Reproducible curation

Run `node scripts/curateColorNames.mjs` offline. It reads the pinned local source
and original anchors and generates `src/data/colorNames.ts` and `curation.json`.
There are no downloads or network calls in the generator or runtime lookup.

Rules, in order:

1. Retain the project's existing anchors first, in original order.
2. Exclude profanity, bodily-waste terminology, derogatory/judgmental labels, and
   other unsuitable wording using the explicit generator pattern.
3. Apply the explicit omission list for misspellings, redundant concatenated
   variants, vague labels, and selected branded/pop-culture labels. Examples:
   liliac/perrywinkle, darkblue, blue blue, and barney purple. Prefer established
   descriptive alternatives already present in the source.
4. Normalize gray spelling, slash-separated words, whitespace, title casing, and
   uppercase HEX. Source HEX values are never invented or changed.
5. Exclude duplicate normalized names or HEX values. Existing project anchors
   win conflicts, then the first accepted survey row wins. Distinct useful tonal
   qualifiers remain; there is no blanket distance-based pruning that could
   erase subtle muted/light/dark coverage.

Of 949 source rows, 781 are included and 168 omitted. `curation.json` records the
original name, HEX, output name when included, and omission reason for every row.
The exact rules and lists are version-controlled in the generator. Validate all
changes with representative regressions and review the curation diff before any
future source refresh. The runtime imports only the compact generated catalog.

## Matching and integration

The baseline remains sRGB linearization followed by OKLab Euclidean nearest
neighbor. Candidate coordinates are precomputed once. `closestColorName` retains
its public input/result signature and exact-match flag. A small lookup factory
makes stable first-in-catalog ties testable without altering production weights.

Inspector summaries and semantic CSS exports use the same lookup. A catalog
update can change approximate names and therefore future exported CSS property
names. Saved HEX values, palette/history schemas, order, timestamps, JSON export,
and filenames do not change. All original anchors still match exactly.

## Required before/after comparison

| Input | Catalog v1 | Catalog v2 |
|---|---|---|
| #B9C89B | Sand | Pale Olive |
| #A4B494 | Sage | Sage |
| #808000 | Olive | Olive |
| #D4BE98 | Sand | Sand |
| #E8D8CB | Warm Linen | Warm Linen |
| #6A4D5B | Dusty Plum | Dusty Plum |
| #624955 | Dusty Plum | Dusty Plum |
| #808080 | Gray | Gray |
| #818181 | Gray | Gray |
| #4682B4 | Steel Blue | Steel Blue |
| #64748B | Slate Gray | Slate Gray |
| #008080 | Teal | Teal |
| #C4B5E8 | Lavender | Lavender |
| #000000 | Black | Black |
| #FFFFFF | White | White |

No significant cross-family failure remains in the required samples. Additional
review found subjective edge cases: exact neutral #B0B0B0 receives **Pinkish Gray**,
and warm beige #DCD0C0 receives **Light Gray**. These are naming limitations rather
than changes to the sampled/exported colors.

A diagnostic soft hue-aware reranking experiment added
`2 * min(C1,C2)^2 * (1 - cos(h1-h2))` to squared OKLab distance only when both
chromas exceeded 0.03. This illustrative heuristic changed none of the 15 required
results or the two questionable samples. In particular, hue weighting does not
help an essentially achromatic input. There was no demonstrated improvement, so
**no hue penalty or neutral special case is shipped**. Future refinements need a
larger reviewed acceptance set rather than arbitrary weights or fabricated names.

## Measurements and verification

Measured on this development host with Node 24; timings are illustrative, not a
browser/device guarantee. `node scripts/benchmarkColorNames.mjs` uses 4,096 seeded
samples, 5,000 warmups, and the median of five 20,000-lookup rounds. Both catalog
sizes use the same lookup implementation.

| Measurement | v1 | v2 |
|---|---:|---:|
| Entries | 68 | 849 |
| Compact serialized name/HEX bytes | 2,354 | 32,607 |
| Production JS bytes | 267,499 | 294,751 |
| Production JS gzip bytes | 81,006 | 89,665 |
| Median lookup | 0.93 microseconds | 4.01 microseconds |
| Coordinate initialization | 0.07 ms | 0.83 ms |

Production impact: **+27,252 raw bytes / +8,659 gzip bytes**. Source snapshots,
curation manifests, and benchmark/generator scripts are not part of that bundle.
No library, runtime API, dependency, or permission was added.

Build and lint pass. All 54 unit/repository tests pass, including every exact
catalog entry, uppercase/unique HEX and unique names, source hash/provenance,
family-based required regressions, nearby-color stability, invalid inputs, stable
ties, CSS collision handling, export consistency, and existing storage tests.
The browser export suite parses semantic CSS and verifies identical clipboard and
real headless Chrome CSS download bytes, unchanged JSON, no storage writes, and
responsive layout. Native extension behavior in Opera GX remains a manual smoke
test; the browser suite uses mocked clipboard/extension storage on a preview page.
