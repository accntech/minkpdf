import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { withPdf, command, readPdf } from './helpers/pdf';
import { createPdf } from '../src/index';
import { createPdfEngine } from '../src/core';
import { trueTypeFonts } from '../src/features/true-type';

test('keeps a four-face document compact without embedding unused font metadata', async () => {
	const pdf = createPdfEngine({ features: [trueTypeFonts()] });
	const faces = ['Regular', 'Bold', 'Italic', 'BoldItalic'];
	pdf.addVirtualFileSystem(
		Object.fromEntries(
			faces.map((face) => [
				`Inter-${face}.ttf`,
				readFileSync(new URL(`./fixtures/fonts/Inter-${face}.ttf`, import.meta.url)).toString(
					'base64'
				)
			])
		)
	);
	pdf.addFonts({
		Inter: {
			normal: 'Inter-Regular.ttf',
			bold: 'Inter-Bold.ttf',
			italics: 'Inter-Italic.ttf',
			bolditalics: 'Inter-BoldItalic.ttf'
		}
	});
	const bytes = await pdf
		.createPdf({
			defaultStyle: { font: 'Inter' },
			content: [
				{ text: 'José García ₱1,234.50' },
				{ text: 'Bold', bold: true },
				{ text: 'Italic', italics: true },
				{ text: 'Both', bold: true, italics: true }
			]
		})
		.getBuffer();
	expect(bytes.byteLength).toBeLessThan(35_000);
	expect((await readPdf(bytes)).pages[0].text).toBe('José García ₱1,234.50 Bold Italic Both');
	const fonts = await withPdf(bytes, (path) => command(['pdffonts', path]));
	for (const face of faces) expect(fonts).toContain(`Inter-${face}`);
	expect(fonts.trim().split('\n').slice(2)).toHaveLength(4);
});

test('preserves explicit page breaks inside stacks', async () => {
	const bytes = await createPdf({
		content: ['Intro', { stack: [{ text: 'First', pageBreak: 'before' }, 'Second'] }]
	}).getBuffer();
	const result = await readPdf(bytes);
	expect(result.pages).toHaveLength(2);
	expect(result.pages[0].text).toBe('Intro');
	expect(result.pages[1].text).toBe('First Second');
});

test('sizes automatic columns from the complete styled text line', async () => {
	const bytes = await createPdf({
		content: [
			{
				table: {
					widths: ['auto', '*'],
					body: [[{ text: [{ text: '1100', bold: true }, ' - ', 'Cash'] }, 'Description']]
				}
			}
		]
	}).getBuffer();
	const page = (await readPdf(bytes)).pages[0];
	const code = page.items.find((item) => item.str === '1100')!;
	const name = page.items.find((item) => item.str === 'Cash')!;
	expect(name.transform[5]).toBeCloseTo(code.transform[5], 1);
});

test('aligns bold standard-font text to the right page margin', async () => {
	const bytes = await createPdf({
		pageSize: { width: 300, height: 200 },
		pageMargins: 20,
		content: { text: 'Bold WIDE', bold: true, alignment: 'right' }
	}).getBuffer();
	const page = (await readPdf(bytes)).pages[0];
	expect(page.items.at(-1)!.right).toBeCloseTo(280, 2);
});

test('paginates tables, repeats headings, and calls footers with the final page count', async () => {
	const bytes = await createPdf({
		pageSize: { width: 300, height: 200 },
		pageMargins: [20, 20, 20, 30],
		footer: (page, total) => ({
			text: `Page ${page} of ${total}`,
			margin: [20, 0]
		}),
		content: [
			{
				margin: [35, 0, 0, 0],
				table: {
					headerRows: 1,
					dontBreakRows: true,
					widths: ['*', 60],
					body: [
						['Account', 'Amount'],
						...Array.from({ length: 30 }, (_, index) => [`Department ${index + 1}`, String(index)])
					]
				}
			}
		]
	}).getBuffer();
	const result = await readPdf(bytes);
	expect(result.pages.length).toBeGreaterThan(1);
	for (const [index, page] of result.pages.entries()) {
		expect(page.items.filter((item) => item.str === 'Account')).toHaveLength(1);
		expect(page.items.find((item) => item.str === 'Account')!.transform[4]).toBe(59);
		expect(page.text).toContain(`Page ${index + 1} of ${result.pages.length}`);
		expect(page.width).toBe(300);
		for (const item of page.items) expect(item.transform[5]).toBeGreaterThan(10);
	}
	const departments = result.pages.flatMap((page) =>
		page.items.flatMap((item, index) =>
			item.str === 'Department' ? [Number(page.items[index + 1].str)] : []
		)
	);
	expect(departments).toEqual(Array.from({ length: 30 }, (_, index) => index + 1));
});

test('renders nested cells, merged columns, rich text and unbreakable signatories', async () => {
	const bytes = await createPdf({
		pageSize: { width: 300, height: 200 },
		pageMargins: 20,
		content: [
			{
				table: {
					widths: ['*', '*'],
					body: [
						[
							{
								stack: [
									{ text: [{ text: 'Client ', bold: true }, 'Jane'] },
									{ table: { widths: ['*'], body: [['Nested']] } }
								]
							},
							{ text: 'Details' }
						],
						[{ text: 'Merged', colSpan: 2 }, {}]
					]
				}
			},
			...Array.from({ length: 9 }, () => ({
				text: 'Filler',
				margin: [0, 4] as [number, number]
			})),
			{
				unbreakable: true,
				columns: [{ stack: ['Prepared by', 'Accountant'] }, { stack: ['Approved by', 'Director'] }]
			}
		]
	}).getBuffer();
	const result = await readPdf(bytes);
	expect(result.pages[0].text).toContain('Nested');
	expect(result.pages[0].text).toContain('Merged');
	const signatures = result.pages.filter((page) => page.text.includes('Prepared by'));
	expect(signatures).toHaveLength(1);
	for (const text of ['Accountant', 'Approved by', 'Director'])
		expect(signatures[0].text).toContain(text);
});

test('rejects unsupported nodes instead of silently omitting document content', async () => {
	await expect(createPdf({ content: [{ svg: '<svg/>' } as never] }).getBuffer()).rejects.toThrow(
		/svg/
	);
});

test('embeds transparent PNG logos and renders cancellation watermarks', async () => {
	const image =
		'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAACklEQVR4nGMAAQAABQABDQottAAAAABJRU5ErkJggg==';
	const bytes = await createPdf({
		watermark: { text: 'CANCELLED', opacity: 0.15, angle: 0 },
		content: [{ image, fit: [40, 40] }, 'Receipt']
	}).getBuffer();
	const images = await withPdf(bytes, (path) => command(['pdfimages', '-list', path]));
	expect(images).toMatch(/image/);
	expect(images).toMatch(/smask/);
	expect((await readPdf(bytes)).pages[0].text).toContain('CANCELLED');
});
