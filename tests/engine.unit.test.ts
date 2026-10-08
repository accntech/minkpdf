import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { readPdf } from './helpers/pdf';
import { createPdf, createPdfEngine } from '../src/core';
import { tables } from '../src/features/tables';
import { images } from '../src/features/images';
import { trueTypeFonts } from '../src/features/true-type';

const inter = readFileSync(new URL('./fixtures/fonts/Inter-Regular.ttf', import.meta.url));

test('output methods share one render and preserve bytes and Unicode metadata', async () => {
	const calls: number[] = [];
	const document = createPdf({
		content: 'Hello',
		header: (page) => {
			calls.push(page);
			return '';
		},
		info: {
			title: 'José & <Libro> 📄',
			author: 'Author',
			subject: 'Subject',
			keywords: 'PDF, test',
			creator: 'MinkPDF tests'
		}
	});
	const rendering = document.getBuffer();
	const [bytes, repeated, blob, base64, url] = await Promise.all([
		rendering,
		document.getBuffer(),
		document.getBlob(),
		document.getBase64(),
		document.getDataUrl()
	]);
	const result = await readPdf(bytes);
	expect(result.pages[0].text).toBe('Hello');
	expect(result.metadata.info).toMatchObject({
		Title: 'José & <Libro> 📄',
		Author: 'Author',
		Subject: 'Subject',
		Keywords: 'PDF, test',
		Creator: 'MinkPDF tests',
		Producer: 'MinkPDF'
	});
	expect(repeated).toEqual(bytes);
	expect(await document.getBuffer()).toEqual(bytes);
	expect(calls).toEqual([1]);
	expect(blob.type).toBe('application/pdf');
	expect(new Uint8Array(await blob.arrayBuffer())).toEqual(bytes);
	expect(Buffer.from(base64, 'base64')).toEqual(Buffer.from(bytes));
	expect(url).toBe(`data:application/pdf;base64,${base64}`);
});

test('engines using a shared font descriptor keep independent registrations and caches', async () => {
	const descriptor = trueTypeFonts();
	const first = createPdfEngine({ features: [descriptor] });
	const second = createPdfEngine({ features: [descriptor] });
	first.addVirtualFileSystem({ 'Inter.ttf': inter });
	first.addFonts({ Inter: { normal: 'Inter.ttf' } });
	const definition = { defaultStyle: { font: 'Inter' }, content: 'José ₱100' };
	expect((await readPdf(await first.createPdf(definition).getBuffer())).pages[0].text).toBe(
		'José ₱100'
	);
	expect(second.fonts).toEqual({});
	await expect(second.createPdf(definition).getBuffer()).rejects.toThrow('not registered');
	second.addVirtualFileSystem({ 'Inter.ttf': new Uint8Array(0) });
	second.addFonts(first.fonts);
	await expect(second.createPdf(definition).getBuffer()).rejects.toThrow();
	expect((await readPdf(await first.createPdf(definition).getBuffer())).pages[0].text).toBe(
		'José ₱100'
	);
});

test('font replacement preserves dictionary identity and invalidates replaced files', async () => {
	const pdf = createPdfEngine({ features: [trueTypeFonts()] });
	const dictionary = pdf.fonts;
	pdf.addFonts({ Old: { normal: 'old.ttf' } });
	pdf.fonts = { Inter: { normal: 'Inter.ttf' } };
	expect(pdf.fonts).toBe(dictionary);
	expect(pdf.fonts.Old).toBeUndefined();
	pdf.fonts = pdf.fonts;
	expect(pdf.fonts).toEqual({ Inter: { normal: 'Inter.ttf' } });
	pdf.addVirtualFileSystem({ 'Inter.ttf': inter.toString('base64') });
	const definition = { defaultStyle: { font: 'Inter' }, content: 'José' };
	await pdf.createPdf(definition).getBuffer();
	pdf.addVirtualFileSystem({ 'Inter.ttf': new Uint8Array(0) });
	await expect(pdf.createPdf(definition).getBuffer()).rejects.toThrow();
});

