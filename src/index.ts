import { fromBase64, toBase64 } from './binary';
import { standardFont, trueType, type PdfFont } from './font';
import type { CustomTableLayout, Style, TDocumentDefinitions, TFontDictionary } from './interfaces';
import { render } from './render';

const files: Record<string, string | Uint8Array> = {};
const layouts: Record<string, CustomTableLayout> = {};
const parsed = new Map<string, PdfFont>();
const standard = new Map<string, PdfFont>();
export const fonts: TFontDictionary = {};
export function addVirtualFileSystem(vfs: Record<string, string | Uint8Array>): void {
	Object.assign(files, vfs);
	for (const name of Object.keys(vfs)) parsed.delete(name);
}
export function addFonts(dictionary: TFontDictionary): void {
	Object.assign(fonts, dictionary);
}
export function addTableLayouts(dictionary: Record<string, CustomTableLayout>): void {
	Object.assign(layouts, dictionary);
}
function resolveFont(style: Style): PdfFont {
	const family = style.font ?? 'Helvetica',
		key = style.bold
			? style.italics
				? 'bolditalics'
				: 'bold'
			: style.italics
				? 'italics'
				: 'normal';
	if (family === 'Helvetica') {
		if (!standard.has(key)) standard.set(key, standardFont(!!style.bold, !!style.italics));
		return standard.get(key)!;
	}
	const name = fonts[family]?.[key];
	if (!name || !files[name]) throw new Error(`PDF font ${family} (${key}) is not registered`);
	if (!parsed.has(name))
		parsed.set(
			name,
			trueType(
				typeof files[name] === 'string' ? fromBase64(files[name]) : files[name],
				name.replace(/\.ttf$/i, '')
			)
		);
	return parsed.get(name)!;
}
export function createPdf(document: TDocumentDefinitions) {
	let rendering: Promise<Uint8Array> | undefined;
	const getBuffer = () => (rendering ??= render(document, resolveFont, layouts));
	const getBlob = async () =>
		new Blob([new Uint8Array(await getBuffer())], { type: 'application/pdf' });
	const getBase64 = async () => toBase64(await getBuffer());
	const getDataUrl = async () => `data:application/pdf;base64,${await getBase64()}`;
	return { getBuffer, getBlob, getBase64, getDataUrl };
}

const pdf = {
	get fonts() {
		return fonts;
	},
	set fonts(dictionary: TFontDictionary) {
		const replacement = { ...dictionary };
		for (const family of Object.keys(fonts)) delete fonts[family];
		addFonts(replacement);
	},
	addFonts,
	addVirtualFileSystem,
	addTableLayouts,
	createPdf
};
export default pdf;
