import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { join } from 'node:path';
import { packedConsumer, run } from './helpers/package';

describe('published ESM package', () => {
	let consumer: Awaited<ReturnType<typeof packedConsumer>>;
	beforeAll(async () => {
		consumer = await packedConsumer();
	}, 60_000);
	afterAll(() => consumer?.dispose());
	test('exports every public subpath and ships shared implementation modules', async () => {
		const metadata = await Bun.file(
			join(consumer.directory, 'node_modules/minkpdf/package.json')
		).json();
		expect(Object.keys(metadata.exports).sort()).toEqual([
			'.',
			'./core',
			'./images',
			'./interfaces',
			'./tables',
			'./truetype'
		]);
		expect(metadata.sideEffects).toBe(false);
		expect(metadata.dependencies ?? {}).toEqual({});
		for (const file of [
			'dist/core.js',
			'dist/engine.js',
			'dist/features/tables.js',
			'dist/features/images.js',
			'dist/features/true-type.js',
			'dist/fonts/standard.js',
			'src/core.ts'
		])
			expect(consumer.packedFiles).toContain(file);
	});
	test('native Node loads public imports and preserves the root singleton', async () => {
		await Bun.write(
			join(consumer.directory, 'runtime.mjs'),
			`
import pdf, { fonts, addFonts, addVirtualFileSystem, createPdf } from 'minkpdf';
import { createPdf as corePdf, createPdfEngine } from 'minkpdf/core';
import { tables } from 'minkpdf/tables';
import { images } from 'minkpdf/images';
import { trueTypeFonts } from 'minkpdf/truetype';
import * as interfaces from 'minkpdf/interfaces';
if (fonts !== pdf.fonts || createPdf !== pdf.createPdf) throw Error('Root singleton diverged');
addFonts({Example:{normal:'example.ttf'}});
if (!pdf.fonts.Example) throw Error('Named registration diverged');
pdf.fonts = {};
if (fonts.Example) throw Error('Assignment failed to replace shared dictionary');
for (const document of [corePdf({content:'Core'}), createPdf({content:'Root'}), createPdfEngine({features:[tables(), images(), trueTypeFonts()]}).createPdf({content:{table:{body:[['Table']]}}})]) {
 const bytes = await document.getBuffer();
 if (!new TextDecoder().decode(bytes).startsWith('%PDF-1.7')) throw Error('Invalid PDF');
}
console.log('ok');
`
		);
		expect((await run(['node', 'runtime.mjs'], consumer.directory)).trim()).toBe('ok');
	});
	test('public TypeScript types resolve with NodeNext and bundler resolution', async () => {
		await Bun.write(
			join(consumer.directory, 'types.mts'),
			`
import pdf from 'minkpdf';
import { createPdfEngine, type PdfFeature, type PdfEngine, type PdfDocument } from 'minkpdf/core';
import { tables } from 'minkpdf/tables';
import { images } from 'minkpdf/images';
import { trueTypeFonts } from 'minkpdf/truetype';
import type { TDocumentDefinitions } from 'minkpdf/interfaces';
const features: PdfFeature[] = [tables(), images(), trueTypeFonts()];
const engine: PdfEngine = createPdfEngine({features});
const definition: TDocumentDefinitions = {content:{table:{body:[['Hello']]}}};
const document: PdfDocument = engine.createPdf(definition);
pdf.createPdf(definition); document.getBuffer();
`
		);
		for (const [module, moduleResolution] of [
			['NodeNext', 'NodeNext'],
			['ESNext', 'bundler']
		]) {
			await Bun.write(
				join(consumer.directory, 'tsconfig.json'),
				JSON.stringify({
					compilerOptions: {
						strict: true,
						noEmit: true,
						target: 'ES2022',
						module,
						moduleResolution,
						types: [],
						lib: ['ES2022', 'DOM']
					},
					files: ['types.mts']
				})
			);
			await run(
				['node', 'node_modules/typescript/bin/tsc', '-p', 'tsconfig.json'],
				consumer.directory
			);
		}
	}, 30_000);
});
