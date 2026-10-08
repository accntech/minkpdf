import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { readPdf } from './helpers/pdf';
import { createPdf, createPdfEngine } from '../src/core';
import { trueTypeFonts } from '../src/features/true-type';

const inter = readFileSync(new URL('./fixtures/fonts/Inter-Regular.ttf', import.meta.url));

test('core renders readable text with all output methods', async () => {
	const document = createPdf({ content: 'Hello', info: { title: 'Core' } });
	const bytes = await document.getBuffer();
	expect((await readPdf(bytes)).pages[0].text).toBe('Hello');
	expect(await document.getBuffer()).toBe(bytes);
	expect((await document.getBlob()).type).toBe('application/pdf');
	expect(await document.getBase64()).toBe(Buffer.from(bytes).toString('base64'));
	expect(await document.getDataUrl()).toBe(
		`data:application/pdf;base64,${await document.getBase64()}`
	);
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

test('duplicate descriptors are rejected when an engine is constructed', async () => {
	expect(() => createPdfEngine({ features: [trueTypeFonts(), trueTypeFonts()] })).toThrow(
		'Duplicate'
	);
});

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
