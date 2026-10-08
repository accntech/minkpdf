import renderReport from './data/2026-10-08-render-benchmarks.json';
import bundleReport from './data/2026-10-08-bundle-benchmarks.json';
import { escape, heading, note, table } from './html';

type Bar = { label: string; value: number; key: string; series: 'mink' | 'baseline' };
export type Chart = {
	id: string;
	title: string;
	description: string;
	unit: string;
	bars: Bar[];
	grouped?: boolean;
};
export const metrics = [
	{
		id: 'medianMs',
		title: 'Warmed median',
		unit: 'ms',
		description: 'Median render time after three warmups. Lower is better.'
	},
	{
		id: 'p95Ms',
		title: '95th percentile',
		unit: 'ms',
		description: 'The 95th percentile of 20 warmed renders. Lower is better.'
	},
	{
		id: 'firstMs',
		title: 'First render',
		unit: 'ms',
		description: 'First render, including font parsing. Lower is better.'
	},
	{
		id: 'pdfBytes',
		title: 'PDF output size',
		unit: 'bytes',
		description: 'Generated PDF bytes. Layout, compression, and page counts can differ.'
	}
] as const;

export const charts: Chart[] = [
	...metrics.map((metric) => ({
		id: metric.id,
		title: metric.title,
		description: metric.description,
		unit: metric.unit,
		grouped: true,
		bars: renderReport.results.map((row) => ({
			label: row.scenario,
			value: row[metric.id],
			key: `${row.scenario}:${row.engine}:${metric.id}`,
			series: row.engine === 'minkpdf' ? ('mink' as const) : ('baseline' as const)
		}))
	})),
	...(['bytes', 'gzipBytes'] as const).map((metric) => ({
		id: `engine-${metric}`,
		title: metric === 'bytes' ? 'Minified engines' : 'Gzip engines',
		unit: 'bytes',
		description: 'Current full engine · Bun 1.4.2 · fonts excluded',
		bars: renderReport.engines.map((row) => ({
			label: row.name === 'minkpdf' ? 'MinkPDF' : row.name,
			value: row[metric],
			key: `${row.name}:${metric}`,
			series: row.name === 'minkpdf' ? ('mink' as const) : ('baseline' as const)
		}))
	})),
	...(['raw', 'gzip'] as const).map((metric) => ({
		id: `features-${metric}`,
		title: metric === 'raw' ? 'Minified consumer bundles' : 'Gzip consumer bundles',
		unit: 'bytes',
		description: 'Optional-feature measurement · Bun 1.4.2 · fonts excluded',
		bars: Object.entries(bundleReport.sizes)
			.map(([name, size]) => ({
				label: (
					{
						core: 'Core only',
						tables: 'Core + tables',
						images: 'Core + images',
						truetype: 'Core + TrueType',
						namedRoot: 'Full · named import',
						defaultRoot: 'Full · default import'
					} as Record<string, string>
				)[name],
				value: size[metric],
				key: `${name}:${metric}`,
				series: 'mink' as const
			}))
			.sort((a, b) => a.value - b.value)
	}))
];

const largeReportPages = renderReport.results
	.filter((row) => row.scenario === '1,000-row report')
	.map((row) => row.pages)
	.join(' / ');

