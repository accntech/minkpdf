import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { command, readPdf, withPdf } from './helpers/pdf';
import type { Content, TDocumentDefinitions } from '../src/interfaces';
import { createPdfEngine } from '../src/core';
import { tables } from '../src/features/tables';
import { images } from '../src/features/images';
import { trueTypeFonts } from '../src/features/true-type';

const png =
	'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAACklEQVR4nGMAAQAABQABDQottAAAAABJRU5ErkJggg==';

test('missing features fail through nested content and intrinsic measurement', async () => {
	const pdf = createPdfEngine();
	for (const [node, feature] of [
		[{ table: { body: [['Hello']] } }, 'tables'],
		[{ image: png, fit: [20, 20] }, 'images']
	] as const) {
		const documents: TDocumentDefinitions[] = [
			{ content: { stack: [node] } },
			{ content: { columns: [{ ...node, width: 'auto' }] } },
			{ content: 'Body', header: { stack: [node] } },
			{ content: 'Body', footer: () => ({ stack: [node] }) }
		];
		for (const document of documents)
			await expect(pdf.createPdf(document).getBuffer()).rejects.toThrow(`minkpdf/${feature}`);
	}
	await expect(
		pdf.createPdf({ content: 'Hello', defaultStyle: { font: 'Inter' } }).getBuffer()
	).rejects.toThrow('minkpdf/truetype');
});

test('all eight feature combinations render with either descriptor order', async () => {
	for (let mask = 0; mask < 8; mask++) {
		const descriptors = [tables(), images(), trueTypeFonts()].filter((_, bit) => mask & (1 << bit));
		for (const features of [descriptors, [...descriptors].reverse()]) {
			const pdf = createPdfEngine({ features });
			if (mask & 4) {
				pdf.addVirtualFileSystem({
					'Inter.ttf': readFileSync(new URL('./fixtures/fonts/Inter-Regular.ttf', import.meta.url))
				});
				pdf.addFonts({ Inter: { normal: 'Inter.ttf' } });
			}
			const text = mask & 4 ? 'José ₱100' : 'Hello';
			const cell: Content = mask & 2 ? { stack: [{ image: png, fit: [20, 20] }, text] } : text;
			const bytes = await pdf
				.createPdf({
					defaultStyle: { font: mask & 4 ? 'Inter' : 'Helvetica' },
					content: mask & 1 ? { table: { widths: ['auto'], body: [[cell]] } } : cell
				})
				.getBuffer();
			expect((await readPdf(bytes)).pages[0].text).toBe(text);
			if (mask & 2)
				expect(await withPdf(bytes, (path) => command(['pdfimages', '-list', path]))).toContain(
					'smask'
				);
		}
	}
});

test('image resources are isolated between concurrent renders', async () => {
	const pdf = createPdfEngine({ features: [images()] });
	const [illustrated, plain] = await Promise.all([
		pdf.createPdf({ content: [{ image: png }, 'Illustrated'] }).getBuffer(),
		pdf.createPdf({ content: 'Plain' }).getBuffer()
	]);
	expect(await withPdf(illustrated, (path) => command(['pdfimages', '-list', path]))).toContain(
		'smask'
	);
	expect(await withPdf(plain, (path) => command(['pdfimages', '-list', path]))).not.toContain(
		'smask'
	);
	expect((await readPdf(plain)).pages[0].text).toBe('Plain');
});

test('table layouts preserve custom padding and reject unregistered layouts', async () => {
	const pdf = createPdfEngine({ features: [tables()] });
	pdf.addTableLayouts({ custom: { paddingLeft: () => 30, defaultBorder: false } });
	const document = { content: { layout: 'custom', table: { body: [['Hello']] } } };
	const result = await readPdf(await pdf.createPdf(document).getBuffer());
	expect(result.pages[0].items[0].transform[4]).toBeCloseTo(70, 2);
	await expect(
		createPdfEngine({ features: [tables()] })
			.createPdf(document)
			.getBuffer()
	).rejects.toThrow('Unknown PDF table layout');
});

test('image feature embeds JPEG resources without PNG decompression', async () => {
	const jpeg = readFileSync(new URL('./fixtures/images/tiny.jpg', import.meta.url)).toString(
		'base64'
	);
	const bytes = await createPdfEngine({ features: [images()] })
		.createPdf({ content: [{ image: `data:image/jpeg;base64,${jpeg}`, fit: [20, 20] }, 'JPEG'] })
		.getBuffer();
	const resources = await withPdf(bytes, (path) => command(['pdfimages', '-list', path]));
	expect(resources).toContain('jpeg');
	expect((await readPdf(bytes)).pages[0].text).toBe('JPEG');
});
