import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { pages } from '../docs/site/content';
import { charts, svgChart } from '../docs/site/charts';
import { template } from '../docs/site/template';
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
for (const page of pages)
	await Bun.write(
		resolve(output, `${page.slug}.html`),
		monospaceNumbers(template(page, metadata.version))
	);
for (const file of ['site.css', 'site.js', 'search.js', 'navigation.js', 'numbers.js'])
	await Bun.write(resolve(output, 'assets', file), Bun.file(resolve(root, 'docs/site', file)));
await Bun.write(resolve(output, 'assets/icon.png'), Bun.file(resolve(root, 'assets/icon.png')));
await Bun.write(
	resolve(output, 'assets/search-index.json'),
	JSON.stringify(buildSearchIndex(pages))
);
for (const file of ['2026-10-08.json', '2026-10-08-tree-shaking.json'])
	await Bun.write(resolve(output, 'data', file), Bun.file(resolve(root, 'docs/benchmarks', file)));
for (const chart of charts)
	await Bun.write(resolve(output, 'charts', `${chart.id}.svg`), svgChart(chart));
await Bun.write(resolve(output, '.nojekyll'), '');
console.log(`Built ${pages.length} documentation pages and ${charts.length} charts in ${output}`);
