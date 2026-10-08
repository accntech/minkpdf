import { code, heading, note, table } from './html';
import { benchmarkContent } from './charts';
import { icon } from './icons';

export type Page = {
	slug: string;
	title: string;
	group: string;
	description: string;
	sections: [string, string][];
	body: string;
};

export const receiptExample = `import pdf from 'minkpdf';
import { writeFile } from 'node:fs/promises';

const receipt = pdf.createPdf({
  info: { title: 'Receipt' },
  content: [
    { text: 'Receipt', fontSize: 18, bold: true },
    'Payment received: USD 1,234.50'
  ]
});

await writeFile('receipt.pdf', await receipt.getBuffer());`;

export const browserExample = `import pdf from 'minkpdf';

const button = document.querySelector('#download-pdf');
button.addEventListener('click', async () => {
  button.disabled = true;
  try {
    const receipt = pdf.createPdf({
      content: ['Receipt', 'Payment received: USD 1,234.50']
    });
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
});`;

export const fontExample = `import pdf from 'minkpdf';
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

const receipt = pdf.createPdf({
  defaultStyle: { font: 'Inter' },
  content: [{ text: 'Receipt', bold: true }, 'José García · ₱1,234.50']
});
await writeFile('unicode-receipt.pdf', await receipt.getBuffer());`;

const outputs = table(
	['Method', 'Return type', 'Use it for'],
	[
		[
			'<code>getBuffer()</code>',
			'<code>Promise&lt;Uint8Array&gt;</code>',
			'Files, HTTP responses, and binary storage'
		],
		[
			'<code>getBlob()</code>',
			'<code>Promise&lt;Blob&gt;</code>',
			'Browser downloads; MIME type <code>application/pdf</code>'
		],
		[
			'<code>getBase64()</code>',
			'<code>Promise&lt;string&gt;</code>',
			'Base64 without a data URL prefix'
		],
		[
			'<code>getDataUrl()</code>',
			'<code>Promise&lt;string&gt;</code>',
			'<code>data:application/pdf;base64,…</code>'
		],
		[
			'<code>print(target?)</code>',
			'<code>Promise&lt;void&gt;</code>',
			'Browser PDF viewer with a print OpenAction; optional preopened Window'
		]
	]
);