test('core rejects registration requiring disabled capabilities', async () => {
	const pdf = createPdfEngine();
	expect(() => pdf.addFonts({ Inter: { normal: 'Inter.ttf' } })).toThrow('minkpdf/truetype');
	expect(() => pdf.addVirtualFileSystem({ 'Inter.ttf': inter })).toThrow('minkpdf/truetype');
	expect(() => {
		pdf.fonts = {};
	}).toThrow('minkpdf/truetype');
	expect(() => pdf.addTableLayouts({ custom: {} })).toThrow('minkpdf/tables');
	await expect(pdf.createPdf({ content: 'José' }).getBuffer()).rejects.toThrow('TrueType');
});

for (const factory of [tables, images, trueTypeFonts]) {
	const descriptor = factory();
	test(`rejects duplicate ${descriptor.id} features`, () => {
		expect(() => createPdfEngine({ features: [descriptor, factory()] })).toThrow(
			`Duplicate PDF feature: ${descriptor.id}`
		);
	});
}

test('subsetting never mutates registered Buffer font bytes across documents', async () => {
	const bytes = readFileSync(new URL('./fixtures/fonts/Inter-Regular.ttf', import.meta.url));
	const original = Buffer.from(bytes);
	const pdf = createPdfEngine({ features: [trueTypeFonts()] });
	pdf.addVirtualFileSystem({ 'Inter.ttf': bytes });
	pdf.addFonts({ Inter: { normal: 'Inter.ttf' } });
	await pdf.createPdf({ defaultStyle: { font: 'Inter' }, content: 'José' }).getBuffer();
	expect(bytes.equals(original)).toBe(true);
	expect(
		(
			await readPdf(
				await pdf.createPdf({ defaultStyle: { font: 'Inter' }, content: 'García ₱100' }).getBuffer()
			)
		).pages[0].text
	).toBe('García ₱100');
});

test('renders format-4 Unicode fonts with monospaced metrics and bold faces', async () => {
	const pdf = createPdfEngine({ features: [trueTypeFonts()] });
	pdf.addVirtualFileSystem({
		'Geist.ttf': readFileSync(new URL('./fixtures/fonts/GeistMono-Regular.ttf', import.meta.url)),
		'Geist-Bold.ttf': readFileSync(
			new URL('./fixtures/fonts/GeistMono-SemiBold.ttf', import.meta.url)
		)
	});
	pdf.addFonts({ Geist: { normal: 'Geist.ttf', bold: 'Geist-Bold.ttf' } });
	const result = await readPdf(
		await pdf
			.createPdf({
				defaultStyle: { font: 'Geist' },
				content: ['iiii WWWW José García', { text: 'Bold', bold: true }]
			})
			.getBuffer()
	);
	expect(result.pages[0].text).toBe('iiii WWWW José García Bold');
	const [narrow, wide] = result.pages[0].items;
	expect(narrow.right - narrow.transform[4]).toBeCloseTo(wide.right - wide.transform[4], 3);
});

test.each([
	['missing file', {}, 'normal'],
	['missing bold face', { bold: true }, 'bold'],
	['missing italic face', { italics: true }, 'italics'],
	['missing bold italic face', { bold: true, italics: true }, 'bolditalics']
] as const)('rejects a registered family with a %s', async (name, style, face) => {
	const pdf = createPdfEngine({ features: [trueTypeFonts()] });
	pdf.addFonts({ Inter: { normal: 'Inter.ttf' } });
	if (name !== 'missing file') pdf.addVirtualFileSystem({ 'Inter.ttf': inter });
	await expect(
		pdf
			.createPdf({
				defaultStyle: { font: 'Inter', ...style },
				content: 'Text'
			})
			.getBuffer()
	).rejects.toThrow(`PDF font Inter (${face}) is not registered`);
});
