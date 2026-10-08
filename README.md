# MinkPDF

<img src="./assets/icon.png" alt="White MinkPDF mink head and PDF lettering on a red squircle" width="160" />

[![npm version](https://img.shields.io/npm/v/minkpdf?color=orange)](https://www.npmjs.com/package/minkpdf)
[![npm downloads](https://img.shields.io/npm/dt/minkpdf?color=brightgreen)](https://www.npmjs.com/package/minkpdf)
[![GitHub stars](https://img.shields.io/github/stars/accntech/minkpdf?style=social&label=Stars)](https://github.com/accntech/minkpdf/stargazers)

MinkPDF generates PDFs from TypeScript document definitions in browsers, Node.js, and Bun. It supports text, tables, headers, footers, and embedded TrueType fonts, with **no runtime package dependencies**.

The engine implements layout, pagination, font parsing and subsetting, image embedding, compression, and PDF serialization. Its document definition follows a supported subset of pdfmake's API; see [compatibility and limitations](#compatibility-and-limitations) before migrating.

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

| Method | Result |
| --- | --- |
| `getBuffer()` | `Promise<Uint8Array>` containing the PDF bytes |
| `getBlob()` | `Promise<Blob>` with MIME type `application/pdf` |
| `getBase64()` | `Promise<string>` containing base64 without a data URL prefix |
| `getDataUrl()` | `Promise<string>` beginning with `data:application/pdf;base64,` |

Rendering begins on the first output request. Later requests on the same document reuse the rendered PDF.

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

Without a bundler, serve the built `dist/index.js` as `/minkpdf.js` and use `import pdf from '/minkpdf.js'` inside a `<script type="module">`. Serve the page over HTTP(S).

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
	content: [
		{ text: 'Receipt', bold: true },
		'José García · ₱1,234.50'
	]
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

- Plain and styled inline text, stacks, columns, named styles, margins, alignment, font variants, line height, character spacing, and decorations.
- Tables with fixed, automatic, proportional, and percentage widths; nested content; merged columns; cell fills and borders; custom layout callbacks; repeated headers; row heights; and rows kept together.
- Page sizes and orientation, page breaks, unbreakable groups, final-page-count header/footer callbacks, cancellation watermarks, document metadata, and canvas lines.
- Embedded TrueType fonts with Unicode cmaps, composite glyph subsetting, and searchable/selectable text; built-in Helvetica for ASCII-only documents.
- PNG/JPEG base64 data URLs. PNG supports non-interlaced 8-bit grayscale, RGB, indexed, grayscale-alpha, and RGBA images, including transparency.

Use three- or six-digit hex colors such as `#eee` or `#334155`. Named CSS colors, `rgb()`, and eight-digit hex colors are unsupported. Dimensions, font sizes, and margins use PDF points (72 points = 1 inch).

SVG, QR codes, lists, row spans, attachments, encryption, PDF/A, and complex-script shaping are outside the supported API. Embedded fonts must contain the requested characters. Line metrics and pagination can differ from pdfmake; outputs are not pixel-identical. pdfmake-specific methods outside the API documented here are not provided.

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

Use `createPdfEngine()` from `minkpdf/core` with feature factories from `minkpdf/tables`, `minkpdf/images`, and `minkpdf/truetype` to include only the capabilities you need. The existing `minkpdf` root import still enables every feature. See [Optional features and tree-shaking](./docs/tree-shaking.md) for composition, registration, errors, and measured sizes.

### Runtime requirements

The built engine uses native Web APIs, including `CompressionStream` with `deflate`, `Blob`, `Response`, `TextEncoder`, `atob`, and `btoa`. PNG support additionally uses `DecompressionStream`; a core bundle does not include that implementation.

| Runtime | Verification on 2026-10-08 |
| --- | --- |
| Bun 1.4.0 | Full engine test suite and README file-generation examples |
| Bun 1.4.2 | Optional-feature, packed-package, and consumer tree-shaking tests |
| Node.js 24.12.0 | README file-generation examples using the built ES module |
| Browsers | Require the native APIs above and ES module support; browser coverage is not included in the engine test suite |

These are verified versions, not minimum version guarantees. Bun is required to build this repository and run its tests and benchmark; consumers use the built ES module.

## Benchmarks against pdfmake

Measured on **2026-10-08**, using Bun **1.4.0** on an **Apple M4 Pro**, macOS **27.2**, arm64. Each scenario uses three warmups followed by 20 measured renders. The table shows warmed median render time; PDF sizes and page counts come from the measured outputs.

| Document | MinkPDF median (ms) | pdfmake 0.3.11 median (ms) | PDF bytes: MinkPDF / pdfmake | Pages: MinkPDF / pdfmake |
| --- | ---: | ---: | ---: | ---: |
| Short document | 0.205 | 11.935 | 7,488 / 8,160 | 1 / 1 |
| 100-row report | 2.492 | 29.64 | 20,222 / 27,816 | 4 / 4 |
| 1,000-row report | 20.174 | 140.317 | 74,487 / 145,570 | 33 / 34 |
| Nested voucher | 0.545 | 14.76 | 12,150 / 13,579 | 1 / 1 |

Minified browser engine sizes, excluding fonts, were **24,884 bytes** for MinkPDF and **1,053,972 bytes** for pdfmake; gzip sizes were **10,362** and **356,393 bytes** respectively. [Full results](./docs/benchmarks/2026-10-08.json) include first-render and p95 timings, sizes, page counts, and module-import time.

This is one local measurement, not a performance guarantee. The engines support different feature sets, and layout and compression can differ: the 1,000-row report above has different page counts. Poppler validates representative text in both engines' PDFs; that check does not establish visual equivalence.

### Run the benchmark

```sh
bun run benchmark
bun run benchmark --runs=20 --output=/tmp/minkpdf-benchmark
```

The benchmark installs **pdfmake 0.3.11 in a temporary directory** and deletes it afterward. The project manifest does not acquire a pdfmake dependency. It uses identical definitions and font files for short documents, 100-row and 1,000-row reports, and nested vouchers.

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

Package and tree-shaking tests pack and install MinkPDF in temporary consumers, alongside pinned esbuild, Rollup, and TypeScript tooling. These checks require Node.js, npm, and registry access; their temporary dependencies are removed afterward. To compare bundle sizes with the pre-extraction baseline:

```sh
bun benchmarks/tree-shaking.ts --compare-baseline=benchmarks/tree-shaking-baseline.json
```

Maintainers: see [Publishing releases](./docs/releases.md) for staging, approving, and publishing npm versions.

## Contributing

Bug reports, documentation improvements, and pull requests are welcome. See the
[contributing guide](./CONTRIBUTING.md) for setup, checks, and pull request guidance. Follow the
[Code of Conduct](./CODE_OF_CONDUCT.md) when participating in the project.

## License

MinkPDF is licensed under the [MIT License](./LICENSE). The test font fixtures retain their separate SIL Open Font licenses.
