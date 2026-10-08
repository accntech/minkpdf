# MinkPDF

<img src="./assets/icon.png" alt="White MinkPDF mink head and PDF lettering on a red squircle" width="160" />

A standalone TypeScript PDF engine with **zero runtime or development package dependencies**. It owns layout, pagination, TrueType parsing and subsetting, image embedding, compression, and PDF serialization. Browser and Bun/Node runtimes need native `CompressionStream` and `DecompressionStream` support.

```ts
import pdf from 'minkpdf';

pdf.addVirtualFileSystem({ 'Inter-Regular.ttf': fontBytes }); // Uint8Array or base64
pdf.addFonts({ Inter: { normal: 'Inter-Regular.ttf' } });

const document = pdf.createPdf({
	defaultStyle: { font: 'Inter' },
	content: [{ text: 'Receipt', bold: false }, 'José García · ₱1,234.50']
});
const bytes = await document.getBuffer();
```

`createPdf()` returns Promise-based `getBuffer()`, `getBlob()`, `getBase64()`, and `getDataUrl()` methods. `addFonts()`, assignment to `pdf.fonts`, `addVirtualFileSystem()`, and `addTableLayouts()` register reusable resources. Nothing fetches fonts or images automatically.

Install the package with `npm install minkpdf`. The npm package includes built ES modules and TypeScript types. To build a standalone ES module from this project:

```sh
bun run build
```

The resulting `dist/index.js` has no imports or bundled third-party code and can run in a browser or a modern Node/Bun runtime.

## Publishing releases

The `Publish to npm` GitHub Actions workflow runs when a GitHub release is published. It checks out the release tag, sets the npm package version from that tag, runs the PDF tests with Poppler, builds the package, and publishes it with provenance. Use version tags such as `v0.1.0` or `v0.2.0-beta.1`; no separate version commit is required. Stable releases use npm's `latest` tag. GitHub prereleases and versions containing a prerelease suffix use `next`.

For the first publish, create a granular npm access token with permission to publish new packages and bypass 2FA, then add it to this repository's Actions secrets as `NPM_TOKEN`. No token is stored in the repository. The npm package name is `minkpdf`.

After the package exists, configure [npm trusted publishing](https://docs.npmjs.com/trusted-publishers/) in the package settings with GitHub organization `accntech`, repository `minkpdf`, and workflow filename `publish.yml`. Leave the environment name empty and enable direct publishing with `npm publish`. Publish a new release within two days of adding the trusted publisher to validate the configuration. Once trusted publishing works, remove the `NPM_TOKEN` secret; subsequent releases authenticate through GitHub's OIDC token.

Each release must use a new npm version. Publishing an existing version again fails; drafts and tag pushes alone do not publish to npm. Check the workflow result in GitHub Actions after publishing a release.

## Compatibility

The engine supports the following document-definition features, with its own types at `minkpdf/interfaces`:

- Plain and styled inline text, stacks, columns, named styles, margins, alignment, font variants, line height, character spacing, and decorations.
- Tables with fixed, automatic, proportional, and percentage widths; nested content; merged columns; cell fills and borders; custom layout callbacks; repeated headers; row heights; and rows kept together.
- Page sizes and orientation, page breaks, unbreakable groups, final-page-count header/footer callbacks, cancellation watermarks, document metadata, and canvas lines.
- Embedded TrueType fonts with Unicode cmaps, composite glyph subsetting, and searchable/selectable text; built-in Helvetica for ASCII-only documents.
- PNG/JPEG base64 data URLs. PNG supports non-interlaced 8-bit grayscale, RGB, indexed, grayscale-alpha, and RGBA images, including transparency.

SVG, QR codes, lists, row spans, attachments, encryption, PDF/A, complex-script shaping, and arbitrary CSS colors are outside the supported API. Embedded fonts must contain the requested characters. Line metrics and pagination can differ from pdfmake; outputs are not pixel-identical.

## Tests

Engine tests live in `tests/` and run with Bun's built-in test runner. Poppler (`pdfinfo`, `pdftotext`, `pdfimages`) independently reads generated PDFs; install those system verification tools before testing. Font fixtures and their SIL Open Font licenses live in `tests/fixtures/fonts/`. No test framework or PDF parser is installed in this package.

```sh
bun test
```

## Benchmark against pdfmake

```sh
bun run benchmark
bun run benchmark --runs=20 --output=/tmp/minkpdf-benchmark
```

The benchmark installs **pdfmake 0.3.11 in a temporary directory** and deletes it afterward. The project manifest does not acquire a pdfmake dependency. It uses identical definitions and font files for short documents, 100-row and 1,000-row reports, and nested vouchers. Poppler validates representative text in both engines' outputs.

Results include first-render time, warmed median and p95 time, PDF size, page count, module-import time, and minified/gzipped browser engine size. Three warmups precede 20 measured renders by default. Font I/O and definition cloning are outside timed rendering. MinkPDF's parsed-font cache is reset before each first render and reused for warmed renders, matching its export runtime. Engine sizes exclude font assets; compression and pagination can differ. Import measurements are a local Bun comparison, not a browser network benchmark.

`--output` saves the measured PDFs and `results.json`. `--font-dir=/path/to/fonts` overrides the bundled fixture font directory. The benchmark needs Bun, Poppler, and registry access for the temporary baseline installation.
