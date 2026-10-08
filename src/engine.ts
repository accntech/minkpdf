import { fromBase64, toBase64 } from './binary.js';
import {
	requireFeature,
	type PdfFeature,
	type RenderFeatures,
	type TrueTypeFeature
} from './feature.js';
import type { PdfFont } from './font.js';
import { standardFont } from './fonts/standard.js';
import type {
	CustomTableLayout,
	Style,
	TDocumentDefinitions,
	TFontDictionary
} from './interfaces.js';
import { render } from './render.js';

export interface PdfDocument {
	getBuffer(): Promise<Uint8Array>;
	getBlob(): Promise<Blob>;
	getBase64(): Promise<string>;
	getDataUrl(): Promise<string>;
}
export interface PdfEngine {
	fonts: TFontDictionary;
	addVirtualFileSystem(vfs: Record<string, string | Uint8Array>): void;
	addFonts(dictionary: TFontDictionary): void;
	addTableLayouts(dictionary: Record<string, CustomTableLayout>): void;
	createPdf(document: TDocumentDefinitions): PdfDocument;
}

export function createPdfEngine(options: { features?: readonly PdfFeature[] } = {}): PdfEngine {
	const features: RenderFeatures = {};
	let embedded: TrueTypeFeature | undefined;
	const ids = new Set<string>();
	for (const feature of options.features ?? []) {
		if (ids.has(feature.id)) throw new Error(`Duplicate PDF feature: ${feature.id}`);
		ids.add(feature.id);
		if (feature.id === 'truetype') embedded = feature;
		else if (feature.id === 'images') features.images = feature;
		else features.tables = feature;
	}
	const files: Record<string, string | Uint8Array> = {};
	const layouts: Record<string, CustomTableLayout> = {};
	const parsed = new Map<string, PdfFont>();
	const standard = new Map<string, PdfFont>();
	const fonts: TFontDictionary = {};
	function resolveFont(style: Style): PdfFont {
		const family = style.font ?? 'Helvetica';
		const key = style.bold
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
		const feature = requireFeature(embedded, 'truetype');
		const name = fonts[family]?.[key];
		if (!name || !files[name]) throw new Error(`PDF font ${family} (${key}) is not registered`);
		if (!parsed.has(name))
			parsed.set(
				name,
				feature.parse(
					typeof files[name] === 'string' ? fromBase64(files[name]) : new Uint8Array(files[name]),
					name.replace(/\.ttf$/i, '')
				)
			);
		return parsed.get(name)!;
	}
	function addFonts(dictionary: TFontDictionary): void {
		requireFeature(embedded, 'truetype');
		Object.assign(fonts, dictionary);
	}
	return {
		get fonts() {
			return fonts;
		},
		set fonts(dictionary: TFontDictionary) {
			requireFeature(embedded, 'truetype');
			const replacement = { ...dictionary };
			for (const family of Object.keys(fonts)) delete fonts[family];
			addFonts(replacement);
		},
		addFonts,
		addVirtualFileSystem(vfs) {
			requireFeature(embedded, 'truetype');
			Object.assign(files, vfs);
			for (const name of Object.keys(vfs)) parsed.delete(name);
		},
		addTableLayouts(dictionary) {
			requireFeature(features.tables, 'tables');
			Object.assign(layouts, dictionary);
		},
		createPdf(document) {
			let rendering: Promise<Uint8Array> | undefined;
			const getBuffer = () => (rendering ??= render(document, resolveFont, layouts, features));
			const getBlob = async () =>
				new Blob([new Uint8Array(await getBuffer())], { type: 'application/pdf' });
			const getBase64 = async () => toBase64(await getBuffer());
			const getDataUrl = async () => `data:application/pdf;base64,${await getBase64()}`;
			return { getBuffer, getBlob, getBase64, getDataUrl };
		}
	};
}
