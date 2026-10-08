# Optional features and tree-shaking

MinkPDF provides a small core and three optional feature modules. Choose capabilities when creating an engine, then let your application bundler remove unreferenced modules. The root `minkpdf` entry point preserves the existing API and enables all three features.

| Import | Factory | Capability |
| --- | --- | --- |
| `minkpdf/core` | `createPdfEngine()` | Shared renderer and layout, built-in Helvetica |
| `minkpdf/tables` | `tables()` | Table measurement, layout, spans, repeated headers, custom layouts |
| `minkpdf/images` | `images()` | PNG/JPEG dimensions, layout, embedding, PNG transparency |
| `minkpdf/truetype` | `trueTypeFonts()` | Custom font parsing, Unicode, subsetting and embedding |
| `minkpdf/interfaces` | Types only | Existing document definition types |

Core includes styled ASCII text, Helvetica variants, stacks, columns, pagination, margins, page breaks, headers/footers, metadata, watermarks, and canvas lines. All engines retain `getBuffer()`, `getBlob()`, `getBase64()`, and `getDataUrl()` on their returned documents.

## Text with built-in Helvetica

```ts
import { createPdf } from 'minkpdf/core';

const bytes = await createPdf({ content: 'Hello' }).getBuffer();
```

This convenience function uses the core's shared default engine. For independent configuration, call `createPdfEngine()`.

## Tables and Unicode text

```ts
import { createPdfEngine } from 'minkpdf/core';
import { tables } from 'minkpdf/tables';
import { trueTypeFonts } from 'minkpdf/truetype';

const pdf = createPdfEngine({ features: [tables(), trueTypeFonts()] });
const response = await fetch('/fonts/Inter-Regular.ttf');
const fontBytes = new Uint8Array(await response.arrayBuffer());

pdf.addVirtualFileSystem({ 'Inter-Regular.ttf': fontBytes });
pdf.addFonts({ Inter: { normal: 'Inter-Regular.ttf' } });
pdf.addTableLayouts({ compact: { paddingTop: () => 2, paddingBottom: () => 2 } });

const bytes = await pdf.createPdf({
	defaultStyle: { font: 'Inter' },
	content: { layout: 'compact', table: { body: [['José García', '₱100']] } }
}).getBuffer();
```

This bundle includes tables and TrueType support, without image parsing or embedding. The font must contain the requested characters. Register each used font variant, as with the root API.

## Images

```ts
import { createPdfEngine } from 'minkpdf/core';
import { images } from 'minkpdf/images';

const pdf = createPdfEngine({ features: [images()] });
const logo = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAACklEQVR4nGMAAQAABQABDQottAAAAABJRU5ErkJggg==';
const bytes = await pdf.createPdf({
	content: [{ image: logo, fit: [40, 40] }, 'Receipt']
}).getBuffer();
```

The image feature accepts the same PNG/JPEG base64 data URLs as the root API. PNG decompression is removed from bundles without image support. Add `tables()` to use images in table cells.

## Engine state and capability errors

Each `createPdfEngine()` call has independent font dictionaries, virtual files, table layouts and parsed-font caches. Registrations are shared among documents created by that engine. Image resources are created separately for each render. Descriptors can be reused across engines; their registration state remains independent.

`addFonts()` merges dictionaries. Assignment to `pdf.fonts` replaces the dictionary's contents while preserving its identity. `addVirtualFileSystem()` accepts base64 strings or `Uint8Array` bytes, including Node Buffers, and invalidates cached fonts when their files are replaced. The root named exports and default object share the same full-feature engine.

Features are selected at construction. Duplicate descriptors throw immediately. A missing feature produces an error naming the required import, including when its content occurs in nested containers or headers/footers. Rendering errors reject `getBuffer()` and the other asynchronous output methods. Resource registration throws synchronously if its capability is disabled: font registration requires `trueTypeFonts()`, and custom table layouts require `tables()`.

Helvetica supports ASCII text. To render characters such as `é` or `₱`, enable TrueType support and register a suitable font.

## What is removed

The package ships a shared ESM module tree and declares that module imports have no external side effects. Use public subpaths and production bundling. Tests inspect emitted module contributions from Bun and esbuild, and rendered module lengths from Rollup, then execute the resulting bundles with independent PDF readers.

Tree-shaking follows imports and references; it does not infer capabilities from runtime document contents. Root imports include all supported features even for a text-only document. Optional-feature imports that are unused and type-only imports are removed. Output methods remain part of the returned document object; this API does not promise separate elimination of each method.

The installed npm package still contains every feature. Font assets and generated PDF sizes are separate from application JavaScript bundle sizes. The runtime dependency count remains zero; consumer verification tooling is installed only in temporary test directories.

## Measured consumer sizes

Measured on 2026-10-08 with Bun 1.4.2, browser target and minification, using an observable consumer creating a `Hello` document. Each optional-feature measurement enables that feature even though this particular document is plain text. Gzip uses the default settings of `node:zlib`. Sizes exclude font assets.

| Consumer | Minified bytes | Gzip bytes |
| --- | ---: | ---: |
| Before extraction, named root | 23,976 | 9,936 |
| Core | 13,391 | 5,749 |
| Core + tables | 15,913 | 6,705 |
| Core + images | 16,973 | 7,155 |
| Core + TrueType | 19,444 | 8,213 |
| Full root, named import | 25,560 | 10,544 |
| Full root, default import | 25,576 | 10,555 |

Core is 44.1% smaller minified and 42.1% smaller gzip than the previous named-root consumer. The full named-root consumer grows 6.6% minified and 6.1% gzip. [Measurement report](./benchmarks/2026-10-08-tree-shaking.json) records the tool settings; the existing pdfmake benchmark report measures the earlier full-engine implementation.

The tests enforce at least a 30% minified / 20% gzip reduction for core, and at most 10% growth for both full-root import styles. Run `bun run build`, `bun test`, and the comparison below with Bun 1.4.2. Package tests also verify native Node imports and TypeScript NodeNext/bundler resolution; consumer bundlers are pinned in `tests/fixtures/consumers/package.json`.

```sh
bun benchmarks/tree-shaking.ts --compare-baseline=benchmarks/tree-shaking-baseline.json
```

[Back to the README](../README.md).
