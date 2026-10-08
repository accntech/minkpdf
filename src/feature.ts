import type { PdfWriter } from './binary.js';
import type { PdfFont } from './font.js';
import type { Content, ContentNode, CustomTableLayout, Style, Table } from './interfaces.js';
import type { Box, Draw } from './layout-helpers.js';

export type TableNode = ContentNode & { table: Table };
export interface LayoutContext {
	resolve(content: Content): ContentNode;
	content(content: Content, width: number, parent: Style): Box;
	intrinsic(content: Content, parent: Style): number;
	layouts: Record<string, CustomTableLayout>;
}
export interface TableFeature {
	readonly id: 'tables';
	intrinsic(value: TableNode, style: Style, context: LayoutContext): number;
	layout(value: TableNode, width: number, style: Style, context: LayoutContext): Box;
}
export interface ImageRenderer {
	intrinsic(value: ContentNode & { image: string }): number;
	layout(value: ContentNode & { image: string }, width: number, style: Style): Box;
	prepare(writer: PdfWriter): Promise<void>;
	command(draw: Extract<Draw, { kind: 'image' }>, pageHeight: number): string;
	resources(): string;
}
export interface ImageFeature {
	readonly id: 'images';
	create(): ImageRenderer;
}
export interface TrueTypeFeature {
	readonly id: 'truetype';
	parse(bytes: Uint8Array, name: string): PdfFont;
}
/** Built-in capability descriptors returned by MinkPDF's feature factories. */
export type PdfFeature = TableFeature | ImageFeature | TrueTypeFeature;
export interface RenderFeatures {
	tables?: TableFeature;
	images?: ImageFeature;
}
export function requireFeature<T>(feature: T | undefined, id: PdfFeature['id']): T {
	if (!feature)
		throw new Error(
			`PDF ${id} feature is disabled; import from minkpdf/${id} and pass its factory result to createPdfEngine`
		);
	return feature;
}
