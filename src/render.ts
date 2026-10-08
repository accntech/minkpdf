import { cached } from './cache.js';
import { encode, number as n, PdfWriter, unicode } from './binary.js';
import { namedColors } from './colors.js';
import type { PdfFont } from './font.js';
import { requireFeature, type ImageRenderer, type RenderFeatures } from './feature.js';
import { Layout, paginate } from './layout.js';
import { margins, pageSize, translate, type Draw, type FontResolver } from './layout-helpers.js';
import type { CustomTableLayout, Style, TDocumentDefinitions } from './interfaces.js';

function color(value = '#000000'): string {
	const hex = namedColors[value.toLowerCase()] ?? value.replace('#', '');
	if (!/^(?:[a-f\d]{3}|[a-f\d]{6})$/i.test(hex)) throw new Error(`Unsupported PDF color: ${value}`);
	const rgb =
		hex.length === 3
			? [...hex].map((char) => parseInt(char + char, 16))
			: [0, 2, 4].map((index) => parseInt(hex.slice(index, index + 2), 16));
	return rgb.map((component) => n(component / 255)).join(' ');
}

type FontUse = {
	name: string;
	characters: Map<number, string>;
	id: number;
	glyphMap?: Map<number, number>;
};
type TextDraw = Extract<Draw, { kind: 'text' }>;

type RunningPage = {
	index: number;
	total: number;
	size: { width: number; height: number };
	footerY: number;
};
function runningPage(
	layout: Layout,
	page: Draw[],
	document: TDocumentDefinitions,
	context: RunningPage
): void {
	const { width, height } = context.size;
	for (const [kind, content] of [
		['header', document.header],
		['footer', document.footer]
	] as const) {
		if (content === undefined) continue;
		const definition =
			typeof content === 'function'
				? content(context.index + 1, context.total, {
						width,
						height,
						orientation: width > height ? 'landscape' : 'portrait'
					})
				: content;
		let y = kind === 'header' ? 0 : context.footerY;
		for (const block of layout.content(definition, width).blocks) {
			page.push(...block.draws.map((draw) => translate(draw, 0, y)));
			y += block.height;
		}
	}
}
function runningContent(
	layout: Layout,
	pages: Draw[][],
	document: TDocumentDefinitions,
	size: { width: number; height: number }
): void {
	const footerY = size.height - margins(document.pageMargins ?? 40)[3];
	for (const [index, page] of pages.entries())
		runningPage(layout, page, document, { index, total: pages.length, size, footerY });
}
function watermarkStyle(
	document: TDocumentDefinitions,
	watermark: Exclude<TDocumentDefinitions['watermark'], string>
): Style {
	return {
		...document.defaultStyle,
		fontSize: watermark?.fontSize ?? 60,
		bold: watermark?.bold,
		italics: watermark?.italics ?? document.defaultStyle?.italics,
		color: watermark?.color ?? '#000000'
	};
}
function decoration(draw: TextDraw, height: number): string {
	if (!draw.style.decoration) return '';
	const offset =
		draw.style.decoration === 'lineThrough'
			? (draw.style.fontSize ?? 12) * 0.3
			: draw.style.decoration === 'overline'
				? (draw.style.fontSize ?? 12)
				: -1;
	const y = height - draw.y + offset;
	return `q ${color(draw.style.color)} RG 0.5 w ${n(draw.x)} ${n(y)} m ${n(draw.x + draw.width)} ${n(y)} l S Q\n`;
}

