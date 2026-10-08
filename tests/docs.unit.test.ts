import { afterAll, expect, test } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runInNewContext } from 'node:vm';

const output = mkdtempSync(join(tmpdir(), 'minkpdf-docs-'));
const root = new URL('../', import.meta.url).pathname;
const pages = ['index', 'getting-started', 'installation', 'api', 'comparison', 'benchmarks'];
let building: Promise<{ status: number; error: string }> | undefined;
function build() {
	return (building ??= (async () => {
		const process = Bun.spawn([Bun.which('bun')!, 'scripts/build-docs.ts', `--outdir=${output}`], {
			cwd: root,
			stdout: 'ignore',
			stderr: 'pipe'
		});
		return { status: await process.exited, error: await new Response(process.stderr).text() };
	})());
}
afterAll(() => rmSync(output, { recursive: true, force: true }));

test('documentation build produces all six static pages', async () => {
	const result = await build();
	expect(result.error).toBe('');
	expect(result.status).toBe(0);
	for (const name of pages) {
		const html = await Bun.file(join(output, `${name}.html`)).text();
		expect(html).toContain('<main id="main">');
		expect(html).toContain('<h1');
		expect(html).toContain('aria-current="page"');
	}
	expect(await Bun.file(join(output, '.nojekyll')).exists()).toBe(true);
});

test('every local link and fragment resolves under a GitHub project subpath', async () => {
	await build();
	for (const name of pages) {
		const html = await Bun.file(join(output, `${name}.html`)).text();
		const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]);
		expect(new Set(ids).size).toBe(ids.length);
		for (const match of html.matchAll(/\b(?:href|src)="([^"]+)"/g)) {
			const value = match[1];
			if (/^(https?:|mailto:|data:)/.test(value)) continue;
			expect(value.startsWith('/')).toBe(false);
			const [file, fragment] = value.split('#');
			const target = Bun.file(join(output, file || `${name}.html`));
			expect(await target.exists()).toBe(true);
			if (fragment) expect(await target.text()).toContain(`id="${fragment}"`);
		}
	}
});

test('render charts preserve recorded values for every metric and both engines', async () => {
	await build();
	const report = await Bun.file(join(root, 'docs/site/data/2026-10-08-render-benchmarks.json')).json();
	const html = await Bun.file(join(output, 'benchmarks.html')).text();
	for (const metric of ['medianMs', 'p95Ms', 'firstMs', 'pdfBytes']) {
		for (const row of report.results) {
			expect(html).toContain(
				`data-key="${row.scenario}:${row.engine}:${metric}" data-value="${row[metric]}"`
			);
		}
	}
	expect(html.replace(/<[^>]*>/g, '')).toContain('33 / 34');
	expect(html).toContain('not a performance guarantee');
	const published = await Bun.file(join(output, 'data/2026-10-08-render-benchmarks.json')).json();
	expect(published).toEqual(report);
});

test('bundle charts describe the current feature implementation and measured runtime', async () => {
	await build();
	const report = await Bun.file(
		join(root, 'docs/site/data/2026-10-08-bundle-benchmarks.json')
	).json();
	const html = await Bun.file(join(output, 'benchmarks.html')).text();
	for (const [name, size] of Object.entries(report.sizes) as [
		string,
		{ raw: number; gzip: number }
	][]) {
		for (const metric of ['raw', 'gzip'] as const)
			expect(html).toContain(`data-key="${name}:${metric}" data-value="${size[metric]}"`);
	}
	expect(html).toContain('current full-feature implementation');
	expect(html).toContain('Bun 1.4.2');
});

test('API and migration docs cover supported features and their limits', async () => {
	await build();
	const api = await Bun.file(join(output, 'api.html')).text();
	for (const value of [
		'print(target?)',
		'absolutePosition',
		'relativePosition',
		'marginTop',
		'rowSpan',
		'CSS named colors'
	])
		expect(api).toContain(value);
	expect(api).toContain('repeated-header boundary');
	expect(api).not.toContain('Row spans are unsupported');
	const comparison = await Bun.file(join(output, 'comparison.html')).text();
	expect(comparison).toContain('print(target?)');
	expect(comparison).not.toContain('row spans are excluded');
});

