import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { pages } from '../docs/site/content';
import { charts, svgChart } from '../docs/site/charts';
import { template } from '../docs/site/template';
import { pagePath } from '../docs/site/routes';
import { buildSearchIndex } from '../docs/site/search-index';
import { monospaceNumbers } from '../docs/site/numbers.js';
import { buildLlmDocumentation, buildLlmIndex } from '../docs/site/llm';

const root = new URL('../', import.meta.url).pathname;
const argument = Bun.argv.find((value) => value.startsWith('--outdir='));
const output = resolve(argument?.slice('--outdir='.length) ?? resolve(root, '.site'));
// Write only known generated filenames; never remove a user-supplied directory.
mkdirSync(output, { recursive: true });
const metadata = await Bun.file(resolve(root, 'package.json')).json();
await Bun.write(resolve(output, 'llms.txt'), buildLlmIndex(pages, metadata.version));
await Bun.write(resolve(output, 'llms-full.txt'), buildLlmDocumentation(pages, metadata.version));
for (const page of pages) {
	const path = pagePath(page.slug);
	await Bun.write(
		resolve(output, path, 'index.html'),
		monospaceNumbers(template(page, metadata.version))
	);
	if (page.slug !== 'index')
		await Bun.write(
			resolve(output, `${page.slug}.html`),
			`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta http-equiv="refresh" content="0;url=${path}"><title>Redirecting…</title><script>location.replace(${JSON.stringify(path)} + location.search + location.hash);</script></head><body><a href="${path}">Continue to documentation</a></body></html>`
		);
}
for (const file of ['site.css', 'site.js', 'search.js', 'navigation.js', 'numbers.js'])
	await Bun.write(resolve(output, 'assets', file), Bun.file(resolve(root, 'docs/site', file)));
await Bun.write(resolve(output, 'assets/icon.png'), Bun.file(resolve(root, 'assets/icon.png')));
await Bun.write(
	resolve(output, 'assets/search-index.json'),
	JSON.stringify(buildSearchIndex(pages))
);
for (const file of ['2026-10-08-render-benchmarks.json', '2026-10-08-bundle-benchmarks.json'])
	await Bun.write(resolve(output, 'data', file), Bun.file(resolve(root, 'docs/site/data', file)));
for (const chart of charts)
	await Bun.write(resolve(output, 'charts', `${chart.id}.svg`), svgChart(chart));
await Bun.write(resolve(output, '.nojekyll'), '');
console.log(`Built ${pages.length} documentation pages and ${charts.length} charts in ${output}`);
