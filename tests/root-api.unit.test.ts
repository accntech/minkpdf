import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import pdf, {
	addFonts,
	addVirtualFileSystem,
	addTableLayouts,
	createPdf,
	fonts
} from '../src/index';
import type { CustomTableLayout } from '../src/interfaces';
import { readPdf } from './helpers/pdf';

test('named root resource registration shares fonts and preserves layout callback receivers', async () => {
	const previous = { ...pdf.fonts };
	try {
		addVirtualFileSystem({
			'RootFixture.ttf': readFileSync(
				new URL('./fixtures/fonts/Inter-Regular.ttf', import.meta.url)
			)
		});
		addFonts({ RootFixture: { normal: 'RootFixture.ttf' } });
		expect(fonts).toBe(pdf.fonts);
		expect(fonts.RootFixture).toEqual({ normal: 'RootFixture.ttf' });
		const layout: CustomTableLayout = {
			defaultBorder: false,
			hLineWidth() {
				return this.defaultBorder === false ? 1 : 0;
			},
			vLineWidth() {
				return this.defaultBorder === false ? 1 : 0;
			},
			hLineColor() {
				return this.defaultBorder === false ? 'red' : 'black';
			},
			vLineColor() {
				return this.defaultBorder === false ? 'red' : 'black';
			}
		};
		addTableLayouts({ rootFixture: layout });
		const bytes = await createPdf({
			defaultStyle: { font: 'RootFixture' },
			content: {
				layout: 'rootFixture',
				table: { body: [[{ text: 'José ₱100', border: [true, true, true, true] }]] }
			}
		}).getBuffer();
		expect((await readPdf(bytes)).pages[0].text).toBe('José ₱100');
		pdf.fonts = previous;
		expect(fonts).toBe(pdf.fonts);
		expect(fonts.RootFixture).toBeUndefined();
	} finally {
		pdf.fonts = previous;
	}
});
