# Optional PDF Features Implementation Plan

**Goal:** Let applications exclude table layout, image handling, and TrueType parsing/subsetting/embedding from their browser bundles while preserving the existing MinkPDF API.

**Approach:** Add `minkpdf/core` and explicitly imported feature factories. Keep `minkpdf` as the full-feature compatibility entry point, composed from the same engine and implementations. Publish an ESM module tree so consumer bundlers can see feature boundaries and share engine code.

**Constraints:** Zero runtime package dependencies; preserve supported document definitions and output methods; retain named/default root exports and their shared registration state. Preserve unrelated working changes. Do not create or use a Git worktree unless the user explicitly requests one. Before committing, separate unrelated pending changes into logical commit groups, present each proposed commit, and obtain explicit user confirmation before running `git commit`. Implementation was authorized in the next user message; commits remain separately authorized.

## Reviewed design

```ts
// Built-in Helvetica, without optional feature implementations.
import { createPdf } from 'minkpdf/core';
const document = createPdf({ content: 'Hello' });
await document.getBuffer();
```

```ts
import { createPdfEngine } from 'minkpdf/core';
import { tables } from 'minkpdf/tables';
import { trueTypeFonts } from 'minkpdf/truetype';

const pdf = createPdfEngine({ features: [tables(), trueTypeFonts()] });
pdf.addVirtualFileSystem({ 'Inter-Regular.ttf': fontBytes });
pdf.addFonts({ Inter: { normal: 'Inter-Regular.ttf' } });
await pdf.createPdf({
	defaultStyle: { font: 'Inter' },
	content: { table: { body: [['José', '₱100']] } }
}).getBuffer();
// Image parsing and embedding are absent from this application's bundle.
```

`images()` is imported from `minkpdf/images` when needed. The existing `import pdf from 'minkpdf'` and root named imports continue to enable all features.

Public factory signature: `createPdfEngine(options?: { features?: readonly PdfFeature[] }): PdfEngine`. `PdfFeature` is an opaque built-in feature descriptor, not a promise of a third-party plugin framework. `PdfEngine` preserves `createPdf`, `fonts` get/set, `addFonts`, `addVirtualFileSystem`, and `addTableLayouts`. Resource registration requiring an absent feature throws an actionable error. Features are fixed when an engine is created; registrations remain mutable as today. Duplicate feature IDs are rejected.

Every factory call creates independent dictionaries and font caches. Reusing a descriptor across engines must not share mutable state. Image caches and PDF resource IDs belong to individual render calls. Root named functions and the default object delegate to one full-feature singleton, preserving their current interaction.

Core retains styled text, Helvetica variants, stacks, columns, pagination, margins, page breaks, headers/footers, metadata, watermarks, canvas lines, and existing output methods. Generic line/rectangle drawing and pagination metadata stay shared because multiple features use them. Only table-specific measurement/layout, image-specific measurement/layout/resources, and TrueType parsing/subsetting/PDF objects move out.

Missing capabilities fail when encountered, including inside nested cells, automatic-width columns, headers, and footers. They must never silently drop document content. Unsupported Unicode with Helvetica retains a useful error explaining the embedded-font requirement.

## Inspection and baseline

- `src/index.ts` owns global registration state, imports both font implementations, and returns all output helpers from `createPdf`.
- `src/render.ts` imports images directly and contains the TrueType PDF embedding branch.
- `src/layout.ts` contains both table rendering and table/image intrinsic-width measurement. Moving only its `table` method is insufficient.
- `src/binary.ts` contains both compression directions; PDF writing needs deflate, while PNG handling needs inflate. PNG-only decompression must disappear from core bundles.
- `package.json` currently bundles to `dist/index.js`; there is no `sideEffects` declaration.
- On local Bun 1.4.0, all 12 existing PDF tests passed. A minified browser consumer exposing `createPdf({ content: 'Hello' })` measured 23,976 bytes raw / 9,936 bytes gzip for the named import, and 24,311 / 10,071 for the default import.
- A temporary build confirmed that Bun 1.4.0 supports `--no-bundle` but preserves extensionless relative imports. Source runtime imports must use `.js` specifiers resolving to TypeScript during development and JavaScript after publication.
- Existing pending changes: `README.md`, `package.json`, `LICENSE`, and `docs/`. Do not include these wholesale in an implementation commit.

### Task 1: Establish reproducible behavior and bundle baselines

