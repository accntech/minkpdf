import { expect, test } from 'bun:test';
import { createPdf } from '../src/index';
import { Layout, paginate } from '../src/layout';
import { flatten } from '../src/layout-helpers';
import { standardFont } from '../src/fonts/standard';
import { tables } from '../src/features/tables';
import type { TDocumentDefinitions } from '../src/interfaces';
import { readPdf } from './helpers/pdf';

function layout(document: TDocumentDefinitions, width = 300) {
	return new Layout(
		document,
		(s) => standardFont(!!s.bold, !!s.italics),
		undefined,
		{},
		tables()
	).content(document.content, width);
}
const texts = (document: TDocumentDefinitions) =>
	flatten(layout(document)).filter((d) => d.kind === 'text');

test('absolute invoice fields use page coordinates without advancing flow', async () => {
	const document: TDocumentDefinitions = {
		pageMargins: 20,
		content: [
			{
				columns: [{ width: 80, text: 'Invoice' }],
				absolutePosition: { x: 100, y: 150 },
				margin: 50
			},
			{ text: 'Body' }
		]
	};
	const result = await readPdf(await createPdf(document).getBuffer());
	expect(result.pages[0].items.find((d) => d.str === 'Invoice')!.transform[4]).toBe(100);
	expect(result.pages[0].items.find((d) => d.str === 'Body')!.transform[4]).toBe(20);
	expect(layout(document).height).toBeCloseTo(14.4);
});

test('relative nodes offset the current cursor and leave the next node in place', () => {
	const document: TDocumentDefinitions = {
		content: [
			'Before',
			{ text: 'Offset', relativePosition: { x: 80, y: -10 }, marginTop: 100 },
			'After'
		]
	};
	const [before, offset, after] = texts(document);
	expect(offset.x).toBe(80);
	expect(offset.y - before.y).toBeCloseTo(4.4);
	expect(after.y - before.y).toBeCloseTo(14.4);
});

test('absolute positions stay anchored inside columns and table cells', () => {
	const document: TDocumentDefinitions = {
		content: {
			margin: 30,
			columns: [
				{ width: 100, text: 'Left' },
				{ table: { body: [[{ text: 'Fixed', absolutePosition: { x: 75, y: 90 } }]] } }
			]
		}
	};
	const fixed = texts(document).find((d) => d.text === 'Fixed')!;
	expect(fixed.x).toBe(75);
	expect(fixed.y).toBe(102);
});

test('absolute text wraps within the remaining page width', async () => {
	const result = await readPdf(
		await createPdf({
			pageSize: { width: 200, height: 200 },
			pageMargins: 20,
			content: { text: 'One Two Three', absolutePosition: { x: 145, y: 30 } }
		}).getBuffer()
	);
	const words = result.pages[0].items;
	expect(new Set(words.map((word) => word.transform[5])).size).toBeGreaterThan(1);
	for (const word of words) expect(word.right).toBeLessThanOrEqual(180.001);
});

test('cell bottom borders remain visible when the next cell disables its top border', () => {
	const draws = flatten(
		layout({
			content: {
				table: {
					widths: [100],
					body: [
						[{ text: 'Signer', border: [false, false, false, true] }],
						[{ text: 'Position', border: [false, false, false, false] }]
					]
				}
			}
		})
	);
	expect(draws.filter((draw) => draw.kind === 'line')).toEqual([
		expect.objectContaining({ x: 0, x2: 100, y: 18.4, y2: 18.4 })
	]);
});

test('per-side margins support negative spacing and do not inherit into children', () => {
	const document: TDocumentDefinitions = {
		content: [{ stack: ['Child'], marginLeft: 25, marginTop: 10, marginBottom: -4 }, 'After']
	};
	const [child, after] = texts(document);
	expect(child.x).toBe(25);
	expect(child.y).toBe(22);
	expect(after.x).toBe(0);
	expect(after.y).toBeCloseTo(32.4);
});

test('named margins resolve in style order with node margin taking precedence', () => {
	const document: TDocumentDefinitions = {
		styles: {
			base: { margin: [5, 10, 15, 20] },
			last: { marginLeft: 25, marginBottom: 30 }
		},
		content: [
			{ text: 'Styled', style: ['base', 'last'], marginTop: 12 },
			{ text: 'Inline', style: ['base', 'last'], margin: 2, marginLeft: 99 }
		]
	};
	const [styled, inline] = texts(document);
	expect(styled.x).toBe(25);
	expect(styled.y).toBe(24);
	expect(inline.x).toBe(2);
	expect(inline.y).toBeCloseTo(70.4);
});

test('named table styles apply fills and margins without filling nested descendants', () => {
	const document: TDocumentDefinitions = {
		styles: { header: { margin: [5, 2], fillColor: 'lightgray', fillOpacity: 0.4 } },
		content: {
			table: {
				widths: [100],
				body: [[{ stack: ['Header', { table: { body: [['Nested']] } }], style: 'header' }]]
			}
		}
	};
	const draws = flatten(layout(document));
	expect(draws.filter((d) => d.kind === 'rect')).toHaveLength(1);
	expect(draws.find((d) => d.kind === 'rect')).toMatchObject({ color: 'lightgray', opacity: 0.4 });
	expect(draws.find((d) => d.kind === 'text' && d.text === 'Header')).toMatchObject({
		x: 9,
		y: 16
	});
});

test.each(['red', 'gray', 'LightGray', 'rebeccapurple'])(
	'renders CSS named color %s',
	async (color) => {
		const result = await readPdf(
			await createPdf({
				content: { text: 'Color', color },
				watermark: { text: '', color: 'gray' }
			}).getBuffer()
		);
		expect(result.pages[0].text).toBe('Color');
	}
);

