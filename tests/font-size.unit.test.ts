import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { createPdfEngine } from '../src/core';
import { trueTypeFonts } from '../src/features/true-type';
import { readPdf } from './helpers/pdf';
import { scenarios } from '../benchmarks/documents';

function engine() {
	const pdf = createPdfEngine({ features: [trueTypeFonts()] });
	pdf.addVirtualFileSystem({
		'Inter-Regular.ttf': readFileSync(
			new URL('./fixtures/fonts/Inter-Regular.ttf', import.meta.url)
		),
		'Inter-Bold.ttf': readFileSync(new URL('./fixtures/fonts/Inter-Bold.ttf', import.meta.url))
	});
	pdf.addFonts({ Inter: { normal: 'Inter-Regular.ttf', bold: 'Inter-Bold.ttf' } });
	return pdf;
}

test('keeps a two-face receipt below 8 KB while preserving accented names and currency', async () => {
	const bytes = await engine().createPdf(scenarios[0].document).getBuffer();
	expect(bytes.length).toBeLessThan(8_000);
	expect((await readPdf(bytes)).pages[0].text).toBe(
		'José García Trading Receipt for ₱1,234.50 Libro · Page 1 of 1'
	);
});

test('keeps subset encodings independent across pages, documents and concurrent renders', async () => {
	const pdf = engine();
	const first = {
		defaultStyle: { font: 'Inter' },
		watermark: { text: 'DRAFT', angle: 0, bold: true },
		footer: (page: number, total: number) => ({ text: `Page ${page} of ${total}` }),
		content: [
			{ text: 'éíÅ José ₱100', bold: true },
			{ text: 'e i A García ₱200', pageBreak: 'before' as const, bold: true }
		]
	};
	const second = { defaultStyle: { font: 'Inter' }, content: 'García José Åíé ₱300' };
	const [a, b] = await Promise.all([
		pdf.createPdf(first).getBuffer(),
		pdf.createPdf(second).getBuffer()
	]);
	const pages = (await readPdf(a)).pages;
	expect(pages).toHaveLength(2);
	for (const [index, text] of ['éíÅ José ₱100', 'e i A García ₱200'].entries()) {
		expect(pages[index].text).toContain(text);
		expect(pages[index].text).toContain(`Page ${index + 1} of 2`);
		expect(pages[index].text).toContain('DRAFT');
	}
	expect((await readPdf(b)).pages[0].text).toBe(second.content);
	expect(await pdf.createPdf(second).getBuffer()).toEqual(b);
});
