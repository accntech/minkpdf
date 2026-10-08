# MinkPDF

<img src="./assets/icon.png" alt="White MinkPDF mink head and PDF lettering on a red squircle" width="160" />

[![npm version](https://img.shields.io/npm/v/minkpdf?color=orange)](https://www.npmjs.com/package/minkpdf)
[![npm downloads](https://img.shields.io/npm/dt/minkpdf?color=brightgreen)](https://www.npmjs.com/package/minkpdf)
[![GitHub stars](https://img.shields.io/github/stars/accntech/minkpdf?style=social&label=Stars)](https://github.com/accntech/minkpdf/stargazers)

[Documentation](https://accntech.github.io/minkpdf/)

MinkPDF generates PDFs from TypeScript document definitions in browsers, Node.js, and Bun. It supports text, tables, headers, footers, and embedded TrueType fonts, with **no runtime package dependencies**.

The engine implements layout, pagination, font parsing and subsetting, image embedding, compression, and PDF serialization. Its document definition follows a supported subset of pdfmake's API; see [compatibility and limitations](#compatibility-and-limitations) before migrating.

The [documentation site](https://accntech.github.io/minkpdf/) covers the project rationale, setup, complete API reference, a
pdfmake comparison, and benchmark graphs. See [building and publishing the documentation](./CONTRIBUTING.md#documentation-site)
to preview it locally or deploy it to GitHub Pages.

## Install

```sh
npm install minkpdf
```

The package includes built ES modules and TypeScript types. Use ESM imports (`import`), with a `.mjs` file or a project configured with `"type": "module"`.

## Quickstart: save a PDF in Node.js or Bun

Save this as `receipt.mjs`. It uses built-in Helvetica and ASCII text, so no font files are needed.

```js
import pdf from 'minkpdf';
import { writeFile } from 'node:fs/promises';

const document = pdf.createPdf({
	info: { title: 'Receipt' },
	content: [
		{ text: 'Receipt', fontSize: 18, bold: true, margin: [0, 0, 0, 12] },
		'Payment received: USD 1,234.50'
	]
});

await writeFile('receipt.pdf', await document.getBuffer());
```

```sh
node receipt.mjs
# Or: bun receipt.mjs
```

`createPdf()` returns an object with these asynchronous output methods:

| Method           | Result                                                          |
| ---------------- | --------------------------------------------------------------- |
| `getBuffer()`    | `Promise<Uint8Array>` containing the PDF bytes                  |
| `getBlob()`      | `Promise<Blob>` with MIME type `application/pdf`                |
| `getBase64()`    | `Promise<string>` containing base64 without a data URL prefix   |
| `getDataUrl()`   | `Promise<string>` beginning with `data:application/pdf;base64,` |
| `print(target?)` | `Promise<void>`; browser PDF viewer with a print OpenAction     |

The four byte/Blob methods share one cached render. Browser printing separately caches a printable PDF; ordinary output methods never include its print action.

## Examples

### Download a PDF in a browser

In a browser application with a bundler, add a button and import MinkPDF in your JavaScript module:

```html
<button id="download-pdf" type="button">Download receipt</button>
```

```js
import pdf from 'minkpdf';

const button = document.querySelector('#download-pdf');
button.addEventListener('click', async () => {
	button.disabled = true;
	try {
		const receipt = pdf.createPdf({ content: ['Receipt', 'Payment received: USD 1,234.50'] });
		const url = URL.createObjectURL(await receipt.getBlob());
		const link = document.createElement('a');
		link.href = url;
		link.download = 'receipt.pdf';
		document.body.append(link);
		link.click();
		link.remove();
		setTimeout(() => URL.revokeObjectURL(url), 1000);
	} finally {
		button.disabled = false;
	}
});
```

Without a bundler, serve the entire built `dist/` module tree, preserving its relative paths, and import its `index.js` inside a `<script type="module">`. Serve the page over HTTP(S).

### Print a PDF in a browser

Call `print()` during a button click, or pass a window opened during that click before loading report data:

```js
import pdf from 'minkpdf';

button.addEventListener('click', async () => {
	const target = window.open('', '_blank');
	if (!target) throw new Error('Print window blocked');
	await pdf.createPdf({ content: 'Invoice INV-001' }).print(target);
});
```

`print(target?: Window | null)` opens a window synchronously when no target is supplied, then navigates to a PDF with a print OpenAction. Its promise resolves after navigation, not after printing. Automatic printing depends on the PDF viewer honoring that action. MinkPDF releases the object URL after an `afterprint` event or when the target closes. A blocked popup, closed target, or rendering failure rejects the promise; an automatically opened window closes on failure. This helper is browser-only and is also available on core documents.

### Unicode text and font variants

For characters such as `é` and `₱`, embed a TrueType font containing those characters. Place `Inter-Regular.ttf` and `Inter-Bold.ttf` in a local `fonts/` directory, then save this as `unicode-receipt.mjs`:

```js
import pdf from 'minkpdf';
import { readFile, writeFile } from 'node:fs/promises';

const [regular, bold] = await Promise.all([
	readFile('./fonts/Inter-Regular.ttf'),
	readFile('./fonts/Inter-Bold.ttf')
]);

pdf.addVirtualFileSystem({
	'Inter-Regular.ttf': regular,
	'Inter-Bold.ttf': bold
});
pdf.addFonts({
	Inter: { normal: 'Inter-Regular.ttf', bold: 'Inter-Bold.ttf' }
});

const document = pdf.createPdf({
	defaultStyle: { font: 'Inter' },
	content: [{ text: 'Receipt', bold: true }, 'José García · ₱1,234.50']
});

await writeFile('unicode-receipt.pdf', await document.getBuffer());
```

Run it with `node unicode-receipt.mjs` or `bun unicode-receipt.mjs`. Font paths are relative to the working directory. The repository includes Inter fixtures in `tests/fixtures/fonts/`; these are not included in the npm package. Preserve their SIL Open Font License when distributing them.

Virtual files accept `Uint8Array` bytes or base64 strings without a data URL prefix. Register each variant you use: `normal`, `bold`, `italics`, and `bolditalics`. An unregistered variant throws an error; it does not fall back to the normal face. In a browser, load your font explicitly, for example with `fetch()` and `new Uint8Array(await response.arrayBuffer())`, before registering it.

### Tables with repeated headers and page numbers

This example uses built-in Helvetica and saves a report with 100 rows. `headerRows: 1` repeats the table's first row when it spans pages. The footer receives the current page number and final page count.

```js
import pdf from 'minkpdf';
import { writeFile } from 'node:fs/promises';

const document = pdf.createPdf({
	pageSize: 'A4',
	pageMargins: [40, 40, 40, 60],
	defaultStyle: { fontSize: 10 },
	footer: (page, total) => ({
		text: `Page ${page} of ${total}`,
		alignment: 'center',
		fontSize: 8,
		margin: [0, 12, 0, 0]
	}),
	content: [
		{ text: 'Sales report', fontSize: 18, bold: true, margin: [0, 0, 0, 12] },
		{
			table: {
				headerRows: 1,
				dontBreakRows: true,
				widths: ['*', 100],
				body: [
					[
						{ text: 'Item', bold: true, fillColor: '#eee' },
						{ text: 'Amount (USD)', bold: true, fillColor: '#eee' }
					],
					...Array.from({ length: 100 }, (_, index) => [
						`Item ${index + 1}`,
						{ text: '123.45', alignment: 'right' }
					])
				]
			}
		}
	]
});

await writeFile('sales-report.pdf', await document.getBuffer());
```

## Compatibility and limitations

MinkPDF supports the following document-definition features:

- Plain and styled inline text, stacks, columns, named styles, margins and per-side margins, alignment, font variants, line height, character spacing, and decorations. Named-style margins and cell fills apply to the styled node without leaking into children.
- Tables with fixed, automatic, proportional, and percentage widths; nested content; combined row/column spans; cell fills and borders; custom layout callbacks; repeated headers; row heights; and rows kept together. Supply empty placeholders for covered cells. Connected row spans stay together when they fit; oversized groups split with their content, fills, and borders. Spans cannot exceed the table or cross the repeated-header boundary.
- Absolute and relative positioning in PDF points. `absolutePosition: { x, y }` anchors to the current page's top-left; `relativePosition: { x, y }` offsets the current flow cursor. Both ignore their own margins and do not advance flow. Positioned content stays on the current page and should fit within it.
- Page sizes and orientation, page breaks, unbreakable groups, final-page-count header/footer callbacks, cancellation watermarks, document metadata, and canvas lines.
- Embedded TrueType fonts with Unicode cmaps, composite glyph subsetting, and searchable/selectable text; built-in Helvetica for ASCII-only documents.
- PNG/JPEG base64 data URLs. PNG supports non-interlaced 8-bit grayscale, RGB, indexed, grayscale-alpha, and RGBA images, including transparency.

Use three- or six-digit hex colors such as `#eee` or `#334155`, or case-insensitive CSS named colors such as `red`, `gray`, and `lightgray`. CSS color functions such as `rgb()`, eight-digit hex colors, `transparent`, and `currentColor` are unsupported. Dimensions, font sizes, coordinates, and margins use PDF points (72 points = 1 inch).

Per-side properties (`marginLeft`, `marginTop`, `marginRight`, `marginBottom`) support negative values and override corresponding named-style sides. An explicit node `margin` takes precedence over its per-side properties. Named styles resolve in array order, with node properties taking precedence.

SVG, QR codes, lists, attachments, encryption, PDF/A, and complex-script shaping are outside the supported API. Embedded fonts must contain the requested characters. Line metrics and pagination can differ from pdfmake; outputs are not pixel-identical. pdfmake-specific methods outside the API documented here are not provided.

Import document types from `minkpdf/interfaces`:

```ts
import type { TDocumentDefinitions } from 'minkpdf/interfaces';

const definition: TDocumentDefinitions = { content: ['Hello'] };
```

`addFonts()`, assignment to `pdf.fonts`, `addVirtualFileSystem()`, and `addTableLayouts()` register resources shared across documents. `addFonts()` merges font families; assigning `pdf.fonts` replaces the font dictionary. MinkPDF does not fetch fonts or images automatically.

### Smaller bundles with optional features

For text using built-in Helvetica, import the core:

```ts
import { createPdf } from 'minkpdf/core';

const bytes = await createPdf({ content: 'Hello' }).getBuffer();
```

Use `createPdfEngine()` from `minkpdf/core` with feature factories from `minkpdf/tables`, `minkpdf/images`, and `minkpdf/truetype` to include only the capabilities you need. The existing `minkpdf` root import still enables every feature. See the [optional-feature guide](https://accntech.github.io/minkpdf/installation/#optional-features) and [engine reference](https://accntech.github.io/minkpdf/api/#engine) for composition, registration, and errors.

### Runtime requirements

The built engine uses native Web APIs, including `CompressionStream` with `deflate`, `Blob`, `Response`, `TextEncoder`, `atob`, and `btoa`. PNG support additionally uses `DecompressionStream`; a core bundle does not include that implementation.

| Runtime         | Verification on 2026-10-08                                                                                                                                       |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Bun 1.4.0       | Full engine test suite and README file-generation examples                                                                                                       |
| Bun 1.4.2       | Full suite including feature regressions, packed-package, and consumer tree-shaking tests                                                                        |
| Node.js 24.12.0 | README file-generation examples using the built ES module                                                                                                        |
| Chromium        | Manual browser verification of PDF generation, printable-PDF navigation, and closed-target object-URL cleanup; browser printing also has lifecycle unit coverage |

These are verified versions, not minimum version guarantees. Bun is required to build this repository and run its tests and benchmark; consumers use the built ES module.

## Benchmarks against pdfmake

Measured on **2026-10-08**, using Bun **1.4.2** on an **Apple M4 Pro**, macOS **27.2**, arm64. Each scenario uses three warmups followed by 20 measured renders. The table shows warmed median render time; PDF sizes and page counts come from the measured outputs.

| Document              | MinkPDF median (ms) | pdfmake 0.3.11 median (ms) | PDF bytes: MinkPDF / pdfmake | Pages: MinkPDF / pdfmake |
| --------------------- | ------------------: | -------------------------: | ---------------------------: | -----------------------: |
| Short document        |               0.242 |                      9.888 |                7,488 / 8,160 |                    1 / 1 |
| 100-row report        |               2.764 |                     26.932 |              20,222 / 27,816 |                    4 / 4 |
| 1,000-row report      |              23.364 |                    135.039 |             74,487 / 145,570 |                  33 / 34 |
| Nested voucher        |               0.479 |                     13.146 |              12,150 / 13,579 |                    1 / 1 |
| Invoice overlay       |               0.279 |                      9.309 |                7,850 / 8,515 |                    1 / 1 |
| ERP registration form |               0.606 |                     12.789 |              12,951 / 14,531 |                    1 / 1 |

Minified browser engine sizes, excluding fonts, were **34,765 bytes** for MinkPDF and **1,053,972 bytes** for pdfmake; gzip sizes were **14,224** and **356,393 bytes** respectively. [Full results](./docs/site/data/2026-10-08-render-benchmarks.json) include first-render and p95 timings, sizes, page counts, and module-import time.

This is one local measurement, not a performance guarantee. The engines support different feature sets, and layout and compression can differ: the 1,000-row report above has different page counts. Poppler validates representative text in both engines' PDFs; that check does not establish visual equivalence.

### Run the benchmark

```sh
bun run benchmark
bun run benchmark --runs=20 --output=/tmp/minkpdf-benchmark
```

The benchmark installs **pdfmake 0.3.11 in a temporary directory** and deletes it afterward. The project manifest does not acquire a pdfmake dependency. It uses identical definitions and font files for short documents, 100-row and 1,000-row reports, nested vouchers, positioned invoice overlays, and ERP registration forms with row spans, named-style fills, per-side margins, and named colors. Print-window latency is outside the render benchmark.

Font I/O and definition cloning are outside timed rendering. MinkPDF's parsed-font cache is reset before each first render and reused for warmed renders, matching its export runtime. Import measurements are a local Bun comparison, not a browser network benchmark.

`--output` saves the measured PDFs and `results.json`. `--font-dir=/path/to/fonts` overrides the bundled fixture font directory. The benchmark needs Bun, Poppler, and registry access for the temporary baseline installation.

## Development

The engine package has no runtime or development package dependencies. Use Bun **1.4.2**, matching `packageManager` and the recorded bundle baseline, then build the ES modules:

```sh
bun run build
```

The resulting `dist/` contains shared ES modules with explicit `.js` relative imports and no third-party runtime code. Application bundlers remove optional feature modules that are not selected.

Engine tests live in `tests/` and run with Bun's built-in test runner. Poppler (`pdfinfo`, `pdftotext`, `pdfimages`) independently reads generated PDFs. Install it before running tests:

```sh
# macOS with Homebrew
brew install poppler
# Debian / Ubuntu
sudo apt-get install poppler-utils

bun test
```

Font fixtures and their SIL Open Font licenses live in `tests/fixtures/fonts/`. No test framework or PDF parser is installed in this package.

Package and tree-shaking tests pack and install MinkPDF in temporary consumers, alongside pinned esbuild, Rollup, and TypeScript tooling. These checks require Node.js, npm, and registry access; their temporary dependencies are removed afterward. To check bundle budgets against the current feature baseline (the historical pre-extraction baseline is retained):

```sh
bun benchmarks/tree-shaking.ts --compare-baseline=benchmarks/bundle-baseline.json
```

## Contributing

Bug reports, documentation improvements, and pull requests are welcome. See the
[contributing guide](./CONTRIBUTING.md) for setup, checks, and pull request guidance. Follow the
[Code of Conduct](./CODE_OF_CONDUCT.md) when participating in the project.

## License

MinkPDF is licensed under the [MIT License](./LICENSE). The test font fixtures retain their separate SIL Open Font licenses.
