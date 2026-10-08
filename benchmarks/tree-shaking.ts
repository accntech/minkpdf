import { gzipSync } from 'node:zlib';
import { existsSync } from 'node:fs';

const settings = { bun: Bun.version, target: 'browser', minify: true, content: 'Hello' };
const dist = new URL('../dist/', import.meta.url).pathname;

export async function measure(contents: string) {
	const result = await Bun.build({
		entrypoints: ['virtual:consumer'],
		target: 'browser',
		minify: true,
		plugins: [
			{
				name: 'consumer',
				setup(build) {
					build.onResolve({ filter: /^virtual:/ }, (args) => ({
						path: args.path,
						namespace: 'consumer'
					}));
					build.onLoad({ filter: /.*/, namespace: 'consumer' }, () => ({ contents, loader: 'js' }));
				}
			}
		]
	});
	if (!result.success) throw new AggregateError(result.logs, 'Consumer build failed');
	const bytes = new Uint8Array(await result.outputs[0].arrayBuffer());
	return { raw: bytes.length, gzip: gzipSync(bytes).length };
}

export async function report() {
	const consumers: Record<string, string> = {
		namedRoot: `import { createPdf } from '${dist}index.js'; globalThis.pdf = createPdf({content:'Hello'});`,
		defaultRoot: `import pdf from '${dist}index.js'; globalThis.pdf = pdf.createPdf({content:'Hello'});`
	};
	if (existsSync(`${dist}core.js`)) {
		consumers.core = `import { createPdf } from '${dist}core.js'; globalThis.pdf = createPdf({content:'Hello'});`;
		for (const [name, file, factory] of [
			['tables', 'tables', 'tables'],
			['images', 'images', 'images'],
			['truetype', 'true-type', 'trueTypeFonts']
		])
			consumers[name] =
				`import { createPdfEngine } from '${dist}core.js'; import { ${factory} } from '${dist}features/${file}.js'; globalThis.pdf = createPdfEngine({features:[${factory}()]}).createPdf({content:'Hello'});`;
	}
	const sizes: Record<string, Awaited<ReturnType<typeof measure>>> = {};
	for (const [name, source] of Object.entries(consumers)) sizes[name] = await measure(source);
	return {
		settings,
		consumers: Object.fromEntries(
			Object.entries(consumers).map(([name, source]) => [name, source.replaceAll(dist, './dist/')])
		),
		sizes
	};
}

export function checkSizes(
	current: Awaited<ReturnType<typeof report>>,
	baseline: Awaited<ReturnType<typeof report>>
) {
	if (JSON.stringify(current.settings) !== JSON.stringify(baseline.settings))
		throw new Error(
			'Baseline tool version/settings differ; remeasure old and new implementations together'
		);
	for (const metric of ['raw', 'gzip'] as const) {
		const saving = metric === 'raw' ? 0.3 : 0.2;
		if (
			!current.sizes.core ||
			current.sizes.core[metric] > baseline.sizes.namedRoot[metric] * (1 - saving)
		)
			throw new Error(`Core ${metric} misses the ${saving * 100}% reduction target`);
		for (const name of ['namedRoot', 'defaultRoot'])
			if (current.sizes[name][metric] > baseline.sizes[name][metric] * 1.1)
				throw new Error(`${name} ${metric} exceeds the 10% growth limit`);
	}
}

if (import.meta.main) {
	const result = await report();
	const record = Bun.argv.find((arg) => arg.startsWith('--record-baseline='))?.split('=')[1];
	const compare = Bun.argv.find((arg) => arg.startsWith('--compare-baseline='))?.split('=')[1];
	const output = Bun.argv.find((arg) => arg.startsWith('--output='))?.split('=')[1];
	if (record) await Bun.write(record, JSON.stringify(result, null, 2) + '\n');
	if (compare) checkSizes(result, await Bun.file(compare).json());
	if (output) await Bun.write(output, JSON.stringify(result, null, 2) + '\n');
	console.table(result.sizes);
}
