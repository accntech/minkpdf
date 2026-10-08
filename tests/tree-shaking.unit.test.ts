import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { cpSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { packedConsumer, run } from './helpers/package';
import { command, readPdf, withPdf } from './helpers/pdf';
import { checkSizes, report } from '../benchmarks/tree-shaking';

describe('consumer tree-shaking', () => {
	let consumer: Awaited<ReturnType<typeof packedConsumer>>;
	beforeAll(async () => {
		consumer = await packedConsumer();
		cpSync(new URL('./fixtures/consumers/', import.meta.url).pathname, consumer.directory, {
			recursive: true,
			filter: (path) => !path.endsWith('package.json')
		});
		await Bun.write(
			join(consumer.directory, 'tsconfig.json'),
			JSON.stringify({
				compilerOptions: {
					target: 'ES2022',
					module: 'ESNext',
					moduleResolution: 'bundler',
					strict: true,
					verbatimModuleSyntax: true,
					types: [],
					lib: ['ES2022', 'DOM'],
					rootDir: '.',
					outDir: 'compiled'
				},
				include: ['*.ts']
			})
		);
		await run(
			['node', 'node_modules/typescript/bin/tsc', '-p', 'tsconfig.json'],
			consumer.directory
		);
		await Bun.write(
			join(consumer.directory, 'execute.mjs'),
			`
import { pathToFileURL } from 'node:url';
import { readFileSync } from 'node:fs';
const result = await import(pathToFileURL(process.argv[2]).href);
const response = { bytes: Buffer.from(await result.document.getBuffer()).toString('base64') };
if (process.argv[3]) {
 result.engine.addVirtualFileSystem({'Inter.ttf':readFileSync(process.argv[3])});
 result.engine.addFonts({Inter:{normal:'Inter.ttf'}});
 response.unicode = Buffer.from(await result.engine.createPdf({defaultStyle:{font:'Inter'},content:'José ₱100'}).getBuffer()).toString('base64');
}
console.log(JSON.stringify(response));
`
		);
	}, 60_000);
	afterAll(() => consumer?.dispose());
	for (const bundler of ['bun', 'esbuild', 'rollup'])
		test(`${bundler} excludes unselected features and produces working PDFs`, async () => {
			const directory = consumer.directory;
			const esbuild = await import(
				pathToFileURL(join(directory, 'node_modules/esbuild/lib/main.js')).href
			);
			const rollup = await import(
				pathToFileURL(join(directory, 'node_modules/rollup/dist/es/rollup.js')).href
			);
			const nodeResolve = (
				await import(
					pathToFileURL(
						join(directory, 'node_modules/@rollup/plugin-node-resolve/dist/es/index.js')
					).href
				)
			).nodeResolve;
			const expected: Record<string, string[]> = {
				core: [],
				tables: ['tables'],
				images: ['images'],
				truetype: ['true-type'],
				full: ['tables', 'images', 'true-type'],
				'unused-feature': [],
				'type-only': []
			};
			for (const [name, features] of Object.entries(expected)) {
				const entry = join(directory, `${name}.ts`);
				let code: string;
				let modules: string[];
				if (bundler === 'bun') {
					const result = await Bun.build({
						entrypoints: [entry],
						target: 'browser',
						minify: true,
						metafile: true
					});
					if (!result.success) throw new AggregateError(result.logs, 'Bun consumer failed');
					code = await result.outputs[0].text();
					modules = Object.values(result.metafile!.outputs).flatMap((output) =>
						Object.entries(output.inputs)
							.filter(([, input]) => input.bytesInOutput > 0)
							.map(([id]) => id)
					);
				} else if (bundler === 'esbuild') {
					const result = await esbuild.build({
						entryPoints: [entry],
						bundle: true,
						format: 'esm',
						platform: 'browser',
						minify: true,
						metafile: true,
						write: false
					});
					code = result.outputFiles[0].text;
					modules = Object.values(result.metafile.outputs).flatMap((output: any) =>
						Object.entries(output.inputs)
							.filter(([, input]: any) => input.bytesInOutput > 0)
							.map(([id]) => id)
					);
				} else {
					const bundle = await rollup.rollup({
						input: join(directory, 'compiled', `${name}.js`),
						plugins: [nodeResolve()]
					});
					try {
						const { output } = await bundle.generate({ format: 'esm' });
						code = (await esbuild.transform(output[0].code, { minify: true, target: 'es2022' }))
							.code;
						modules = Object.entries(output[0].modules)
							.filter(([, info]: any) => info.renderedLength > 0)
							.map(([id]) => id);
					} finally {
						await bundle.close();
					}
				}
				const included = [
					...new Set(modules.flatMap((id) => id.match(/\/dist\/features\/([^/]+)\.js$/)?.[1] ?? []))
				].sort();
				expect(included).toEqual([...features].sort());
				expect(code.includes('DecompressionStream')).toBe(features.includes('images'));
				const outfile = join(directory, `${bundler}-${name}.mjs`);
				await Bun.write(outfile, code);
				const args = ['node', 'execute.mjs', outfile];
				if (name === 'truetype' || name === 'full')
					args.push(new URL('./fixtures/fonts/Inter-Regular.ttf', import.meta.url).pathname);
				const result = JSON.parse(await run(args, directory));
				const bytes = Buffer.from(result.bytes, 'base64');
				expect((await readPdf(bytes)).pages[0].text).toBe('Hello');
				if (name === 'images')
					expect(await withPdf(bytes, (path) => command(['pdfimages', '-list', path]))).toContain(
						'smask'
					);
				if (result.unicode)
					expect((await readPdf(Buffer.from(result.unicode, 'base64'))).pages[0].text).toBe(
						'José ₱100'
					);
			}
		}, 30_000);
	test('core reduction and full-engine growth stay within the recorded size budgets', async () => {
		const baseline = await Bun.file(
			new URL('../benchmarks/tree-shaking-baseline.json', import.meta.url)
		).json();
		const current = await report();
		checkSizes(current, baseline);
	});
});