**Files:**
- Create: `benchmarks/tree-shaking.ts`, `benchmarks/tree-shaking-baseline.json`, `tests/helpers/pdf.ts`, `tests/fixtures/consumers/package.json`.
- Modify: `tests/pdf.unit.test.ts`.
- Keep the committed baseline under `benchmarks/`, outside generated `dist` and the package's published file allowlist; publish final measurements later in Task 7.

**Interfaces:**
- Consumes: existing root API, Bun bundler, existing Inter fixtures, Poppler, Node gzip utilities.
- Produces: reusable PDF inspection helpers and a repeatable size measurement with recorded tool versions and consumer source.

- [ ] Extract existing `withPdf`, `command`, and `readPdf` helpers without changing assertions. Run `bun test tests/pdf.unit.test.ts`; all 12 tests must remain green. This is a behavior-preserving helper extraction, so an artificial failing test is unnecessary.
- [ ] Pin the supported implementation/CI Bun version to 1.4.2, matching the existing `packageManager` field. Pin exact esbuild, Rollup, TypeScript, and required temporary test-tool dependency versions in the consumer fixture manifest before recording baselines. Temporary installs stay outside the engine package.
- [ ] Build the current source before measuring both root import styles using identical observable consumers. Report minified raw and gzip sizes; distinguish engine JavaScript from font assets and generated PDF bytes. The previous local Bun 1.4.0 measurements are preliminary evidence, not CI baselines.
- [ ] Record baseline PDF text, page dimensions/counts, word positions, image resources/transparency, and Unicode extraction for representative definitions. Compare semantics and layout rather than requiring byte-identical compressed PDFs.
- [ ] Define separate script modes for recording and comparing the baseline. Run `bun benchmarks/tree-shaking.ts --record-baseline=benchmarks/tree-shaking-baseline.json` on the chosen pinned version before extraction. The committed report stores the exact consumer definitions and tool settings; comparisons fail on incompatible settings rather than silently replacing the old measurements.
- [ ] Review scope; proposed commit group: test helpers and reproducible baseline tooling. Wait for explicit approval before committing.

### Task 2: Introduce an engine factory and narrow feature contracts

**Files:**
- Create: `src/engine.ts`, `src/feature.ts`, `tests/engine.unit.test.ts`.
- Modify: `src/index.ts`, `src/render.ts`, `src/layout.ts`, `src/font.ts`.

**Interfaces:**
- Consumes: current resource dictionaries, layout/renderer calls, `PdfFont`.
- Produces: isolated `PdfEngine` instances and typed contracts for content measurement/layout, per-render image resources, and font emission.

- [ ] Write failing tests for independent font dictionaries/caches, duplicate descriptor rejection, descriptor reuse across engines, registration merge/replacement semantics, and concurrent documents without image-resource leakage.
- [ ] Move state management into the factory. Keep root named/default exports bound to one full-feature instance; preserve virtual-file cache invalidation when a filename is replaced.
- [ ] Use explicit capability slots for tables, images, and embedded fonts. Core must receive implementations, never import the optional modules or an all-features barrel. Preserve existing node-dispatch precedence.
- [ ] Define a font emission contract accepting the writer, reserved font object ID, and used glyph-to-character map. Expose glyph encoding width independently of the old `subset` presence check. Retain measurement metrics needed by text layout. Export shared `Box`/`Block`/`Draw` types for typed layout callbacks; use type-only imports so contracts cannot introduce runtime feature dependencies.
- [ ] Keep temporary bridges to existing implementations confined to the root composition while extracting features. Remove those bridges by Task 5; they must never become dependencies of core.
- [ ] Run `bun test tests/engine.unit.test.ts tests/pdf.unit.test.ts` and review state lifetime and initialization order.
- [ ] Proposed commit group: engine isolation and contracts. Wait for explicit approval before committing.

### Task 3: Extract complete font and image capabilities

**Files:**
- Create: `src/fonts/standard.ts`, `src/features/true-type.ts`, `src/features/images.ts`, `tests/features.unit.test.ts`, `tests/fixtures/images/tiny.jpg`.
- Modify: `src/font.ts`, `src/image.ts`, `src/engine.ts`, `src/render.ts`, `src/layout.ts`, `src/index.ts`.

**Interfaces:**
- Consumes: font-emission and image-resource contracts, current PNG/JPEG handlers, Inter fixtures.
- Produces: `trueTypeFonts()` and `images()` descriptors; Helvetica-only font implementation in core.

