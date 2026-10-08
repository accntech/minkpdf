import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { withPdf, command, readPdf } from './helpers/pdf';
import pdf, { createPdf, addVirtualFileSystem, addFonts } from '../src/index';

test('creates readable PDF bytes and metadata with the pdfmake document API', async () => {
	const document = createPdf({
		info: { title: 'Libro export', author: 'Libro' },
		content: ['Hello Libro']
	});
	const result = await readPdf(await document.getBuffer());
	expect(result.pages[0].text).toBe('Hello Libro');
	expect(result.metadata.info).toMatchObject({
		Title: 'Libro export',
		Author: 'Libro'
	});
	expect((await document.getBlob()).type).toBe('application/pdf');
	expect(await document.getDataUrl()).toMatch(/^data:application\/pdf;base64,/);
});

test('accepts pdfmake-style font dictionary assignment', async () => {
	const original = { ...pdf.fonts };
	const font = readFileSync(new URL('./fixtures/fonts/Inter-Regular.ttf', import.meta.url));
	addVirtualFileSystem({ 'Assigned-Regular.ttf': font });
	try {
		pdf.fonts = { Assigned: { normal: 'Assigned-Regular.ttf' } };
		const bytes = await createPdf({
			defaultStyle: { font: 'Assigned' },
			content: 'José García'
		}).getBuffer();
		expect((await readPdf(bytes)).pages[0].text).toBe('José García');
	} finally {
		pdf.fonts = original;
	}
});

test('embeds and subsets TrueType fonts while preserving Unicode text', async () => {
	const font = readFileSync(new URL('./fixtures/fonts/Inter-Regular.ttf', import.meta.url));
	addVirtualFileSystem({ 'Inter-Regular.ttf': font });
	addFonts({ Inter: { normal: 'Inter-Regular.ttf' } });
	const bytes = await createPdf({
		defaultStyle: { font: 'Inter' },
		content: ['José García · ₱1,234.50 –']
	}).getBuffer();
	const result = await readPdf(bytes);
	expect(result.pages[0].text).toBe('José García · ₱1,234.50 –');
	expect(bytes.byteLength).toBeLessThan(60_000);
});

test('keeps a four-face document compact without embedding unused font metadata', async () => {
	const faces = ['Regular', 'Bold', 'Italic', 'BoldItalic'];
	addVirtualFileSystem(
		Object.fromEntries(
			faces.map((face) => [
				`Inter-${face}.ttf`,
				readFileSync(new URL(`./fixtures/fonts/Inter-${face}.ttf`, import.meta.url)).toString(
					'base64'
				)
			])
		)
	);
	addFonts({
		Inter: {
			normal: 'Inter-Regular.ttf',
			bold: 'Inter-Bold.ttf',
			italics: 'Inter-Italic.ttf',
			bolditalics: 'Inter-BoldItalic.ttf'
		}
	});
	const bytes = await createPdf({
		defaultStyle: { font: 'Inter' },
		content: [
			{ text: 'José García ₱1,234.50' },
			{ text: 'Bold', bold: true },
			{ text: 'Italic', italics: true },
			{ text: 'Both', bold: true, italics: true }
		]
	}).getBuffer();
	expect(bytes.byteLength).toBeLessThan(35_000);
	expect((await readPdf(bytes)).pages[0].text).toContain('José García ₱1,234.50');
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

test('repeats table headers at the table margin on subsequent pages', async () => {
	const bytes = await createPdf({
		pageSize: { width: 300, height: 160 },
		pageMargins: 20,
		content: [
			{
				margin: [35, 0, 0, 0],
				table: {
					headerRows: 1,
					widths: ['*'],
					body: [['Heading'], ...Array.from({ length: 20 }, (_, i) => [`Row ${i}`])]
				}
			}
		]
	}).getBuffer();
	const result = await readPdf(bytes);
	const headings = result.pages.map(
		(page) => page.items.find((item) => item.str === 'Heading')!.transform[4]
	);
	expect(headings.length).toBeGreaterThan(1);
	for (const x of headings) expect(x).toBe(headings[0]);
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
	expect(page.items.map((item) => item.str)).toContain('Cash');
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
		expect(page.text).toContain('Account');
		expect(page.text).toContain(`Page ${index + 1} of ${result.pages.length}`);
		expect(page.width).toBe(300);
		for (const item of page.items) expect(item.transform[5]).toBeGreaterThan(10);
	}
	for (let index = 1; index <= 30; index++)
		expect(result.pages.map((page) => page.text).join(' ')).toContain(`Department ${index}`);
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