test.each([false, true])('watermark italics %s override the document default', async (italics) => {
	const bytes = await createPdf({
		defaultStyle: { italics: !italics },
		content: 'Body',
		watermark: { text: 'CANCELLED', italics, color: 'red' }
	}).getBuffer();
	const pdf = new TextDecoder().decode(bytes);
	expect(pdf).toContain('/BaseFont /Helvetica /Encoding');
	expect(pdf).toContain('/BaseFont /Helvetica-Oblique /Encoding');
});

test('empty page-break markers separate bulk report content', async () => {
	const result = await readPdf(
		await createPdf({ content: ['First', { text: '', pageBreak: 'before' }, 'Second'] }).getBuffer()
	);
	expect(result.pages.map((page) => page.text)).toEqual(['First', 'Second']);
});

test('vertical spans merge fills and omit internal horizontal borders', () => {
	const box = layout({
		content: {
			table: {
				widths: [100, 100],
				heights: [30, 30],
				body: [
					[{ text: 'Name', rowSpan: 2, fillColor: '#ddd' }, 'First'],
					[{}, 'Last']
				]
			}
		}
	});
	const draws = flatten(box);
	expect(draws.find((d) => d.kind === 'rect')).toMatchObject({
		x: 0,
		y: 0,
		width: 100,
		height: 60
	});
	expect(draws.filter((d) => d.kind === 'text' && d.text === 'Name')).toHaveLength(1);
	expect(draws.filter((d) => d.kind === 'line' && d.y === 30 && d.y2 === 30)).toEqual([
		expect.objectContaining({ x: 100, x2: 200 })
	]);
	expect(box.height).toBe(60);
});

test('combined row and column spans grow to fit tall content exactly once', () => {
	const box = layout({
		content: {
			table: {
				widths: [50, 50, 50],
				body: [
					[{ text: 'One\nTwo\nThree\nFour', rowSpan: 2, colSpan: 2, fillColor: '#ddd' }, {}, 'A'],
					[{}, {}, 'B']
				]
			}
		}
	});
	const draws = flatten(box);
	expect(box.height).toBeCloseTo(61.6);
	expect(draws.find((d) => d.kind === 'rect')).toMatchObject({ width: 100 });
	expect(
		draws
			.filter((d) => d.kind === 'text')
			.map((d) => d.text)
			.sort()
	).toEqual(['A', 'B', 'Four', 'One', 'Three', 'Two']);
});

test('combined spans measure automatic columns from the merged content', () => {
	const document: TDocumentDefinitions = {
		content: {
			table: {
				widths: ['auto', 'auto', 50],
				body: [
					[{ text: 'Merged heading', rowSpan: 2, colSpan: 2 }, {}, 'A'],
					[{}, {}, 'B']
				]
			}
		}
	};
	const draws = texts(document);
	expect(draws.filter((draw) => draw.text.includes('Merged'))).toHaveLength(1);
	expect(draws.find((draw) => draw.text.includes('Merged'))!.text).toBe('Merged heading');
	expect(layout(document).height).toBeCloseTo(36.8);
});

test('span groups move together and repeat headers at page boundaries', async () => {
	const result = await readPdf(
		await createPdf({
			pageSize: { width: 240, height: 130 },
			pageMargins: 10,
			content: [
				{ text: 'Intro', marginBottom: 45 },
				{
					table: {
						headerRows: 1,
						widths: [100, 100],
						heights: 25,
						body: [
							['Header', 'Value'],
							[{ text: 'Merged', rowSpan: 2 }, 'A'],
							[{}, 'B'],
							['Next', 'C'],
							['Last', 'D']
						]
					}
				}
			]
		}).getBuffer()
	);
	expect(result.pages[0].text).toBe('Intro');
	const mergedPage = result.pages.find((p) => p.text.includes('Merged'))!;
	expect(mergedPage.text).toContain('A');
	expect(mergedPage.text).toContain('B');
	for (const page of result.pages.slice(1)) expect(page.text).toContain('Header');
	expect(result.pages.flatMap((p) => p.items).filter((d) => d.str === 'Merged')).toHaveLength(1);
});

test('oversized span groups split without losing text or vertical borders', () => {
	const lines = Array.from({ length: 15 }, (_, i) => `Line${i}`);
	const box = layout({
		content: {
			table: {
				widths: [100, 100],
				body: [
					[{ stack: lines, rowSpan: 2, fillColor: '#ddd' }, 'A'],
					[{}, 'B']
				]
			}
		}
	});
	const pages = paginate(box.blocks, 220, 100, [10, 10, 10, 10]);
	expect(pages.length).toBeGreaterThan(2);
	expect(
		pages
			.flat()
			.filter((d) => d.kind === 'text' && d.text.startsWith('Line'))
			.map((d) => d.text)
	).toEqual(lines);
	for (const page of pages) {
		expect(page.some((d) => d.kind === 'line' && d.x === 10 && d.x2 === 10 && d.y2 > d.y)).toBe(
			true
		);
		for (const draw of page.filter((d) => d.kind === 'line')) {
			expect(draw.y).toBeGreaterThanOrEqual(10);
			expect(draw.y2).toBeLessThanOrEqual(90);
		}
	}
});

test('rejects row spans beyond the table and across repeated headers', async () => {
	for (const table of [
		{ body: [[{ text: 'Bad', rowSpan: 2 }]] },
		{ headerRows: 1, body: [[{ text: 'Bad', rowSpan: 2 }], [{}]] }
	])
		await expect(createPdf({ content: { table } }).getBuffer()).rejects.toThrow('rowSpan');
});