export const pages: Page[] = [
	{
		slug: 'index',
		title: 'Meet MinkPDF',
		group: 'Introduction',
		description:
			'A compact TypeScript PDF engine. Familiar document definitions, zero runtime package dependencies, and only the features you need.',
		sections: [
			['why-minkpdf', 'Why MinkPDF exists'],
			['design-principles', 'Design principles'],
			['under-the-hood', 'Under the hood'],
			['find-your-way', 'Find your way']
		],
		body: `<div class="intro-art" aria-label="Document definition to PDF illustration"><div class="art-definition"><span class="art-label">Your definition</span><code>{ content: 'Hello' }</code><span class="art-arrow" aria-hidden="true">↗</span></div><div class="art-page"><div class="paper-top"><span>M</span><small>GENERATED WITH MINKPDF</small></div><strong>Hello.</strong><p>A little code.<br>A real document.</p><div class="paper-rule"></div><div class="paper-bottom"><span>Helvetica · A4</span><span>1 / 1</span></div></div><span class="art-caption">Definition → layout → PDF bytes</span></div>
<div class="intro-actions"><a class="button primary" href="getting-started.html">Create your first PDF <span aria-hidden="true">→</span></a><a class="text-link" href="api.html">Explore the API ↗</a></div>
${heading('why-minkpdf', 'Why MinkPDF exists')}
<p>Receipts, reports, and vouchers need reliable text, tables, and pagination. Shipping a broad PDF stack for those documents can add a substantial amount of code to an application. MinkPDF focuses on this smaller, practical document workflow.</p>
<p>The project’s development centers on a standalone engine with <strong>zero runtime package dependencies</strong>, a compact browser bundle, and a familiar document-definition model. It implements its own layout, font handling, and PDF serialization while supporting a useful subset of pdfmake’s API.</p>
<p>Optional feature modules make that focus explicit: a text-only app can import the core, while an invoice app can add tables and embedded fonts. The full root import remains the convenient starting point.</p>
${heading('design-principles', 'Small by design')}
<div class="principles"><div><span class="principle-icon">${icon('code-square-linear')}</span><h3>Describe your document</h3><p>Describe content and styles in TypeScript. Let the engine lay out and paginate the document.</p></div><div><span class="principle-icon">${icon('layers-minimalistic-linear')}</span><h3>Choose your capabilities</h3><p>Compose tables, images, and TrueType fonts around a shared core. Bundle what your document needs.</p></div><div><span class="principle-icon">${icon('infinite-linear')}</span><h3>One model across runtimes</h3><p>Get PDF bytes in browsers, Node.js, and Bun through the same asynchronous output methods.</p></div></div>
${note('A focused API', 'MinkPDF supports a subset of pdfmake, with different layout and pagination behavior. Check the <a href="comparison.html#compatibility">compatibility table</a> before migrating an existing document.')}
${heading('under-the-hood', 'From content to PDF bytes')}
<div class="pipeline"><div><b>Define</b><span>Content + styles</span></div><span aria-hidden="true">→</span><div><b>Lay out</b><span>Measure + paginate</span></div><span aria-hidden="true">→</span><div><b>Serialize</b><span>Fonts + streams</span></div></div>
<p>The engine measures text, arranges content, and paginates it. It embeds and subsets registered TrueType fonts, embeds PNG/JPEG images, compresses streams with native Web APIs, and writes the PDF structure itself.</p>
<p>Rendering is lazy. Calling <code>createPdf()</code> prepares a document; the byte/Blob methods share one cached render. Browser printing separately caches a printable render.</p>
${heading('find-your-way', 'Find your way')}
<div class="link-grid"><a href="getting-started.html"><span>Start building</span><strong>Getting started <i aria-hidden="true">→</i></strong><p>Generate and save a receipt in a few lines.</p></a><a href="installation.html"><span>Set up your environment</span><strong>Installation <i aria-hidden="true">→</i></strong><p>ES modules, runtime requirements, and optional imports.</p></a><a href="comparison.html"><span>Coming from pdfmake?</span><strong>API comparison <i aria-hidden="true">→</i></strong><p>Keep familiar definitions and adapt output handling.</p></a><a href="benchmarks.html"><span>Explore the measurements</span><strong>Benchmarks <i aria-hidden="true">→</i></strong><p>Render timings, bundle sizes, and reproducible results.</p></a></div>`
	},
	{
		slug: 'getting-started',
		title: 'Your first PDF',
		group: 'Guides',
		description:
			'Go from a document definition to a saved PDF. Start with built-in Helvetica, then add browser downloads or Unicode fonts.',
		sections: [
			['first-document', 'Save a receipt'],
			['browser-download', 'Browser download'],
			['unicode', 'Unicode & fonts'],
			['next-steps', 'Next steps']
		],
		body: `${heading('first-document', 'Save a receipt in Node.js or Bun')}
<p>Install the package, save the example as <code>receipt.mjs</code>, and run it. It uses ASCII text and built-in Helvetica, so no font files are needed.</p>
${code('npm install minkpdf', 'Terminal')}
${code(receiptExample, 'receipt.mjs')}
${code('node receipt.mjs\n# Or: bun receipt.mjs', 'Terminal')}
<p>You now have <code>receipt.pdf</code> in the current working directory. <code>getBuffer()</code> returns a <code>Uint8Array</code> that Node’s <code>writeFile()</code> accepts directly.</p>
${note('Use ES modules', 'The package ships ESM. Use a <code>.mjs</code> file, or set <code>"type": "module"</code> in your application’s <code>package.json</code>. A browser app can use its existing bundler.')}
${heading('browser-download', 'Download in a browser')}
<p>Add a download button, then include the JavaScript in your bundled browser application. The object URL is released after the download is started.</p>
${code('<button id="download-pdf" type="button">Download receipt</button>', 'HTML')}
${code(browserExample, 'JavaScript · browser')}
<p>Without a bundler, serve the built <code>dist/</code> module tree over HTTP(S) and import its <code>index.js</code>. Preserve relative module paths. See <a href="installation.html#without-bundler">installation without a bundler</a>.</p>
${heading('unicode', 'Add Unicode with an embedded font')}
<p>Helvetica supports ASCII. For names like José or currency symbols like ₱, register a TrueType font that contains the requested characters. Put <code>Inter-Regular.ttf</code> and <code>Inter-Bold.ttf</code> in a local <code>fonts/</code> directory.</p>
${code(fontExample, 'unicode-receipt.mjs')}
<p>Run <code>node unicode-receipt.mjs</code> or <code>bun unicode-receipt.mjs</code>. Font paths are relative to the working directory. Supply and license your own font files; the npm package does not include the repository’s Inter fixtures.</p>
<p>In a browser, fetch the font yourself and pass <code>new Uint8Array(await response.arrayBuffer())</code> to <code>addVirtualFileSystem()</code>. Check <code>response.ok</code> before reading the response.</p>
${note('Register every variant you use', 'Register <code>normal</code>, <code>bold</code>, <code>italics</code>, and <code>bolditalics</code> as needed. A missing variant throws an error; it does not fall back to the normal font.')}
${heading('next-steps', 'Build a more useful document')}
<p>Add <a href="api.html#tables">tables with repeated headers</a>, <a href="api.html#pages">page numbers</a>, or <a href="api.html#styles">named styles</a>. For smaller bundles, choose <a href="installation.html#optional-features">optional feature imports</a>.</p>`
	},
	{
		slug: 'installation',
		title: 'Installation',
		group: 'Guides',
		description:
			'Use built ES modules and TypeScript types in your application. No runtime package dependencies to install alongside MinkPDF.',
		sections: [
			['package-managers', 'Package managers'],
			['runtime', 'Runtime requirements'],
			['optional-features', 'Optional features'],
			['without-bundler', 'Without a bundler'],
			['development', 'From source']
		],
		body: `${heading('package-managers', 'Install the package')}
${code('npm install minkpdf\n# Or choose your package manager:\npnpm add minkpdf\nyarn add minkpdf\nbun add minkpdf', 'Terminal')}
<p>Use one command for your package manager. The package includes built JavaScript ES modules and TypeScript source types. Use ESM imports.</p>
${code(`import pdf from 'minkpdf';
import type { TDocumentDefinitions } from 'minkpdf/interfaces';

const definition: TDocumentDefinitions = { content: 'Hello' };
const bytes = await pdf.createPdf(definition).getBuffer();`)}
${heading('runtime', 'Runtime requirements')}
<p>The engine uses native <code>CompressionStream</code> with <code>deflate</code>, <code>Blob</code>, <code>Response</code>, <code>TextEncoder</code>, <code>atob</code>, and <code>btoa</code>. PNG decoding also needs <code>DecompressionStream</code>.</p>
${table(
	['Runtime', 'Verified in this repository'],
	[
		['Bun 1.4.0', 'Full-engine tests and README file-generation examples'],
		[
			'Bun 1.4.2',
			'Full suite including feature regressions, packed-package, and consumer tree-shaking checks'
		],
		['Node.js 24.12.0', 'README file-generation examples using the built ES modules'],
		[
			'Chromium',
			'Manual browser verification: printable-PDF navigation and closed-target URL cleanup; lifecycle unit tests cover printing'
		]
	]
)}
<p>These are recorded verified versions as of 8 October 2026, not minimum version guarantees. Bun is needed to build this repository, but consumers use the built ES modules.</p>
${heading('optional-features', 'Include only the capabilities you need')}
<p>The root import enables every supported feature. For ASCII text with Helvetica, use <code>minkpdf/core</code>.</p>
${code(`import { createPdf } from 'minkpdf/core';

const bytes = await createPdf({ content: 'Hello' }).getBuffer();`)}
<p>For a report with tables and Unicode text, compose an independent engine with two features.</p>
${code(`import { createPdfEngine } from 'minkpdf/core';
import { tables } from 'minkpdf/tables';
import { trueTypeFonts } from 'minkpdf/truetype';

const pdf = createPdfEngine({ features: [tables(), trueTypeFonts()] });
// Register fonts on this engine before requesting a Unicode PDF.`)}
${table(
	['Import', 'What it provides'],
	[
		['<code>minkpdf</code>', 'Full engine: core, tables, images, and TrueType fonts'],
		[
			'<code>minkpdf/core</code>',
			'<code>createPdf()</code>, <code>createPdfEngine()</code>, engine/document/feature types'
		],
		['<code>minkpdf/tables</code>', '<code>tables()</code> feature factory'],
		['<code>minkpdf/images</code>', '<code>images()</code> feature factory'],
		['<code>minkpdf/truetype</code>', '<code>trueTypeFonts()</code> feature factory'],
		['<code>minkpdf/interfaces</code>', 'Document definition types; use <code>import type</code>']
	]
)}
<p>Application bundlers remove unreferenced modules. Feature selection happens when creating the engine; it is not inferred from runtime document content. See the <a href="benchmarks.html#optional-features">measured consumer bundle sizes</a>.</p>
${heading('without-bundler', 'Serve ES modules without a bundler')}
<p>Build the repository or obtain the package’s built <code>dist/</code> directory. Copy the entire module tree to your static server, for example under <code>/vendor/minkpdf/</code>. Keep the nested folders and relative imports intact.</p>
${code(
	`<script type="module">
  import pdf from './vendor/minkpdf/index.js';
  const blob = await pdf.createPdf({ content: 'Hello' }).getBlob();
  console.log(blob.type); // application/pdf
</script>`,
	'HTML'
)}
<p>Serve the page over HTTP(S). A bare import such as <code>'minkpdf'</code> needs a bundler or import map. Copying only <code>index.js</code> will lose the shared modules it imports.</p>
${heading('development', 'Build from source')}
${code('git clone https://github.com/accntech/minkpdf.git\ncd minkpdf\n# Use Bun 1.4.2, matching packageManager\nbun run build', 'Terminal')}
<p>To run the engine tests, install Poppler (<code>pdfinfo</code>, <code>pdftotext</code>, and <code>pdfimages</code>) first.</p>
${code('# macOS\nbrew install poppler\n# Debian / Ubuntu\nsudo apt-get install poppler-utils\n\nbun test', 'Terminal')}
<p>Package and tree-shaking checks use pinned tooling in temporary consumers and require Node.js, npm, and registry access. See the <a href="https://github.com/accntech/minkpdf/blob/main/CONTRIBUTING.md">contributing guide</a> for the complete development workflow.</p>`
	},
	{
		slug: 'api',
		title: 'API reference',
		group: 'Reference',
		description:
			'Define a document, register resources, and request output. All dimensions use PDF points: 72 points equal one inch.',
		sections: [
			['create-pdf', 'createPdf'],
			['output', 'Output methods'],
			['engine', 'createPdfEngine'],
			['definition', 'Document definition'],
			['styles', 'Text & styles'],
			['positioning', 'Positioned content'],
			['containers', 'Stacks & columns'],
			['tables', 'Tables'],
			['resources', 'Fonts & resources'],
			['images', 'Images'],
			['pages', 'Pages & decorations'],
			['errors', 'Errors & limits']
		],
		body: `${heading('create-pdf', 'createPdf(definition)')}
${code(`import pdf, { createPdf } from 'minkpdf';
import type { TDocumentDefinitions } from 'minkpdf/interfaces';
import type { PdfDocument } from 'minkpdf/core';

// Signature: createPdf(definition: TDocumentDefinitions): PdfDocument
const document = createPdf({ content: 'Hello' });
const bytes = await document.getBuffer();`)}
<p>The root default object and named exports share one full-feature engine. <code>createPdf()</code> accepts one document definition and returns a <code>PdfDocument</code>. Rendering begins on the first output request; later requests reuse the same rendered PDF.</p>
${heading('output', 'Output methods')}${outputs}
<p>The four byte/Blob output methods take no arguments and share one cached render. <code>print(target?: Window | null)</code> is browser-only and separately caches a printable render. Rendering errors reject their promises. File writing and downloading remain application responsibilities.</p>
${code(`button.addEventListener('click', async () => {
  const target = window.open('', '_blank');
  if (!target) throw new Error('Print window blocked');
  await pdf.createPdf(definition).print(target);
});`)}
<p>Call <code>print()</code> directly from a user gesture, or pass a window opened during that gesture before fetching report data. With no target, MinkPDF opens a window synchronously before rendering. The promise resolves after navigation to the printable PDF, not after the user prints. Automatic printing depends on the PDF viewer honoring the print OpenAction. Object URLs are released on an <code>afterprint</code> event or when the target closes. A blocked popup or closed target rejects; a window created by MinkPDF closes on failure. Ordinary output methods never include a print action.</p>
${heading('engine', 'createPdfEngine(options)')}
${code(`import { createPdfEngine } from 'minkpdf/core';
import { tables } from 'minkpdf/tables';
import { images } from 'minkpdf/images';
import { trueTypeFonts } from 'minkpdf/truetype';

const pdf = createPdfEngine({
  features: [tables(), images(), trueTypeFonts()]
});`)}
<p>Signature: <code>createPdfEngine(options?: { features?: readonly PdfFeature[] }): PdfEngine</code>. The default is core only. Every engine has independent font dictionaries, virtual files, custom table layouts, and parsed-font caches. Register resources on the engine that creates the document.</p>
<p>Features are fixed at construction; duplicate descriptors throw immediately. Core includes text, Helvetica variants, stacks, columns, pagination, headers/footers, metadata, watermarks, and canvas lines.</p>
${heading('definition', 'Document definition')}
${table(
	['Property', 'Type / behavior'],
	[
		[
			'<code>content</code> <span class="required">required</span>',
			'<code>Content</code>: string, number, content node, or array of content'
		],
		[
			'<code>pageSize</code>',
			"<code>'A4' | 'LETTER' | 'LEGAL' | { width, height }</code>; default A4"
		],
		['<code>pageOrientation</code>', "<code>'portrait' | 'landscape'</code>; default portrait"],
		['<code>pageMargins</code>', '<code>Margins</code>; default 40 points on every side'],
		['<code>defaultStyle</code>', '<code>Style</code> applied throughout the document'],
		['<code>styles</code>', '<code>Record&lt;string, Style&gt;</code> for named styles'],
		[
			'<code>info</code>',
			'Optional <code>title</code>, <code>author</code>, <code>subject</code>, <code>keywords</code>, <code>creator</code> strings'
		],
		[
			'<code>header</code>, <code>footer</code>',
			'<code>Content</code> or <code>(page, total, size) =&gt; Content</code>; page numbers are one-based'
		],
		[
			'<code>watermark</code>',
			'String or <code>{ text, color?, opacity?, bold?, italics?, fontSize?, angle? }</code>'
		]
	]
)}
<p><code>Margins</code> is a number for all sides, <code>[horizontal, vertical]</code>, or <code>[left, top, right, bottom]</code>. A <code>Size</code> is a number, <code>'auto'</code>, <code>'*'</code>, or a percentage string such as <code>'30%'</code>.</p>
${heading('styles', 'Text and styles')}
${code(`const definition = {
  styles: {
    title: { fontSize: 20, bold: true, color: '#d94248' },
    muted: { color: '#667085' }
  },
  content: [
    { text: 'Sales report', style: 'title', margin: [0, 0, 0, 12] },
    { text: ['Total: ', { text: 'USD 100.00', bold: true }] },
    { text: 'Prepared today', style: ['muted'], italics: true }
  ]
};`)}
${table(
	['Style fields', 'Accepted values'],
	[
		[
			'<code>font</code>, <code>fontSize</code>',
			'Registered family name (default Helvetica); size in points (default 12)'
		],
		['<code>bold</code>, <code>italics</code>', 'Booleans selecting font variants'],
		[
			'<code>color</code>, <code>fillColor</code>',
			'Three- or six-digit hex colors and case-insensitive CSS named colors, e.g. <code>#eee</code>, <code>red</code>, or <code>lightgray</code>'
		],
		['<code>alignment</code>', "<code>'left' | 'center' | 'right'</code>"],
		['<code>lineHeight</code>', 'Numeric line-height multiplier'],
		['<code>characterSpacing</code>', 'Additional spacing in points'],
		['<code>noWrap</code>', 'Boolean preventing text wrapping'],
		['<code>margin</code>', '<code>Margins</code>'],
		[
			'<code>marginLeft</code>, <code>marginTop</code>, <code>marginRight</code>, <code>marginBottom</code>',
			'Per-side margins in points; negative values are supported'
		],
		['<code>decoration</code>', "<code>'underline' | 'lineThrough' | 'overline'</code>"],
		['<code>fillOpacity</code>', 'Numeric opacity for fills']
	]
)}
<p>Named styles resolve in array order; node properties override them. Margins and cell fills from named styles apply to the styled node without leaking into children. Per-side margins override the corresponding named-style sides. An explicit node <code>margin</code> takes precedence over its per-side properties.</p>
${heading('positioning', 'Positioned content')}
${code(`const definition = {
  pageMargins: 0,
  content: [
    { text: 'INV-001', absolutePosition: { x: 300, y: 30 } },
    { text: 'Customer', absolutePosition: { x: 40, y: 90 } },
    { text: 'Offset label', relativePosition: { x: 20, y: -10 } },
    'Normal flow continues at the original cursor'
  ]
};`)}
<p><code>absolutePosition: { x, y }</code> anchors content to the top-left of the current page, independent of page margins and enclosing columns or cells. Text wraps within the remaining page width; explicit column widths and <code>noWrap</code> remain available for preprinted forms. <code>relativePosition: { x, y }</code> offsets the current flow cursor. Both use points, ignore their own margins, and leave the flow cursor unchanged. Positioned content stays on the current page; it is not automatically paginated and should fit inside that page.</p>
${heading('containers', 'Stacks and columns')}
<p>An array of content acts as a vertical stack. Use <code>stack</code> for an explicitly styled container or <code>columns</code> for side-by-side content, with optional <code>columnGap</code> and per-column <code>width</code>.</p>
${code(`const definition = {
  content: [{
    columns: [
      { width: '*', stack: ['Customer', { text: 'Ada Lovelace', bold: true }] },
      { width: 120, text: 'Invoice 001', alignment: 'right' }
    ],
    columnGap: 16
  }]
};`)}
<p>Use <code>pageBreak: 'before' | 'after'</code> for explicit breaks and <code>unbreakable: true</code> for grouped content. Oversized content still needs to fit the page’s available area.</p>
${heading('tables', 'Tables')}
${code(`import pdf from 'minkpdf';

const report = pdf.createPdf({
  pageMargins: [40, 40, 40, 60],
  defaultStyle: { fontSize: 10 },
  footer: (page, total) => ({
    text: 'Page ' + page + ' of ' + total,
    alignment: 'center', fontSize: 8, margin: [0, 12, 0, 0]
  }),
  content: [{
    table: {
      headerRows: 1,
      dontBreakRows: true,
      widths: ['*', 100],
      body: [
        [{ text: 'Item', bold: true }, { text: 'Amount', bold: true }],
        ...Array.from({ length: 100 }, (_, i) => [
          'Item ' + (i + 1), { text: '123.45', alignment: 'right' }
        ])
      ]
    }
  }]
});`)}
${table(
	['Table property', 'Behavior'],
	[
		['<code>body</code>', 'Required array of rows; cells are strings or content nodes'],
		['<code>widths</code>', '<code>Size[]</code> for fixed, automatic, star, or percentage widths'],
		['<code>headerRows</code>', 'Number of first rows repeated when a table spans pages'],
		['<code>keepWithHeaderRows</code>', 'Number of body rows kept with the header'],
		['<code>dontBreakRows</code>', 'Keep fitting rows together across page boundaries'],
		['<code>heights</code>', 'Number, number array, or <code>(row) =&gt; number</code>']
	]
)}
<p>Cells support nested content, <code>fillColor</code>, <code>fillOpacity</code>, <code>border: [left, top, right, bottom]</code>, <code>colSpan</code>, and <code>rowSpan</code>. Supply empty placeholder cells for every covered position, including later rows. Row and column spans can be combined. Merged fills and borders cover the full cell, and its content is drawn once. Connected row spans stay together when they fit; oversized groups split with their borders and fills. Spans must stay within the table and cannot cross the repeated-header boundary.</p>
${code(`const definition = {
  content: { table: {
    widths: [80, '*', '*'],
    body: [
      [{ text: 'Name', rowSpan: 2 }, 'GARCÍA', 'JOSÉ'],
      [{}, 'Last name', 'First name'],
      [{ text: 'Address', colSpan: 3 }, {}, {}]
    ]
  } }
};`)}
<p>A table node’s <code>layout</code> can be a named layout or a <code>CustomTableLayout</code>. Register named layouts with <code>addTableLayouts(dictionary)</code>. The built-in <code>noBorders</code> layout removes borders; other named layouts must be registered explicitly.</p>
${code(`pdf.addTableLayouts({
  compact: {
    hLineWidth: (index, node) => index === 0 ? 0 : 0.5,
    vLineWidth: () => 0,
    hLineColor: () => '#ddd',
    paddingTop: () => 3,
    paddingBottom: () => 3
  }
});
// Use layout: 'compact' alongside table: { body: ... }.`)}
<p>Custom layouts also accept <code>vLineColor</code>, <code>paddingLeft</code>, <code>paddingRight</code>, <code>fillColor(row, node, column)</code> returning a supported color or <code>null</code>, and <code>defaultBorder</code>. Other line/padding callbacks receive <code>(index, node)</code>.</p>
${heading('resources', 'Fonts and resources')}
${table(
	['Engine member', 'Signature and behavior'],
	[
		[
			'<code>addVirtualFileSystem(vfs)</code>',
			'<code>(Record&lt;string, string | Uint8Array&gt;) =&gt; void</code>. Merge base64 strings (without data URL prefixes) or byte arrays. Replacing a file invalidates its parsed-font cache.'
		],
		[
			'<code>addFonts(dictionary)</code>',
			'<code>(TFontDictionary) =&gt; void</code>. Merge registered font families.'
		],
		[
			'<code>fonts</code>',
			'<code>TFontDictionary</code>. Assigning a new dictionary replaces its contents; existing references preserve their identity.'
		],
		[
			'<code>addTableLayouts(dictionary)</code>',
			'<code>(Record&lt;string, CustomTableLayout&gt;) =&gt; void</code>. Merge named table layouts.'
		]
	]
)}
${code(`pdf.addVirtualFileSystem({ 'Inter-Regular.ttf': fontBytes });
pdf.addFonts({ Inter: { normal: 'Inter-Regular.ttf' } });

// Replacement, rather than merging:
pdf.fonts = { Inter: { normal: 'Inter-Regular.ttf' } };`)}
<p>Font dictionaries map family names to <code>{ normal, bold?, italics?, bolditalics? }</code>, with filenames pointing to registered virtual files. Embedded fonts must include the requested characters. Resources are shared among documents created by the same engine. MinkPDF does not fetch files automatically.</p>
<p>Font registration requires <code>trueTypeFonts()</code>; custom table-layout registration requires <code>tables()</code>. Both are already enabled by the root import. See the <a href="getting-started.html#unicode">complete Unicode example</a>.</p>
${heading('images', 'Images')}
<p>The image node accepts a PNG or JPEG base64 data URL. Use <code>width</code>, <code>height</code>, or <code>fit: [width, height]</code> to size it. Add <code>images()</code> to a core engine, and <code>tables()</code> if placing images in table cells.</p>
${code(`import pdf from 'minkpdf';

const logo = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAACklEQVR4nGMAAQAABQABDQottAAAAABJRU5ErkJggg==';
const document = pdf.createPdf({
  content: [{ image: logo, fit: [40, 40] }, 'Receipt']
});`)}
<p>PNG support includes non-interlaced 8-bit grayscale, RGB, indexed, grayscale-alpha, and RGBA images with transparency. Paths, URLs, and SVG are outside the documented image API.</p>
${heading('pages', 'Pages, headers, and decorations')}
${code(`const definition = {
  pageSize: 'A4',
  pageOrientation: 'portrait',
  pageMargins: [40, 60, 40, 60],
  info: { title: 'Draft report', author: 'Finance team' },
  header: { text: 'Monthly report', margin: [40, 20, 0, 0] },
  footer: (page, total, size) => ({
    text: 'Page ' + page + ' of ' + total,
    alignment: 'center', fontSize: 8, margin: [0, 12, 0, 0]
  }),
  watermark: { text: 'DRAFT', opacity: 0.15, color: '#d94248' },
  content: [
    'Summary',
    { canvas: [{ type: 'line', x1: 0, y1: 8, x2: 240, y2: 8,
                lineWidth: 0.5, lineColor: '#ddd' }] },
    { text: 'Details', pageBreak: 'before' }
  ]
};`)}
<p>Header/footer callbacks receive the final total page count and <code>size: { width, height, orientation }</code>. Reserve sufficient top and bottom margins for them. Canvas supports lines with optional width and supported colors; arbitrary shapes are unsupported.</p>
${heading('errors', 'Errors and supported limits')}
${code(`try {
  const bytes = await pdf.createPdf(definition).getBuffer();
  // Store or send the PDF bytes.
} catch (error) {
  console.error('PDF generation failed:', error);
}`)}
<p>Missing capabilities, unregistered fonts or variants, invalid colors, and margins that leave no content area produce errors. Duplicate feature descriptors and resource registration on disabled capabilities throw synchronously; render failures reject output promises.</p>
<p>SVG, QR codes, lists, attachments, encryption, PDF/A, and complex-script shaping are outside the supported API. CSS color functions such as <code>rgb()</code>, eight-digit hex colors, <code>transparent</code>, and <code>currentColor</code> are unsupported; use <code>fillOpacity</code> or watermark opacity for transparency. See the <a href="comparison.html#compatibility">pdfmake comparison</a> for migration limits and <a href="https://github.com/accntech/minkpdf/blob/main/src/interfaces.ts">public interface definitions</a> for the complete types.</p>`
	},
	{
		slug: 'comparison',
		title: 'MinkPDF & pdfmake',
		group: 'Reference',
		description:
			'A familiar document-definition model, a smaller supported surface. Understand what carries over and what your application needs to adapt.',
		sections: [
			['shared-model', 'Shared document model'],
			['implementation', 'Implementation comparison'],
			['output-migration', 'Output migration'],
			['fonts-migration', 'Font registration'],
			['compatibility', 'Compatibility'],
			['migration-checklist', 'Migration checklist']
		],
		body: `${note('Comparison baseline', 'The benchmark uses pdfmake <strong>0.3.11</strong>. Migration examples below target the pdfmake 0.3 browser API, whose output methods return promises. Older callback-based integrations need to adapt to MinkPDF’s asynchronous methods.')}
${heading('shared-model', 'Keep the document definition')}
<p>Supported text, named styles, tables, and header/footer definitions follow a familiar model. The same definition can be passed to each engine, but line metrics and pagination can differ.</p>
${code(`const definition = {
  content: [
    { text: 'Invoice', bold: true, fontSize: 18 },
    { table: { widths: ['*', 100], body: [
      ['Description', 'Amount'], ['Consulting', 'USD 100.00']
    ] } }
  ]
};`)}
${heading('implementation', 'How the implementations differ')}
${table(
	['Area', 'MinkPDF', 'pdfmake 0.3.11'],
	[
		[
			'Engine',
			'Own layout, pagination, TrueType subsetting, and PDF serialization',
			'Uses PDFKit, linebreak, and xmldoc as runtime package dependencies'
		],
		[
			'Entry points',
			'Built ESM; full root or core + optional feature factories',
			'Client build and server entry point; separate default font assets for the browser'
		],
		[
			'Capabilities',
			'Select tables, images, and TrueType at engine construction',
			'Broader document-definition surface'
		],
		[
			'Document creation',
			'<code>createPdf(definition)</code>',
			'<code>createPdf(definition, options?)</code> in 0.3'
		],
		[
			'Binary output',
			'<code>await getBuffer()</code> → <code>Uint8Array</code>',
			'Promise-based buffer, Blob, base64, data URL, and stream methods'
		],
		[
			'Download / open / print',
			'<code>print(target?)</code>; use returned bytes or Blob for download/open',
			'Client methods <code>download()</code>, <code>open()</code>, and <code>print()</code>'
		],
		[
			'Server file output',
			'<code>writeFile(path, await getBuffer())</code>',
			'<code>write(path)</code> on the server-side document'
		],
		[
			'Fonts',
			'ASCII Helvetica by default; register TrueType bytes or base64 for Unicode',
			'Default browser setup includes Roboto virtual font assets; custom fonts supported'
		]
	]
)}
<p class="source-note">pdfmake sources: <a href="https://github.com/bpampuch/pdfmake/blob/0.3.11/package.json">0.3.11 manifest</a>, <a href="https://pdfmake.github.io/docs/0.3/getting-started/client-side/">browser setup</a>, <a href="https://pdfmake.github.io/docs/0.3/getting-started/client-side/methods/">client methods</a>, and <a href="https://pdfmake.github.io/docs/0.3/getting-started/server-side/">server setup</a>.</p>
${heading('output-migration', 'Adapt the output step')}
<div class="comparison-code"><div><h3>pdfmake · browser bytes</h3>${code(
			`import pdfMake from 'pdfmake/build/pdfmake.js';
import pdfFonts from 'pdfmake/build/vfs_fonts.js';

pdfMake.addVirtualFileSystem(pdfFonts);
const bytes = await pdfMake
  .createPdf(definition).getBuffer();`,
			'JavaScript'
		)}</div><div><h3>MinkPDF · browser bytes</h3>${code(
			`import pdf from 'minkpdf';

// ASCII + built-in Helvetica
const bytes = await pdf
  .createPdf(definition).getBuffer();
// Embed a TrueType font for Unicode.`,
			'JavaScript'
		)}</div></div>
<p>For downloads, replace <code>pdfMake.createPdf(definition).download('invoice.pdf')</code> with <code>getBlob()</code> and an object URL. The <a href="getting-started.html#browser-download">complete browser example</a> includes cleanup. Browser <code>print(target?)</code> supports the same preopened-window pattern as pdfmake 0.3. MinkPDF has no <code>download()</code>, <code>open()</code>, <code>write()</code>, or <code>getStream()</code> helpers.</p>
${heading('fonts-migration', 'Register files explicitly')}
<p>For a matching font, supply the same TrueType bytes and variants to both engines. In MinkPDF, map virtual filenames to bytes or base64, then register the font dictionary and set <code>defaultStyle.font</code>.</p>
${code(`pdf.addVirtualFileSystem({ 'Inter-Regular.ttf': fontBytes });
pdf.addFonts({ Inter: { normal: 'Inter-Regular.ttf' } });
const document = pdf.createPdf({
  defaultStyle: { font: 'Inter' },
  content: 'José García · ₱100'
});`)}
<p><code>addFonts()</code> merges families; assigning <code>pdf.fonts</code> replaces them. Register every variant your document uses. Supply local or fetched bytes yourself; URL and filesystem font fetching are not part of MinkPDF’s registration API.</p>
${heading('compatibility', 'Compatibility at a glance')}
${table(
	['Document capability', 'MinkPDF status'],
	[
		[
			'Styled text, stacks, columns, named styles',
			'<span class="status supported">Supported</span> · left, center, and right alignment'
		],
		[
			'Tables, repeated headers, row/column spans, custom layouts',
			'<span class="status supported">Supported</span> · spans cannot cross the repeated-header boundary'
		],
		[
			'Page breaks, headers/footers, metadata, watermarks',
			'<span class="status supported">Supported</span> · canvas is limited to lines'
		],
		[
			'TrueType fonts and searchable Unicode text',
			'<span class="status supported">Supported</span> · requires a font containing the characters'
		],
		[
			'PNG / JPEG base64 data URLs',
			'<span class="status supported">Supported</span> · PNG limits are documented in the API'
		],
		[
			'Absolute/relative positioning, per-side margins, named colors',
			'<span class="status supported">Supported</span> · positioned nodes do not advance flow'
		],
		['SVG, QR codes, lists', '<span class="status unsupported">Outside the API</span>'],
		['Attachments, encryption, PDF/A', '<span class="status unsupported">Outside the API</span>'],
		['Complex-script shaping', '<span class="status unsupported">Outside the API</span>'],
		[
			'Pixel-identical layout with pdfmake',
			'<span class="status unsupported">Not guaranteed</span> · metrics and pagination differ'
		]
	]
)}
${heading('migration-checklist', 'Before switching an application')}
<ol><li>Inventory the document features and output helpers your app uses.</li><li>Check the supported types, colors, image formats, and font variants.</li><li>Start with the full root import, then choose optional features if bundle size matters.</li><li>Adapt downloads, file writes, and any callback-based output handling.</li><li>Render representative real documents. Check text, totals, page breaks, and visual output.</li><li>Measure your own workload. Use the <a href="benchmarks.html">recorded benchmarks</a> as a reference, not a prediction.</li></ol>`
	},
	{
		slug: 'benchmarks',
		title: 'Benchmark results',
		group: 'Reference',
		description:
			'Explore recorded render times and browser bundle sizes. Real documents, visible methodology, and the raw data behind every chart.',
		sections: [
			['render-time', 'Render performance'],
			['measurements', 'All measurements'],
			['engine-size', 'Engine comparison'],
			['optional-features', 'Optional features'],
			['methodology', 'Methodology'],
			['reproduce', 'Reproduce results']
		],
		body: benchmarkContent()
	}
];