- [ ] Add failing tests for absent capability errors, Unicode with an enabled TrueType feature, font variant selection and replacement invalidation, PNG alpha masks, JPEG embedding, and per-document resource isolation.
- [ ] Move TrueType parsing/subsetting from `src/font.ts` and its embedding branch from `src/render.ts` into the TrueType feature. Keep `src/font.ts` as shared types, not a runtime barrel importing TrueType.
- [ ] Move standard font data and emission into `src/fonts/standard.ts`. The renderer calls each font's emitter without retaining embedded-font PDF object construction.
- [ ] Wrap `src/image.ts` with `images()` and move image layout, intrinsic sizing, XObject preparation, and draw emission behind its hooks. Preserve PNG/JPEG validation and transparency behavior.
- [ ] Ensure only the image feature reaches PNG decompression. Keep shared deflate support for normal PDF streams.
- [ ] Run `bun test tests/features.unit.test.ts tests/engine.unit.test.ts tests/pdf.unit.test.ts`; verify images using `pdfimages` and Unicode using `pdftotext` through the helpers.
- [ ] Proposed commit group: optional fonts and images. Wait for explicit approval before committing.

### Task 4: Extract tables without breaking recursive layout or pagination

**Files:**
- Create: `src/features/tables.ts`, `src/layout-helpers.ts`.
- Test: `tests/features.unit.test.ts`.
- Modify: `src/layout.ts`, `src/engine.ts`, `src/index.ts`, `tests/features.unit.test.ts`.

**Interfaces:**
- Consumes: recursive content and intrinsic-width callbacks, shared box/draw/width helpers, custom table layouts.
- Produces: `tables()` descriptor returning the existing `Box`/`Block` representation.

- [ ] Add failing tests for missing tables in nested containers and headers/footers, custom layouts, automatic widths, column spans, repeated header margins, and tables containing images and Unicode text.
- [ ] Extract both table-specific intrinsic sizing and table layout. Share small helpers through `src/layout-helpers.ts`; do not expose the entire `Layout` instance or import a table implementation from core.
- [ ] Preserve `repeat`, `keep`, `atomic`, margins, and page-break metadata so the existing paginator retains behavior. Keep generic pagination and primitive drawing in core.
- [ ] Preserve nested feature composition through recursive engine callbacks. A table must request image/font capabilities only when its actual content requires them.
- [ ] Run `bun test tests/tables.unit.test.ts tests/features.unit.test.ts tests/pdf.unit.test.ts` and compare text positions/page counts with Task 1 baselines.
- [ ] Proposed commit group: optional tables and shared layout helpers. Wait for explicit approval before committing.

### Task 5: Publish core and features as shared ESM modules

**Files:**
- Create: `src/core.ts`, `scripts/build.ts`, `tests/package.unit.test.ts`, `tests/helpers/package.ts`.
- Modify: `package.json`, all runtime relative imports under `src/`, `src/index.ts`.

**Interfaces:**
- Consumes: completed engine and descriptors, Bun CLI, existing package export conventions.
- Produces: Node-loadable ESM, subpath exports, source type entry points, and the full root compatibility API.

- [ ] Write failing packed-package tests for root named/default exports, `minkpdf/core`, `minkpdf/tables`, `minkpdf/images`, `minkpdf/truetype`, and existing `minkpdf/interfaces`.
- [ ] `src/core.ts` exports the factory, `PdfEngine`/`PdfFeature` types, and a Helvetica-only `createPdf` convenience function. `src/index.ts` composes all three features into the legacy singleton. Remove temporary extraction bridges.
- [ ] Implement `bun run build` using `scripts/build.ts` to enumerate all `src/**/*.ts` files and invoke `bun build` with `--no-bundle --target browser --format esm --root src --outdir dist`. Support an explicit alternate output directory for isolated package tests. Emit nested module paths and avoid independently bundled copies of shared code.
- [ ] Use explicit `.js` relative import specifiers in source; verify Bun development resolution and native Node ESM loading. Ensure a rebuilt distribution contains no stale managed outputs.
- [ ] Add explicit type/default export entries mapping each feature subpath to its source TypeScript types and emitted JavaScript. Preserve existing `main`, root types, and `./interfaces` behavior.
- [ ] Add `sideEffects: false` after auditing module initialization: no global registration, import-time I/O, or external mutations. Feature installation occurs only through an explicit factory call. Annotate pure construction only when justified, never all calls indiscriminately.
- [ ] Build a package in an isolated temporary staging directory, pack it locally without publishing, and install the tarball into a temporary consumer. Check Node runtime loading and TypeScript NodeNext/bundler resolution with pinned temporary tooling. Inspect the packed file list for all emitted shared modules and source types.
- [ ] Run `bun run build` and `bun test tests/package.unit.test.ts`; then run the complete `bun test` suite.
- [ ] Proposed commit group: package exports/build and package verification. Present only this task's changes to the already-modified manifest before requesting commit approval.