const number = (value: number) => value.toLocaleString('en-US', { maximumFractionDigits: 3 });
export function svgChart(chart: Chart): string {
	const maximum = Math.max(...chart.bars.map((bar) => bar.value));
	const magnitude = 10 ** Math.floor(Math.log10(maximum));
	const ceiling = Math.ceil(maximum / magnitude) * magnitude;
	const rowHeight = chart.grouped ? 38 : 48;
	const height = chart.bars.length * rowHeight + 72;
	const x = 205,
		width = 425;
	let body = '';
	for (let tick = 0; tick <= 4; tick++) {
		const position = x + (width * tick) / 4;
		const value = (ceiling * tick) / 4;
		const label =
			chart.unit === 'bytes' && value >= 1000 ? `${number(value / 1000)}k` : number(value);
		body += `<line x1="${position}" y1="30" x2="${position}" y2="${height - 34}" stroke="var(--chart-grid, #e8e9ef)"/><text x="${position}" y="${height - 12}" text-anchor="middle" fill="var(--muted, #666b7b)" font-size="11">${label}</text>`;
	}
	chart.bars.forEach((bar, index) => {
		const y = 42 + index * rowHeight;
		if (!chart.grouped || index % 2 === 0)
			body += `<text x="8" y="${y + (chart.grouped ? 22 : 5)}" fill="var(--chart-text, #303646)" font-size="12">${escape(bar.label)}</text>`;
		const length = (bar.value / ceiling) * width;
		body += `<rect x="${x}" y="${y - 9}" width="${length}" height="18" rx="3" fill="${bar.series === 'mink' ? 'var(--red, #d94248)' : 'var(--blue, #8592ae)'}" data-key="${escape(bar.key)}" data-value="${bar.value}"><title>${escape(bar.label)} · ${bar.series === 'mink' ? 'MinkPDF' : 'pdfmake 0.3.11'}: ${number(bar.value)} ${chart.unit}</title></rect><text x="${x + length + 9}" y="${y + 4}" fill="var(--chart-text, #303646)" font-size="11" font-weight="600">${number(bar.value)}</text>`;
	});
	return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 740 ${height}" role="img" aria-labelledby="${chart.id}-title ${chart.id}-description" style="font-family:ui-monospace,SFMono-Regular,Consolas,monospace"><title id="${chart.id}-title">${escape(chart.title)} (${chart.unit})</title><desc id="${chart.id}-description">${escape(chart.description)} All bars start at zero and use the same linear scale.</desc>${body}</svg>`;
}

function figure(chart: Chart): string {
	return `<figure class="chart"><div class="chart-heading"><div><h3>${chart.title}</h3><p>${chart.description}</p></div><a href="charts/${chart.id}.svg" download aria-label="Download ${chart.title} as SVG">SVG ↓</a></div><div class="chart-scroll" role="region" aria-label="${chart.title} graph" tabindex="0">${svgChart(chart)}</div><figcaption><span>Linear scale from zero · ${chart.unit}</span>${chart.grouped ? '<span class="chart-caption-legend"><span class="chart-key"><i class="dot mink" aria-hidden="true"></i>MinkPDF</span><span class="chart-key"><i class="dot baseline" aria-hidden="true"></i>pdfmake</span></span>' : ''}</figcaption></figure>`;
}

