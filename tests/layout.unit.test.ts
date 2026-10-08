import { expect, test } from 'bun:test';
import { createPdf } from '../src/index';
import type { TDocumentDefinitions } from '../src/interfaces';
import { readPdf } from './helpers/pdf';

test.each([
	['A4', 'portrait', 595.28, 841.89],
	['LETTER', 'portrait', 612, 792],
	['LEGAL', 'landscape', 1008, 612],
	[{ width: 200, height: 300 }, 'landscape', 300, 200],
	[{ width: 300, height: 200 }, 'landscape', 300, 200]
] as const)(
	'renders %j in %s with the requested page dimensions',
	async (pageSize, pageOrientation, width, height) => {
		const calls: unknown[] = [];
		const result = await readPdf(
			await createPdf({
				pageSize,
				pageOrientation,
				pageMargins: [20, 30],
				header: (page, total, size) => {
					calls.push([page, total, size]);
					return { text: 'Header', margin: [20, 0] };
				},
				content: 'Body'
			}).getBuffer()
		);
		expect(result.pages).toHaveLength(1);
		expect(result.pages[0].width).toBe(width);
		expect(result.pages[0].height).toBe(height);
		expect(result.pages[0].text).toBe('Header Body');
		expect(result.pages[0].items.find((item) => item.str === 'Body')!.transform[4]).toBe(20);
		expect(calls).toEqual([
			[1, 1, { width, height, orientation: width > height ? 'landscape' : 'portrait' }]
		]);
	}
);

test('splits oversized table rows without losing or duplicating text', async () => {
	const lines = Array.from(
		{ length: 30 },
		(_, index) => `Line${String(index + 1).padStart(2, '0')}`
	);
	const result = await readPdf(
		await createPdf({
			pageSize: { width: 200, height: 100 },
			pageMargins: 10,
			content: {
				table: {
					headerRows: 1,
					widths: ['*'],
					body: [['Heading'], [{ stack: lines, fillColor: '#abc' }]]
				}
			}
		}).getBuffer()
	);
	expect(result.pages.length).toBeGreaterThan(2);
	expect(
		result.pages.flatMap((page) =>
			page.items.map((item) => item.str).filter((text) => text.startsWith('Line'))
		)
	).toEqual(lines);
	for (const page of result.pages) {
		expect(page.items.filter((item) => item.str === 'Heading')).toHaveLength(1);
		for (const item of page.items) {
			expect(item.transform[5]).toBeGreaterThanOrEqual(10);
			expect(item.transform[5]).toBeLessThanOrEqual(90);
		}
	}
});

test('keeps multiple table headers with the requested body rows', async () => {
	const result = await readPdf(
		await createPdf({
			pageSize: { width: 200, height: 140 },
			pageMargins: 10,
			content: [
				{ text: 'Intro', margin: [0, 0, 0, 50] },
				{
					table: {
						headerRows: 2,
						keepWithHeaderRows: 2,
						body: [['Heading'], ['Subheading'], ['First'], ['Second'], ['Third']]
					}
				}
			]
		}).getBuffer()
	);
	expect(result.pages.map((page) => page.text)).toEqual([
		'Intro',
		'Heading Subheading First Second Third'
	]);
});

test('wraps long tokens and preserves explicit newlines and rich-text characters', async () => {
	const text = 'ABCDEFGHIJKLMNOPQRSTUVWX';
	const result = await readPdf(
		await createPdf({
			pageSize: { width: 100, height: 300 },
			pageMargins: 10,
			content: [{ text }, { text: [{ text: 'First\n', bold: true }, 'Sec\u200bond'] }]
		}).getBuffer()
	);
	const words = result.pages[0].items;
	expect(
		words
			.slice(0, -2)
			.map((item) => item.str)
			.join('')
	).toBe(text);
	expect(new Set(words.slice(0, -2).map((item) => item.transform[5])).size).toBeGreaterThan(1);
	expect(words.slice(-2).map((item) => item.str)).toEqual(['First', 'Second']);
	expect(words.at(-2)!.transform[5]).toBeGreaterThan(words.at(-1)!.transform[5]);
	for (const item of words) expect(item.right).toBeLessThanOrEqual(90.001);
});

test('applies named styles in order and lets inline styles override them', async () => {
	const result = await readPdf(
		await createPdf({
			pageSize: { width: 300, height: 200 },
			pageMargins: 20,
			defaultStyle: { alignment: 'left', fontSize: 12 },
			styles: {
				base: { alignment: 'center', fontSize: 20 },
				last: { alignment: 'right', bold: true }
			},
			content: [
				{ text: 'Named', style: ['base', 'last'] },
				{ text: 'Inline', style: ['base', 'last'], alignment: 'left' },
				{ stack: ['Child'], alignment: 'right', margin: [30, 0, 0, 0] }
			]
		}).getBuffer()
	);
	const [named, inline, child] = result.pages[0].items;
	expect(named.right).toBeCloseTo(280, 2);
	expect(inline.transform[4]).toBe(20);
	expect(child.right).toBeCloseTo(280, 2);
});

test('page breaks before the first and after the last block do not create empty pages', async () => {
	const result = await readPdf(
		await createPdf({
			content: [
				{ text: 'First', pageBreak: 'before' },
				{ text: 'Second', pageBreak: 'after' },
				{ text: 'Third', pageBreak: 'after' }
			]
		}).getBuffer()
	);
	expect(result.pages.map((page) => page.text)).toEqual(['First Second', 'Third']);
});

test.each([
	[
		'horizontal margins',
		{ pageSize: { width: 100, height: 200 }, pageMargins: [50, 10] },
		'PDF margins leave no content area'
	],
	[
		'vertical margins',
		{ pageSize: { width: 200, height: 100 }, pageMargins: [10, 50] },
		'PDF margins leave no content area'
	],
	[
		'oversized text',
		{
			pageSize: { width: 200, height: 50 },
			pageMargins: 20,
			content: { text: 'Too tall', fontSize: 30 }
		},
		'PDF content cannot fit within the page margins'
	],
	[
		'invalid color',
		{ content: { text: 'Color', color: 'not-a-color' } },
		'Unsupported PDF color: not-a-color'
	],
	[
		'non-finite coordinates',
		{ content: { canvas: [{ type: 'line', x1: NaN, y1: 0, x2: 10, y2: 10 }] } },
		'PDF coordinates must be finite'
	],
	[
		'unsupported canvas',
		{ content: { canvas: [{ type: 'rect' }] } },
		'Unsupported PDF canvas element: rect'
	]
] as const)('rejects %s with a useful error', async (_name, definition, message) => {
	await expect(
		createPdf({ content: 'Body', ...definition } as TDocumentDefinitions).getBuffer()
	).rejects.toThrow(message);
});