### Task 6: Prove feature exclusion and gate regressions

**Files:**
- Create: `tests/tree-shaking.unit.test.ts`, `tests/fixtures/consumers/core.ts`, `tests/fixtures/consumers/tables.ts`, `tests/fixtures/consumers/images.ts`, `tests/fixtures/consumers/truetype.ts`, `tests/fixtures/consumers/full.ts`, `tests/fixtures/consumers/unused-feature.ts`, `tests/fixtures/consumers/type-only.ts`.
- Modify: `benchmarks/tree-shaking.ts`, `tests/helpers/package.ts`, `.github/workflows/publish.yml`.

**Interfaces:**
- Consumes: packed package, consumer fixtures, module inclusion metadata, pinned Bun/esbuild/Rollup and TypeScript versions.
- Produces: repeatable feature-exclusion assertions, size reports, and release validation.

- [ ] Bundle real consumers of the tarball with Bun, esbuild, and Rollup in production settings. Temporary consumer tooling is pinned in its fixture manifest; no runtime dependency is added to MinkPDF. Each consumer invokes a renderer and exposes or uses its result so the whole application cannot vanish as dead code.
- [ ] Assert core includes none of the three optional implementations; each single-feature consumer includes only its requested feature; an unused feature import disappears; type-only imports add no runtime implementation. Use emitted module IDs/import graphs and execution, not minified function names or error-string matching alone. Account for tools that list parsed-but-eliminated modules in metadata.
- [ ] Execute representative consumer bundles to prove rendering still works after optimization. Check the full-feature path in both root import styles and explicit factory composition. Cover all eight capability combinations in behavior tests and verify factory composition is independent of descriptor order.
- [ ] Proposed size gates under the same Bun version/settings as Task 1: core is at least 30% smaller raw and 20% smaller gzip than the old named-root consumer; the new full root consumer grows by no more than 10% raw or gzip. Record raw/gzip per feature and all output chunks. These are acceptance targets, not claimed results; if a gate fails, investigate and report the tradeoff before changing it.
- [ ] Add required build/package/tree-shaking checks to the existing release workflow before staging. Pin its Bun version to the baseline's 1.4.2. Compare against the committed pre-extraction baseline; a future toolchain update must deliberately remeasure both old and new implementations. Retain the existing staging/approval flow.
- [ ] Run `bun run build`, `bun test`, and `bun benchmarks/tree-shaking.ts --compare-baseline=benchmarks/tree-shaking-baseline.json`. No staging or publishing is part of implementation verification.
- [ ] Proposed commit group: consumer regression tests, size gates, and CI validation. Wait for explicit approval before committing.

### Task 7: Document migration and complete the final review

**Files:**
- Modify: `README.md`.
- Create: `docs/tree-shaking.md`, `docs/benchmarks/2026-10-08-tree-shaking.json`.
- Modify: this plan's completion checklist as work proceeds.

**Interfaces:**
- Consumes: verified APIs, cross-bundler results, measured bundle sizes.
- Produces: accurate installation/import examples, feature errors, compatibility guidance, and measurement methodology.

- [ ] Explain the full root entry point, core convenience import, explicit feature composition, independent engine resources, and missing-capability errors. Show text-only, table+Unicode, and image examples using public package paths.
- [ ] Explain that tree-shaking removes unreferenced feature implementations after application bundling. It does not inspect runtime document contents; importing the full root still includes all supported features. Installed package size and rendered PDF size are separate measurements.
- [ ] State that output helper methods and remaining core conveniences are retained as part of the current API; this phase does not promise per-method elimination from returned objects. A separate helper API should be considered only if measurement justifies it.
- [ ] Save measured results with actual run date/tool versions; if execution occurs after this plan's date, use that date in the report filename. Keep existing benchmark claims intact unless deliberately remeasured with the same methodology.
- [ ] Review the final core dependency graph, public types, package contents, initialization/state lifetimes, compatibility assertions, and size results. Confirm no optional implementation is reachable through a shared barrel or default capability fallback.
- [ ] Review only task-related documentation changes, preserving current README edits. Proposed commit group: usage documentation and verified measurements. Wait for explicit approval before committing.

