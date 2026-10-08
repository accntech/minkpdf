import type { PdfFont } from '../font.js';

const helveticaWidths = [
	278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556,
	556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556, 1015, 667, 667, 722, 722, 667,
	611, 778, 722, 278, 500, 667, 556, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667,
	667, 611, 278, 278, 278, 469, 556, 333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500,
	222, 833, 556, 556, 556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584
];
const helveticaBoldWidths = [
	278, 333, 474, 556, 556, 889, 722, 278, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556,
	556, 556, 556, 556, 556, 556, 556, 333, 333, 584, 584, 584, 611, 975, 722, 722, 722, 722, 667,
	611, 778, 722, 278, 556, 722, 611, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667,
	667, 611, 333, 278, 333, 584, 556, 278, 556, 611, 556, 611, 556, 333, 611, 611, 278, 278, 556,
	278, 889, 611, 611, 611, 611, 389, 556, 333, 611, 556, 778, 556, 556, 500, 389, 280, 389, 584
];
export function standardFont(bold: boolean, italics: boolean): PdfFont {
	return {
		glyphBytes: 1,
		emit(writer, id) {
			writer.set(
				id,
				`<< /Type /Font /Subtype /Type1 /BaseFont /${this.name} /Encoding /WinAnsiEncoding >>`
			);
		},
		name: `Helvetica${bold ? (italics ? '-BoldOblique' : '-Bold') : italics ? '-Oblique' : ''}`,
		glyph(code) {
			if (code < 32 || code > 126)
				throw new Error('Non-ASCII text requires an embedded TrueType font');
			return code;
		},
		width: (glyph) => (bold ? helveticaBoldWidths : helveticaWidths)[glyph - 32],
		ascender: 718,
		descender: -207,
		bbox: [-166, -225, 1000, 931]
	};
}