test('documentation initializes the enhanced layout before paint and ships local search assets', async () => {
	await build();
	for (const name of pages) {
		const html = await Bun.file(join(output, `${name}.html`)).text();
		const bootstrap = html.indexOf("document.documentElement.classList.add('js-enabled')");
		expect(bootstrap).toBeGreaterThan(0);
		expect(bootstrap).toBeLessThan(html.indexOf('rel="stylesheet"'));
		expect(html).toContain('id="search-dialog"');
		expect(html).toContain('data-solar="magnifier-linear"');
		expect(html).toContain('data-solar="book-bookmark-linear"');
	}
	for (const file of ['assets/search.js', 'assets/navigation.js', 'assets/search-index.json'])
		expect(await Bun.file(join(output, file)).exists()).toBe(true);
});

test('LLM documentation includes every page, intact examples, API tables, and resolvable links', async () => {
	await build();
	const file = Bun.file(join(output, 'llms-full.txt'));
	expect(await file.exists()).toBe(true);
	const text = await file.text();
	const { pages: content, receiptExample } = await import('../docs/site/content');
	const indexFile = Bun.file(join(output, 'llms.txt'));
	expect(await indexFile.exists()).toBe(true);
	const index = await indexFile.text();
	expect(index).toContain('[Full documentation](llms-full.txt)');
	expect(index.length).toBeLessThan(text.length / 4);
	expect(index).not.toContain('```');
	for (const page of content) expect(index).toContain(`](${page.slug}.html)`);
	for (const page of content) expect(text).toContain(`## ${page.title}`);
	expect(text).toContain(receiptExample);
	expect(text).toContain('Promise<Uint8Array>');
	expect(text).toContain('33 / 34');
	expect(text).toContain('not a performance guarantee');
	const prose = text.replace(/^(`{3,})[^\n]*\n[\s\S]*?^\1$/gm, '');
	expect(prose).not.toMatch(/<(?:svg|span|div|table|script)\b|&(?:lt|gt|amp|quot);/);
	expect(text).toContain("'A4' \\| 'LETTER' \\| 'LEGAL'");
	for (const match of (index + '\n' + text).matchAll(/\]\(([^)]+)\)/g)) {
		if (/^https?:/.test(match[1])) continue;
		const [path, fragment] = match[1].split('#');
		const target = Bun.file(join(output, path));
		expect(await target.exists()).toBe(true);
		if (fragment) expect(await target.text()).toContain(`id="${fragment}"`);
	}
});

test('theme is restored before paint and falls back to the system when storage is unavailable', async () => {
	await build();
	for (const name of pages) {
		const html = await Bun.file(join(output, `${name}.html`)).text();
		const bootstrap = html.match(/<script>([\s\S]*?)<\/script>/)![1];
		for (const [saved, systemDark, expected] of [
			['dark', false, 'dark'],
			['light', true, 'light'],
			[null, true, 'dark'],
			[null, false, 'light'],
			['invalid', true, 'dark'],
			['blocked', true, 'dark']
		] as const) {
			const element = { classList: { add() {} }, dataset: {} as Record<string, string> };
			runInNewContext(bootstrap, {
				document: { documentElement: element },
				localStorage: {
					getItem() {
						if (saved === 'blocked') throw new Error('Storage blocked');
						return saved;
					}
				},
				matchMedia: () => ({ matches: systemDark })
			});
			expect(element.dataset.theme).toBe(expected);
		}
	}
});

test('section search finds API methods, multiple terms and Unicode without indexing HTML markup', async () => {
	await build();
	const file = Bun.file(join(output, 'assets/search-index.json'));
	expect(await file.exists()).toBe(true);
	const index = await file.json();
	const { searchDocuments } = await import('../docs/site/search.js');
	const results = searchDocuments(index, 'getBuffer()');
	expect(results[0].url).toBe('api.html#output');
	expect(results.some((row: { url: string }) => row.url === 'api.html#output')).toBe(true);
	expect(searchDocuments(index, 'PNG transparency')[0].url).toBe('api.html#images');
	expect(searchDocuments(index, 'getting started')[0].url).toBe('getting-started.html');
	expect(
		searchDocuments(index, 'jose').some((row: { url: string }) => row.url.endsWith('#unicode'))
	).toBe(true);
	expect(searchDocuments(index, 'nothing-matches-9281')).toEqual([]);
	expect(searchDocuments(index, '   ')).toEqual([]);
	for (const row of index) {
		expect(row.text).not.toMatch(/<\/?(?:h2|svg|span|div)\b|&(?:lt|gt|amp|quot);/);
		const [page, fragment] = row.url.split('#');
		const html = await Bun.file(join(output, page)).text();
		if (fragment) expect(html).toContain(`id="${fragment}"`);
	}
});

test('enhanced navigation intercepts only documentation in the same project directory', async () => {
	const file = Bun.file(join(root, 'docs/site/navigation.js'));
	expect(await file.exists()).toBe(true);
	const { canNavigateDocument } = await import('../docs/site/navigation.js');
	const current = 'https://accntech.github.io/minkpdf/api.html';
	const files = pages.map((name) => `${name}.html`);
	expect(canNavigateDocument('getting-started.html#unicode', current, files)).toBe(true);
	expect(canNavigateDocument('benchmarks.html', current, files)).toBe(true);
	expect(canNavigateDocument('https://example.com/api.html', current, files)).toBe(false);
	expect(canNavigateDocument('/api.html', current, files)).toBe(false);
	expect(canNavigateDocument('charts/medianMs.svg', current, files)).toBe(false);
	expect(canNavigateDocument('data/2026-10-08-render-benchmarks.json', current, files)).toBe(false);
	expect(canNavigateDocument('javascript:alert(1)', current, files)).toBe(false);
});

test('numeric text is monospace without changing identifiers, links, metadata or code', async () => {
	const { numericParts, monospaceNumbers } = await import('../docs/site/numbers.js');
	expect(numericParts('v0.1.0 A0.3.11 0.3beta')).toEqual([
		{ text: 'v0.1.0 A0.3.11 0.3beta', numeric: false }
	]);
	expect(
		numericParts('72 points; 1,234.50 bytes; 0.3.11; 95th percentile; −12%; M4 A4 Uint8Array')
	).toEqual([
		{ text: '72', numeric: true },
		{ text: ' points; ', numeric: false },
		{ text: '1,234.50', numeric: true },
		{ text: ' bytes; ', numeric: false },
		{ text: '0.3.11', numeric: true },
		{ text: '; ', numeric: false },
		{ text: '95th', numeric: true },
		{ text: ' percentile; ', numeric: false },
		{ text: '−12%', numeric: true },
		{ text: '; M4 A4 Uint8Array', numeric: false }
	]);
	const html =
		'<head><title>Version 0.3.11</title></head><p id="value-72">72 points &amp; &#39;33 / 34&#39;</p><a href="2026-10-08-render-benchmarks.json">20 results</a><code>const n = 40;</code><svg viewBox="0 0 24 24"><text>25</text></svg><script>const n = 42;</script>';
	const result = monospaceNumbers(html);
	expect(result).toContain(
		'<p id="value-72"><span class="number-value">72</span> points &amp; &#39;<span class="number-value">33</span> / <span class="number-value">34</span>&#39;</p>'
	);
	expect(result).toContain(
		'<a href="2026-10-08-render-benchmarks.json"><span class="number-value">20</span> results</a>'
	);
	for (const untouched of [
		'<title>Version 0.3.11</title>',
		'<code>const n = 40;</code>',
		'<svg viewBox="0 0 24 24"><text>25</text></svg>',
		'<script>const n = 42;</script>'
	])
		expect(result).toContain(untouched);
	await build();
	const benchmark = await Bun.file(join(output, 'benchmarks.html')).text();
	expect(benchmark).toMatch(/<td><span class="number-value">[\d,.]+<\/span><\/td>/);
	const api = await Bun.file(join(output, 'api.html')).text();
	expect(api).toContain('<span class="number-value">72</span> points');
	expect(await Bun.file(join(output, 'assets/numbers.js')).exists()).toBe(true);
});