## Criticism applied before presentation

| Weak approach or risk | Revision in this plan |
| --- | --- |
| Add `sideEffects: false` and declare success | Require actual dependency separation and executable consumer tests; metadata is an additional hint. |
| Change the default API to a minimal engine | Keep the root full-feature; make the smaller API an explicit subpath. |
| Move feature functions but leave references in core | Extract intrinsic sizing, font embedding, image resources, and draw emission as well as parsers/layout. |
| Build each subpath as a standalone bundle | Preserve one ESM module tree to share code and resource identity. |
| Ship extensionless imports | Use `.js` specifiers and verify native Node consumers of the tarball. |
| Register features through side-effect imports or global registries | Compose explicit descriptors with engine-local state and per-render resources. |
| Extract all conveniences at once | Limit the first release to three substantial features; retain small shared primitives and output methods. |
| Promise a specific smaller size without measuring | Set explicit proposed budgets, reproduce the baseline, and require measured outcomes. |
| Check only source imports or Bun's output | Test published exports/types and consumer bundles with Bun, esbuild, and Rollup. |
| Use a temporary baseline unavailable to CI | Commit a versioned pre-extraction baseline outside the published package and compare without overwriting it. |
| Silently omit unsupported feature content | Require errors through recursive measurement/layout, including headers/footers. |

## Completion and recovery

- [x] Existing 12 PDF regression tests and new engine/feature/package/consumer tests pass.
- [x] Existing root API remains compatible; explicit engines have independent state.
- [x] Core and per-feature inclusion checks pass on all three tested bundlers.
- [x] Size targets pass, or a concrete measured revision has been presented before acceptance.
- [x] Generated ESM and source types resolve from a locally packed package under Node and TypeScript.
- [x] Documentation reports measured support and does not imply automatic runtime-feature detection.

Keep each implementation group independently reviewable. If extraction changes PDF layout unexpectedly, retain the legacy path until the difference is explained and fixed. If packaging fails, restore the previous build/export configuration and regenerate distribution files without discarding unrelated working changes. Leave publishing, version changes, pushes, merges, and every commit for separately authorized actions.


## Implementation verification — 2026-10-08

All seven implementation tasks are complete. No commit, worktree, version change, release staging, or publishing was performed.

- Bun 1.4.2: 32 tests passed across seven files, including all original 12 PDF tests.
- Native Node 24.12.0 loaded locally packed public exports and executed generated consumer bundles. TypeScript 5.9.3 resolved public types in both NodeNext and bundler modes.
- Bun 1.4.2, esbuild 0.28.2, and Rollup 4.64.2 verified selected module contributions, unused-feature/type-only elimination, readable text, PNG masks, and Unicode embedding.
- Core measured 13,391 bytes minified / 5,749 gzip versus the pre-extraction 23,976 / 9,936. Full named-root measured 25,560 / 10,544. Both proposed size gates passed.
- PDF text, pagination, dimensions, and word positions matched recorded semantic baselines.
- Test-driven fixes covered Buffer font-byte mutation and preservation/normalization of managed build output paths.

Implementation adjustments: table tests were consolidated in `tests/features.unit.test.ts`; feature contracts and the core entry point were wired together while extracting existing implementations. Rollup consumes fixtures emitted by the pinned TypeScript compiler with `verbatimModuleSyntax`, using its official node resolver. This avoids TypeScript plugin emission differences in a Bun-hosted test runner while retaining independent type checks. The builder uses the verified Bun CLI `--no-bundle`; the JavaScript API did not honor the attempted option. Temporary consumer tooling remains outside the engine's dependencies.

## Sources checked

- [Bun bundler documentation](https://bun.sh/docs/bundler), plus local Bun 1.4.0 CLI/build probes.
- [esbuild tree-shaking documentation](https://esbuild.github.io/api/#tree-shaking).
- [webpack tree-shaking and side-effects documentation](https://webpack.js.org/guides/tree-shaking/).