export function benchmarkContent(): string {
	return `<div class="benchmark-meta"><span>Measured 08 Oct 2026</span><span>Apple M4 Pro</span><span>20 renders / scenario</span></div>
${note('Read the results in context', `These are local measurements, not a performance guarantee. The engines support different feature sets and do not produce pixel-identical documents. The 1,000-row report spans ${largeReportPages} pages (MinkPDF / pdfmake).`)}
${heading('render-time', 'Render performance')}
<p>Identical document definitions and Inter font files, including receipts, large tables, positioned invoice overlays, and ERP registration forms. Choose a metric to inspect the recorded results.</p>
<div class="legend"><span><i class="dot mink"></i>MinkPDF</span><span><i class="dot baseline"></i>pdfmake 0.3.11</span><span class="legend-unit">Lower render time is better</span></div>
<div class="metric-controls" role="group" aria-label="Render chart metric">${metrics.map((metric, index) => `<button type="button" data-metric="${metric.id}" aria-pressed="${index === 0}">${metric.title}</button>`).join('')}</div>
${charts
	.slice(0, 4)
	.map(
		(chart, index) =>
			`<div data-chart="${chart.id}"${index === 0 ? ' data-active' : ''}>${figure(chart)}</div>`
	)
	.join('')}
${heading('measurements', 'Every measurement')}
<p>All times are milliseconds. Each size is in bytes; page counts are included to make layout differences visible.</p>
${table(
	['Document / engine', 'First', 'Median', 'p95', 'PDF bytes', 'Pages'],
	renderReport.results.map((row) => [
		`${row.scenario}<small>${row.engine === 'minkpdf' ? 'MinkPDF' : row.engine}</small>`,
		number(row.firstMs),
		number(row.medianMs),
		number(row.p95Ms),
		number(row.pdfBytes),
		String(row.pages)
	]),
	'Recorded render measurements'
)}
${heading('engine-size', 'Engine bundle comparison')}
<p>The report measures the <strong>current full-feature implementation</strong> against pdfmake 0.3.11. Both minified browser engine sizes exclude font assets. The separate consumer measurement below includes only the features selected by each import.</p>
<div class="chart-pair">${charts.slice(4, 6).map(figure).join('')}</div>
${table(
	['Engine', 'Minified bytes', 'Gzip bytes', 'Local import (ms)'],
	renderReport.engines.map((row) => [
		row.name === 'minkpdf' ? 'MinkPDF' : row.name,
		number(row.bytes),
		number(row.gzipBytes),
		number(row.importMs)
	])
)}
${heading('optional-features', 'Pay for the features you use')}
<p>The separate <strong>Bun 1.4.2</strong> measurement bundles a browser consumer of each public entry point, minified, with <code>content: 'Hello'</code>. The full root includes every feature; the core omits table, image, and TrueType implementations. Font assets are excluded.</p>
${charts.slice(6).map(figure).join('')}
${table(
	['Consumer', 'Minified bytes', 'Gzip bytes'],
	Object.entries(bundleReport.sizes).map(([name, size]) => [
		name,
		number(size.raw),
		number(size.gzip)
	])
)}
${heading('methodology', 'How these were measured')}
<ul><li>Render comparison: Bun ${renderReport.environment.bun}, ${renderReport.environment.cpu}, ${renderReport.environment.os}, ${renderReport.environment.architecture}; ${renderReport.environment.warmups} warmups and ${renderReport.environment.runs} measured renders per scenario.</li><li>Font I/O, module import, and definition cloning are outside render timings. First-render timings include font parsing. Warmed timings reuse parsed fonts.</li><li>Identical definitions and font files go to both engines. Poppler checks representative output text and page counts; this does not establish visual equivalence.</li><li>Import time measures local Bun module loading, not browser network delivery.</li><li>Optional-feature bundle results use Bun ${bundleReport.settings.bun}, browser target, and minification. Engine and consumer bundles use different entry points; compare each measurement within its own group.</li></ul>
<div class="download-row"><a class="button secondary" href="data/2026-10-08-render-benchmarks.json" download>Render results · JSON ↓</a><a class="button secondary" href="data/2026-10-08-bundle-benchmarks.json" download>Bundle results · JSON ↓</a></div>
${heading('reproduce', 'Reproduce the results')}
<p>Clone the repository and install Bun and Poppler. Registry access is required: the render benchmark installs pdfmake 0.3.11 in a temporary directory and removes it afterward.</p>
<div class="code-block"><div class="code-label"><span>Terminal</span><button class="copy-button" type="button" aria-label="Copy benchmark commands">Copy</button></div><pre><code>bun run benchmark --runs=20 --output=/tmp/minkpdf-benchmark

# Current optional-feature bundle sizes (Bun 1.4.2)
bun run build
bun benchmarks/tree-shaking.ts --output=/tmp/minkpdf-bundles.json</code></pre></div>
<p><code>--output</code> on the render benchmark saves measured PDFs and <code>results.json</code>. Use <code>--font-dir=/path/to/fonts</code> to supply other font fixtures. Inspect the <a href="https://github.com/accntech/minkpdf/blob/main/benchmarks/pdfmake.ts">benchmark source</a> and <a href="https://github.com/accntech/minkpdf/blob/main/benchmarks/documents.ts">document definitions</a>.</p>`;
}