function resourceList(uses: Iterable<{ name: string; id: number }>): string {
	return [...uses].map((use) => `/${use.name} ${use.id} 0 R`).join(' ');
}
class RenderState {
	readonly writer = new PdfWriter();
	#root = this.writer.reserve();
	#pageTree = this.writer.reserve();
	#resources = this.writer.reserve();
	#fontUses = new Map<PdfFont, FontUse>();
	#opacityIds = new Map<number, { name: string; id: number }>();
	#watermark: Exclude<TDocumentDefinitions['watermark'], string>;
	#watermarkStyle: Style;
	#watermarkFont: PdfFont | undefined;
	#document: TDocumentDefinitions;
	#size: { width: number; height: number };
	#images: ImageRenderer | undefined;
	constructor(
		document: TDocumentDefinitions,
		font: FontResolver,
		size: { width: number; height: number },
		images?: ImageRenderer
	) {
		this.#document = document;
		this.#size = size;
		this.#images = images;
		const value = document.watermark;
		this.#watermark = value ? (typeof value === 'string' ? { text: value } : value) : undefined;
		this.#watermarkStyle = watermarkStyle(document, this.#watermark);
		this.#watermarkFont = this.#watermark ? font(this.#watermarkStyle) : undefined;
	}
	#opacity(value: number): string {
		return cached(this.#opacityIds, value, () => ({
			name: `G${this.#opacityIds.size + 1}`,
			id: this.writer.add(`<< /Type /ExtGState /ca ${n(value)} /CA ${n(value)} >>`)
		})).name;
	}
	#fontUse(face: PdfFont): FontUse {
		return cached(this.#fontUses, face, () => ({
			name: `F${this.#fontUses.size + 1}`,
			characters: new Map(),
			id: this.writer.reserve()
		}));
	}
	#collectText(face: PdfFont, text: string): void {
		const use = this.#fontUse(face);
		for (const char of text) use.characters.set(face.glyph(char.codePointAt(0)!), char);
	}
	async prepareFonts(pages: Draw[][]): Promise<void> {
		// Finalize subsets before encoding page text with the subset glyph IDs.
		for (const page of pages) {
			if (this.#watermark) this.#collectText(this.#watermarkFont!, this.#watermark.text);
			for (const draw of page) if (draw.kind === 'text') this.#collectText(draw.font, draw.text);
		}
		for (const [face, use] of this.#fontUses)
			use.glyphMap = (await face.emit(this.writer, use.id, use.characters)) || undefined;
	}
	#textCommand(draw: TextDraw): string {
		const use = this.#fontUse(draw.font);
		let text = '';
		for (const char of draw.text) {
			const glyph = draw.font.glyph(char.codePointAt(0)!);
			text += (use.glyphMap?.get(glyph) ?? glyph)
				.toString(16)
				.padStart(draw.font.glyphBytes * 2, '0');
		}
		return (
			`q ${color(draw.style.color)} rg BT /${use.name} ${n(draw.style.fontSize ?? 12)} Tf ${n(draw.style.characterSpacing ?? 0)} Tc 1 0 0 1 ${n(draw.x)} ${n(this.#size.height - draw.y)} Tm <${text}> Tj ET Q\n` +
			decoration(draw, this.#size.height)
		);
	}
	#watermarkCommand(): string {
		const watermark = this.#watermark;
		if (!watermark) return '';
		const { width, height } = this.#size,
			style = this.#watermarkStyle,
			face = this.#watermarkFont!;
		const textWidth = [...watermark.text].reduce(
			(sum, char) => sum + (face.width(face.glyph(char.codePointAt(0)!)) * style.fontSize!) / 1000,
			0
		);
		const angle =
			((watermark.angle ?? (-Math.atan(height / width) * 180) / Math.PI) * Math.PI) / 180;
		const transform = `q /${this.#opacity(watermark.opacity ?? 0.6)} gs ${n(Math.cos(angle))} ${n(-Math.sin(angle))} ${n(Math.sin(angle))} ${n(Math.cos(angle))} ${n(width / 2)} ${n(height / 2)} cm\n`;
		return (
			transform +
			this.#textCommand({
				kind: 'text',
				x: -textWidth / 2,
				y: height,
				text: watermark.text,
				font: face,
				style,
				width: textWidth
			}) +
			'Q\n'
		);
	}
	#drawCommand(draw: Draw): string {
		const height = this.#size.height;
		switch (draw.kind) {
			case 'text':
				return this.#textCommand(draw);
			case 'line':
				return `q ${color(draw.color)} RG ${n(draw.width)} w ${n(draw.x)} ${n(height - draw.y)} m ${n(draw.x2)} ${n(height - draw.y2)} l S Q\n`;
			case 'rect':
				return `q /${this.#opacity(draw.opacity)} gs ${color(draw.color)} rg ${n(draw.x)} ${n(height - draw.y - draw.height)} ${n(draw.width)} ${n(draw.height)} re f Q\n`;
			case 'image':
				return requireFeature(this.#images, 'images').command(draw, height);
		}
	}
	async page(page: Draw[]): Promise<number> {
		let commands = this.#watermarkCommand();
		for (const draw of page) commands += this.#drawCommand(draw);
		const stream = await this.writer.stream(encode(commands)),
			id = this.writer.reserve();
		this.writer.set(
			id,
			`<< /Type /Page /Parent ${this.#pageTree} 0 R /MediaBox [0 0 ${n(this.#size.width)} ${n(this.#size.height)}] /Contents ${stream} 0 R /Resources ${this.#resources} 0 R >>`
		);
		return id;
	}
	finish(pageIds: number[], autoPrint: boolean): Uint8Array {
		this.writer.set(
			this.#resources,
			`<< /Font << ${resourceList(this.#fontUses.values())} >> /XObject << ${this.#images?.resources() ?? ''} >> /ExtGState << ${resourceList(this.#opacityIds.values())} >> >>`
		);
		this.writer.set(
			this.#pageTree,
			`<< /Type /Pages /Count ${pageIds.length} /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] >>`
		);
		this.writer.set(
			this.#root,
			`<< /Type /Catalog /Pages ${this.#pageTree} 0 R${autoPrint ? ' /OpenAction << /S /Named /N /Print >>' : ''} >>`
		);
		const info = this.writer.add(
			`<< /Producer (MinkPDF) ${Object.entries(this.#document.info ?? {})
				.map(([key, value]) => `/${key[0].toUpperCase() + key.slice(1)} <FEFF${unicode(value)}>`)
				.join(' ')} >>`
		);
		return this.writer.finish(this.#root, info);
	}
}

export async function render(
	document: TDocumentDefinitions,
	font: FontResolver,
	layouts: Record<string, CustomTableLayout>,
	features: RenderFeatures,
	autoPrint = false
): Promise<Uint8Array> {
	const size = pageSize(document),
		{ width, height } = size,
		pageMargins = margins(document.pageMargins ?? 40);
	if (width <= pageMargins[0] + pageMargins[2] || height <= pageMargins[1] + pageMargins[3])
		throw new Error('PDF margins leave no content area');
	const images = features.images?.create();
	const layout = new Layout(document, font, images, layouts, features.tables, width);
	const pages = paginate(
		layout.content(document.content, width - pageMargins[0] - pageMargins[2]).blocks,
		width,
		height,
		pageMargins
	);
	runningContent(layout, pages, document, size);
	const state = new RenderState(document, font, size, images);
	await state.prepareFonts(pages);
	await images?.prepare(state.writer);
	const pageIds: number[] = [];
	for (const page of pages) pageIds.push(await state.page(page));
	return state.finish(pageIds, autoPrint);
}
