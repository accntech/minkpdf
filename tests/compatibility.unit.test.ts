import { expect, test } from 'bun:test';
import pdf from '../src/index';
import { documents } from './fixtures/documents';
import { readPdf } from './helpers/pdf';

test('full root preserves baseline text, pagination and word positions', async () => {
	const baseline = await Bun.file(new URL('./fixtures/pdf-baseline.json', import.meta.url)).json();
	pdf.addVirtualFileSystem({
		'Inter.ttf': new Uint8Array(
			await Bun.file(new URL('./fixtures/fonts/Inter-Regular.ttf', import.meta.url)).arrayBuffer()
		)
	});
	pdf.addFonts({ Inter: { normal: 'Inter.ttf' } });
	for (const [name, definition] of Object.entries(documents)) {
		expect((await readPdf(await pdf.createPdf(definition).getBuffer())).pages).toEqual(
			baseline[name]
		);
	}
});
