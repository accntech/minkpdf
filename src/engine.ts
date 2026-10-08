import { cached } from './cache.js';
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
	print(target?: Window | null): Promise<void>;
}
export interface PdfEngine {
	fonts: TFontDictionary;
	addVirtualFileSystem(vfs: Record<string, string | Uint8Array>): void;
	addFonts(dictionary: TFontDictionary): void;
	addTableLayouts(dictionary: Record<string, CustomTableLayout>): void;
	createPdf(document: TDocumentDefinitions): PdfDocument;
}

class FontRegistry {
	readonly fonts: TFontDictionary = {};
	#files: Record<string, string | Uint8Array> = {};
	#parsed = new Map<string, PdfFont>();
	#standard = new Map<string, PdfFont>();
	#embedded: TrueTypeFeature | undefined;
	constructor(embedded?: TrueTypeFeature) {
		this.#embedded = embedded;
	}
	#standardFace(style: Style, key: string): PdfFont {
		return cached(this.#standard, key, () => standardFont(!!style.bold, !!style.italics));
	}
	#embeddedFace(family: string, key: 'normal' | 'bold' | 'italics' | 'bolditalics'): PdfFont {
		const feature = requireFeature(this.#embedded, 'truetype'),
			name = this.fonts[family]?.[key];
		if (!name || !this.#files[name])
			throw new Error(`PDF font ${family} (${key}) is not registered`);
		return cached(this.#parsed, name, () => {
			const file = this.#files[name];
			return feature.parse(
				typeof file === 'string' ? fromBase64(file) : new Uint8Array(file),
				name.replace(/\.ttf$/i, '')
			);
		});
	}
	resolve(style: Style): PdfFont {
		const family = style.font ?? 'Helvetica';
		const key = style.bold
			? style.italics
				? 'bolditalics'
				: 'bold'
			: style.italics
				? 'italics'
				: 'normal';
		return family === 'Helvetica'
			? this.#standardFace(style, key)
			: this.#embeddedFace(family, key);
	}
	add(dictionary: TFontDictionary): void {
		requireFeature(this.#embedded, 'truetype');
		Object.assign(this.fonts, dictionary);
	}
	replace(dictionary: TFontDictionary): void {
		requireFeature(this.#embedded, 'truetype');
		const replacement = { ...dictionary };
		for (const family of Object.keys(this.fonts)) delete this.fonts[family];
		this.add(replacement);
	}
	addFiles(vfs: Record<string, string | Uint8Array>): void {
		requireFeature(this.#embedded, 'truetype');
		Object.assign(this.#files, vfs);
		for (const name of Object.keys(vfs)) this.#parsed.delete(name);
	}
}
function selectFeatures(selected: readonly PdfFeature[]) {
	const features: RenderFeatures = {},
		ids = new Set<string>();
	let embedded: TrueTypeFeature | undefined;
	for (const feature of selected) {
		if (ids.has(feature.id)) throw new Error(`Duplicate PDF feature: ${feature.id}`);
		ids.add(feature.id);
		if (feature.id === 'truetype') embedded = feature;
		else if (feature.id === 'images') features.images = feature;
		else features.tables = feature;
	}
	return { features, embedded };
}
function pdfBlob(bytes: Uint8Array): Blob {
	return new Blob([new Uint8Array(bytes)], { type: 'application/pdf' });
}
function printUrl(destination: Window, bytes: Uint8Array): void {
	const url = URL.createObjectURL(pdfBlob(bytes));
	let timer: number | undefined,
		released = false;
	const cleanup = () => {
		if (released) return;
		released = true;
		URL.revokeObjectURL(url);
		if (timer !== undefined) window.clearInterval(timer);
		destination.removeEventListener('afterprint', cleanup);
	};
	try {
		destination.addEventListener('afterprint', cleanup, { once: true });
		timer = window.setInterval(() => {
			if (destination.closed) cleanup();
		}, 1000);
		destination.location.href = url;
	} catch (error) {
		cleanup();
		throw error;
	}
}
async function printPdf(bytes: () => Promise<Uint8Array>, target?: Window | null): Promise<void> {
	if (typeof window === 'undefined') throw new Error('PDF print requires a browser');
	// Open before awaiting to preserve the user's popup permission.
	const destination = target ?? window.open('', '_blank');
	if (!destination) throw new Error('PDF print window was blocked by the browser');
	try {
		if (destination.closed) throw new Error('PDF print window is closed');
		const rendered = await bytes();
		if (destination.closed) throw new Error('PDF print window is closed');
		printUrl(destination, rendered);
	} catch (error) {
		if (!target) destination.close();
		throw error;
	}
}
function pdfDocument(render: (autoPrint?: boolean) => Promise<Uint8Array>): PdfDocument {
	let rendering: Promise<Uint8Array> | undefined, printRendering: Promise<Uint8Array> | undefined;
	const getBuffer = () => (rendering ??= render());
	const getBlob = async () => pdfBlob(await getBuffer());
	const getBase64 = async () => toBase64(await getBuffer());
	const getDataUrl = async () => `data:application/pdf;base64,${await getBase64()}`;
	const print = (target?: Window | null) =>
		printPdf(() => (printRendering ??= render(true)), target);
	return { getBuffer, getBlob, getBase64, getDataUrl, print };
}
export function createPdfEngine(options: { features?: readonly PdfFeature[] } = {}): PdfEngine {
	const { features, embedded } = selectFeatures(options.features ?? []);
	const registry = new FontRegistry(embedded),
		layouts: Record<string, CustomTableLayout> = {};
	return {
		get fonts() {
			return registry.fonts;
		},
		set fonts(dictionary: TFontDictionary) {
			registry.replace(dictionary);
		},
		addFonts: (dictionary) => registry.add(dictionary),
		addVirtualFileSystem: (vfs) => registry.addFiles(vfs),
		addTableLayouts(dictionary) {
			requireFeature(features.tables, 'tables');
			Object.assign(layouts, dictionary);
		},
		createPdf: (document) =>
			pdfDocument((autoPrint) =>
				render(document, (style) => registry.resolve(style), layouts, features, autoPrint)
			)
	};
}
