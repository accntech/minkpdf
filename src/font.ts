import type { PdfWriter } from './binary.js';

export interface PdfFont {
	name: string;
	glyph(code: number): number;
	width(glyph: number): number;
	ascender: number;
	descender: number;
	bbox: number[];
	glyphBytes: 1 | 2;
	emit(writer: PdfWriter, id: number, characters: Map<number, string>): void | Promise<void>;
}
