import { mkdtempSync, mkdirSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createRequire } from 'node:module';
import { gzipSync } from 'node:zlib';
import { scenarios } from './documents';
import type { TDocumentDefinitions, TFontDictionary } from '../src/interfaces';

const pdfmakeVersion = '0.3.11';
const options = Object.fromEntries(
	Bun.argv.slice(2).map((argument) => {
		const [key, ...value] = argument.replace(/^--/, '').split('=');
		return [key, value.join('=')];
	})
);
const runs = Number(options.runs ?? 20);
if (!Number.isInteger(runs) || runs < 3) throw new Error('--runs must be an integer of at least 3');
const fontsPath = resolve(
	options['font-dir'] ?? new URL('../tests/fixtures/fonts', import.meta.url).pathname
);
const directory = mkdtempSync(join(tmpdir(), 'minkpdf-benchmark-'));

async function command(args: string[], cwd?: string): Promise<string> {
	const process = Bun.spawn(args, { cwd, stdout: 'pipe', stderr: 'pipe' });
	const [output, error, status] = await Promise.all([
		new Response(process.stdout).text(),
		new Response(process.stderr).text(),
		process.exited
	]);
	if (status !== 0) throw new Error(error || `${args[0]} failed`);
	return output;
}
function clone<T>(value: T): T {
	if (value === null || typeof value !== 'object') return value;
	if (Array.isArray(value)) return value.map(clone) as T;
	return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, clone(child)])) as T;
}
const milliseconds = (value: number) => Math.round(value * 1000) / 1000;
const percentile = (samples: number[], proportion: number) =>
	[...samples].sort((a, b) => a - b)[Math.ceil(samples.length * proportion) - 1];

try {
	// The baseline lives entirely in a temporary package, never in the engine's dependencies.
	await Bun.write(
		join(directory, 'package.json'),
		JSON.stringify({
			private: true,
			dependencies: { pdfmake: pdfmakeVersion }
		})
	);
	console.log(`Installing temporary pdfmake ${pdfmakeVersion} baseline…`);
	await command(['bun', 'install', '--ignore-scripts'], directory);
	const require = createRequire(join(directory, 'package.json'));
	const started = performance.now();
	const { default: pdf } = await import('../src/index');
	const minkpdfImportMs = performance.now() - started;
	const baselineStarted = performance.now();
	const { default: pdfmake } = await import(require.resolve('pdfmake/build/pdfmake.js'));
	const pdfmakeImportMs = performance.now() - baselineStarted;
	const files: Record<string, string> = {},
		fonts: TFontDictionary = {};
	for (const filename of readdirSync(fontsPath).filter((name) => name.endsWith('.ttf'))) {
		files[filename] = readFileSync(join(fontsPath, filename)).toString('base64');
		const [family, variant] = filename.replace('.ttf', '').split('-');
		const style =
			variant.includes('Bold') && variant.includes('Italic')
				? 'bolditalics'
				: variant.includes('Bold')
					? 'bold'
					: variant.includes('Italic')
						? 'italics'
						: 'normal';
		fonts[family] = { ...fonts[family], [style]: filename };
	}
	pdf.addVirtualFileSystem(files);
	pdf.addFonts(fonts);
	pdfmake.addVirtualFileSystem(files);
	pdfmake.fonts = fonts;
	const bundle = await Bun.build({
		entrypoints: [new URL('../src/index.ts', import.meta.url).pathname],
		target: 'browser',
		minify: true
	});
	if (!bundle.success) throw new Error('Engine bundle failed');
	const minkpdfCode = new Uint8Array(await bundle.outputs[0].arrayBuffer());
	const pdfmakeCode = readFileSync(require.resolve('pdfmake/build/pdfmake.min.js'));
	const engines = [
		{
			name: 'minkpdf',
			renderer: pdf,
			bytes: minkpdfCode.length,
			gzipBytes: gzipSync(minkpdfCode).length,
			importMs: milliseconds(minkpdfImportMs)
		},
		{
			name: `pdfmake ${pdfmakeVersion}`,
			renderer: pdfmake,
			bytes: pdfmakeCode.length,
			gzipBytes: gzipSync(pdfmakeCode).length,
			importMs: milliseconds(pdfmakeImportMs)
		}
	];
	const results = [];
	for (const scenario of scenarios) {
		for (const engine of engines) {
			pdf.addVirtualFileSystem(files); // Reset MinkPDF's parsed-font cache for each first render.
			let bytes = new Uint8Array();
			const render = async () => {
				const definition = clone(scenario.document) as TDocumentDefinitions;
				const start = performance.now();
				bytes = new Uint8Array(await engine.renderer.createPdf(definition).getBuffer());
				return performance.now() - start;
			};
			const firstMs = await render();
			for (let index = 0; index < 3; index++) await render();
			const samples = [];
			for (let index = 0; index < runs; index++) samples.push(await render());
			const path = join(directory, 'output.pdf');
			await Bun.write(path, bytes);
			const [info, text] = await Promise.all([
				command(['pdfinfo', path]),
				command(['pdftotext', path, '-'])
			]);
			const normalized = text.replace(/\s+/g, ' ');
			for (const expected of scenario.expected)
				if (!normalized.includes(expected))
					throw new Error(`${engine.name}: missing ${expected} in ${scenario.name}`);
			const pages = Number(info.match(/^Pages:\s+(\d+)/m)?.[1]);
			results.push({
				scenario: scenario.name,
				engine: engine.name,
				firstMs: milliseconds(firstMs),
				medianMs: milliseconds(percentile(samples, 0.5)),
				p95Ms: milliseconds(percentile(samples, 0.95)),
				pdfBytes: bytes.length,
				pages
			});
			if (options.output) {
				mkdirSync(resolve(options.output), { recursive: true });
				await Bun.write(
					join(
						resolve(options.output),
						`${scenario.name.replaceAll(/[^a-z0-9]+/gi, '-')}-${engine.name === 'minkpdf' ? 'minkpdf' : 'pdfmake'}.pdf`
					),
					bytes
				);
			}
		}
	}
	const report = {
		environment: {
			bun: Bun.version,
			platform: process.platform,
			architecture: process.arch,
			runs,
			warmups: 3
		},
		engines: engines.map(({ renderer: _renderer, ...size }) => size),
		results
	};
	console.table(report.engines);
	console.table(results);
	console.log(
		'Font I/O, module import, and cloning are excluded from render timings. First render includes font parsing; medians follow three warmups. Sizes exclude font assets. Layout and pagination may differ; page counts are reported.'
	);
	if (options.output)
		await Bun.write(
			join(resolve(options.output), 'results.json'),
			JSON.stringify(report, null, 2) + '\n'
		);
} finally {
	rmSync(directory, { recursive: true, force: true });
}
