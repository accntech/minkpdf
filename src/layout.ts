import type {
	Content,
	ContentNode,
	CustomTableLayout,
	Style,
	TDocumentDefinitions
} from './interfaces.js';
import {
	requireFeature,
	type ImageRenderer,
	type LayoutContext,
	type TableFeature,
	type TableNode
} from './feature.js';
import {
	box,
	pageSize,
	flatten,
	margins,
	node,
	resolveNode,
	translate,
	widths as resolveWidths,
	type Block,
	type Box,
	type Draw,
	type FontResolver
} from './layout-helpers.js';

export class Layout {
	#document: TDocumentDefinitions;
	#font: FontResolver;
	#images: ImageRenderer | undefined;
	#layouts: Record<string, CustomTableLayout>;
	#tables: TableFeature | undefined;
	#pageWidth: number | undefined;
	constructor(
		document: TDocumentDefinitions,
		font: FontResolver,
		images: ImageRenderer | undefined,
		layouts: Record<string, CustomTableLayout>,
		tables: TableFeature | undefined,
		pageWidth?: number
	) {
		this.#document = document;
		this.#font = font;
		this.#images = images;
		this.#layouts = layouts;
		this.#tables = tables;
		this.#pageWidth = pageWidth;
	}
	get #context(): LayoutContext {
		return {
			resolve: (value) => resolveNode(value, this.#document.styles),
			content: (value, width, style) => this.content(value, width, style),
			intrinsic: (value, style) => this.#intrinsic(value, style),
			layouts: this.#layouts
		};
	}
	#style(value: ContentNode, parent: Style): Style {
		const style = { ...parent, ...value };
		// Node-local spacing and fills must not leak into descendants.
		for (const key of [
			'margin',
			'marginLeft',
			'marginTop',
			'marginRight',
			'marginBottom',
			'fillColor',
			'fillOpacity'
		] as const)
			delete style[key];
		return style;
	}
	#measure(text: string, style: Style): number {
		const font = this.#font(style),
			size = style.fontSize ?? 12,
			spacing = style.characterSpacing ?? 0;
		return [...text].reduce(
			(width, char) =>
				width + (font.width(font.glyph(char.codePointAt(0)!)) * size) / 1000 + spacing,
			0
		);
	}
	#runs(value: Content, style: Style): { text: string; style: Style }[] {
		if (Array.isArray(value)) return value.flatMap((child) => this.#runs(child, style));
		if (typeof value === 'object')
			return this.#runs(
				value.text ?? '',
				this.#style(resolveNode(value, this.#document.styles), style)
			);
		return [{ text: String(value).replaceAll('\u200b', ''), style }];
	}
	#text(value: ContentNode, width: number, style: Style): Box {
		const wrapper = new TextWrapper(width, !!style.noWrap, (text, style) =>
			this.#measure(text, style)
		);
		for (const run of this.#runs(value.text ?? '', style))
			for (const token of run.text.split(/(\n|[^\S\n]+|[^\s]+)/).filter(Boolean))
				wrapper.token(token, run.style);
		if (!wrapper.lines.some((line) => line.length)) return box(width, []);
		return box(
			width,
			wrapper.lines.map((line) => this.#textLine(line, width, style))
		);
	}
	#textLine(line: TextRun[], width: number, style: Style): Block {
		const size = Math.max(style.fontSize ?? 12, ...line.map((run) => run.style.fontSize ?? 12));
		const height = size * (style.lineHeight ?? 1) * 1.2;
		const lineWidth = line.reduce((sum, run) => sum + run.width, 0);
		let x =
			style.alignment === 'right'
				? width - lineWidth
				: style.alignment === 'center'
					? (width - lineWidth) / 2
					: 0;
		const draws: Draw[] = line.map((run) => {
			const draw: Draw = {
				kind: 'text',
				x,
				y: size,
				text: run.text,
				style: run.style,
				font: this.#font(run.style),
				width: run.width
			};
			x += run.width;
			return draw;
		});
		return { height, draws };
	}
	#intrinsicText(value: Content, style: Style): number {
		const lines = [0];
		for (const run of this.#runs(value, style)) {
			for (const [index, text] of run.text.split('\n').entries()) {
				if (index) lines.push(0);
				lines[lines.length - 1] += this.#measure(text, run.style);
			}
		}
		return Math.max(...lines);
	}
	#intrinsic(content: Content, parent: Style): number {
		const value = resolveNode(content, this.#document.styles),
			style = this.#style(value, parent);
		if (typeof value.width === 'number') return value.width;
		const [left, , right] = margins(value.margin);
		const width = this.#intrinsicNode(value, style);
		return width === undefined ? 0 : width + left + right;
	}
	#intrinsicNode(value: ContentNode, style: Style): number | undefined {
		if (value.text !== undefined) return this.#intrinsicText(value.text, style);
		if (value.stack)
			return Math.max(0, ...value.stack.map((child) => this.#intrinsic(child, style)));
		if (value.columns)
			return (
				value.columns.reduce<number>((sum, child) => sum + this.#intrinsic(child, style), 0) +
				(value.columnGap ?? 0) * (value.columns.length - 1)
			);
		if (value.image)
			return requireFeature(this.#images, 'images').intrinsic(
				value as ContentNode & { image: string }
			);
		if (value.table)
			return requireFeature(this.#tables, 'tables').intrinsic(
				value as TableNode,
				style,
				this.#context
			);
	}
	#columns(value: ContentNode & { columns: Content[] }, width: number, style: Style): Box {
		const gap = value.columnGap ?? 0;
		const widths = resolveWidths(
			value.columns.map((child) => node(child).width ?? '*'),
			value.columns.map((child) => this.#intrinsic(child, style)),
			width - gap * (value.columns.length - 1)
		);
		let x = 0,
			height = 0;
		const draws: Draw[] = [];
		value.columns.forEach((child, index) => {
			const column = this.content(child, widths[index], style);
			draws.push(...flatten(column).map((draw) => translate(draw, x, 0)));
			height = Math.max(height, column.height);
			x += widths[index] + gap;
		});
		return box(width, [{ height, draws }]);
	}
	#nodeContent(value: ContentNode, width: number, style: Style): Box {
		if (value.text !== undefined) return this.#text(value, width, style);
		if (value.stack)
			return box(
				width,
				value.stack.flatMap((child) => this.content(child, width, style).blocks)
			);
		if (value.columns)
			return this.#columns(value as ContentNode & { columns: Content[] }, width, style);
		if (value.table)
			return requireFeature(this.#tables, 'tables').layout(
				value as TableNode,
				width,
				style,
				this.#context
			);
		if (value.image)
			return requireFeature(this.#images, 'images').layout(
				value as ContentNode & { image: string },
				width,
				style
			);
		if (value.canvas) return canvas(value.canvas, width);
		const keys = Object.keys(value);
		if (keys.length) throw new Error(`Unsupported PDF node: ${keys.join(', ')}`);
		return box(width, []);
	}
	content(
		content: Content,
		available: number,
		parent: Style = this.#document.defaultStyle ?? {}
	): Box {
		const value = resolveNode(content, this.#document.styles),
			style = this.#style(value, parent);
		const positioned = value.absolutePosition ?? value.relativePosition;
		if (value.absolutePosition)
			available =
				(this.#pageWidth ?? pageSize(this.#document).width) -
				value.absolutePosition.x -
				margins(this.#document.pageMargins ?? 40)[2];
		const spacing = margins(positioned ? 0 : value.margin);
		const width = Math.max(1, available - spacing[0] - spacing[2]);
		let result = this.#nodeContent(value, width, style);
		// Unsupported/empty objects keep the previous early-return behavior.
		if (!Object.keys(value).length) return result;
		if (positioned) result = position(result, positioned, !!value.absolutePosition);
		return decorate(result, value, spacing);
	}
}

type TextRun = { text: string; style: Style; width: number };
class TextWrapper {
	readonly lines: TextRun[][] = [[]];
	#used = 0;
	#width: number;
	#noWrap: boolean;
	#measure: (text: string, style: Style) => number;
	constructor(width: number, noWrap: boolean, measure: (text: string, style: Style) => number) {
		this.#width = width;
		this.#noWrap = noWrap;
		this.#measure = measure;
	}
	#next(): void {
		this.lines.push([]);
		this.#used = 0;
	}
	#append(text: string, style: Style, width: number): void {
		const line = this.lines.at(-1)!,
			last = line.at(-1);
		if (last?.style === style) {
			last.text += text;
			last.width += width;
		} else line.push({ text, style, width });
		this.#used += width;
	}
	#longToken(text: string, style: Style): void {
		for (const char of text) {
			const width = this.#measure(char, style);
			if (this.#overflows(width)) this.#next();
			this.#append(char, style, width);
		}
	}
	#overflows(width: number): boolean {
		return !!this.#used && this.#used + width > this.#width + 0.001;
	}
	#leadingWhitespace(word: boolean): boolean {
		return !this.#used && !word && this.lines.length > 1;
	}
	token(text: string, style: Style): void {
		if (text === '\n') {
			this.#next();
			return;
		}
		const width = this.#measure(text, style),
			word = !!text.trim();
		const wrap = !this.#noWrap && word;
		if (wrap && this.#overflows(width)) this.#next();
		if (this.#leadingWhitespace(word)) return;
		if (wrap && width > this.#width + 0.001) this.#longToken(text, style);
		else this.#append(text, style, width);
	}
}
function canvas(lines: NonNullable<ContentNode['canvas']>, width: number): Box {
	const draws: Draw[] = lines.map((line) => {
		if (line.type !== 'line') throw new Error(`Unsupported PDF canvas element: ${line.type}`);
		return {
			kind: 'line',
			x: line.x1,
			y: line.y1,
			x2: line.x2,
			y2: line.y2,
			width: line.lineWidth ?? 1,
			color: line.lineColor ?? '#000000'
		};
	});
	return box(width, [
		{ height: Math.max(0, ...lines.map((line) => Math.max(line.y1, line.y2))), draws }
	]);
}
function position(result: Box, coordinates: { x: number; y: number }, absolute: boolean): Box {
	if (!Number.isFinite(coordinates.x) || !Number.isFinite(coordinates.y))
		throw new Error('PDF coordinates must be finite');
	return box(result.width, [
		{
			height: 0,
			draws: flatten(result).map((draw) => {
				const moved = translate(draw, coordinates.x, coordinates.y);
				return absolute ? { ...moved, absolute: true } : moved;
			})
		}
	]);
}
function decorate(result: Box, value: ContentNode, spacing: [number, number, number, number]): Box {
	const [left, top, right, bottom] = spacing;
	if (!result.blocks.length && (top || bottom || value.pageBreak))
		result = box(result.width, [{ height: 0, draws: [] }]);
	if (value.unbreakable)
		result = box(result.width, [{ height: result.height, draws: flatten(result), atomic: true }]);
	result.blocks = result.blocks.map((block, index) => ({
		...block,
		repeat: block.repeat?.map((header) => ({
			...header,
			draws: header.draws.map((draw) => translate(draw, left, 0))
		})),
		height:
			block.height + (index === 0 ? top : 0) + (index === result.blocks.length - 1 ? bottom : 0),
		draws: block.draws.map((draw) => translate(draw, left, index === 0 ? top : 0))
	}));
	if (result.blocks.length) {
		if (value.pageBreak === 'before') result.blocks[0].before = true;
		if (value.pageBreak === 'after') result.blocks.at(-1)!.after = true;
	}
	return box(result.width + left + right, result.blocks);
}

function segmentEnd(block: Block, offset: number, end: number): number {
	const crossing = block.draws.filter(
		(draw) =>
			draw.kind === 'text' &&
			draw.y > offset &&
			draw.y <= end &&
			draw.y + (draw.style.fontSize ?? 12) * 0.2 > end
	);
	if (!crossing.length) return end;
	return Math.min(
		...crossing.map((draw) => draw.y - (draw.kind === 'text' ? (draw.style.fontSize ?? 12) : 0))
	);
}
function sliceLine(draw: Extract<Draw, { kind: 'line' }>, offset: number, end: number): Draw[] {
	const start = Math.max(offset, Math.min(draw.y, draw.y2)),
		stop = Math.min(end, Math.max(draw.y, draw.y2));
	if (stop <= start) return [];
	const xAt = (y: number) => draw.x + ((draw.x2 - draw.x) * (y - draw.y)) / (draw.y2 - draw.y);
	return [{ ...draw, x: xAt(start), x2: xAt(stop), y: start - offset, y2: stop - offset }];
}
function pointInSegment(y: number, offset: number, end: number, height: number): boolean {
	return y >= offset && (y < end || (end === height && y === end));
}
function sliceDraw(draw: Draw, offset: number, end: number, height: number): Draw[] {
	if (draw.absolute) return offset === 0 ? [draw] : [];
	if (draw.kind === 'rect') {
		const start = Math.max(offset, draw.y),
			stop = Math.min(end, draw.y + draw.height);
		return stop > start ? [{ ...draw, y: start - offset, height: stop - start }] : [];
	}
	if (draw.kind === 'line' && draw.y !== draw.y2) return sliceLine(draw, offset, end);
	return pointInSegment(draw.y, offset, end, height) ? [translate(draw, 0, -offset)] : [];
}
function splitBlock(
	block: Block,
	append: (block: Block) => void,
	next: (headers?: Block[]) => void,
	remaining: () => number
): void {
	// Split oversized rows/columns at text baselines without losing characters.
	let offset = 0;
	while (offset < block.height) {
		const end = segmentEnd(block, offset, Math.min(block.height, offset + remaining()));
		if (end <= offset) throw new Error('PDF content cannot fit within the page margins');
		const draws = block.draws.flatMap((draw) => sliceDraw(draw, offset, end, block.height));
		append({ height: end - offset, draws });
		offset = end;
		if (offset < block.height) next(block.repeat);
	}
}
export function paginate(
	blocks: Block[],
	width: number,
	height: number,
	pageMargins: [number, number, number, number]
): Draw[][] {
	const [left, top, , bottom] = pageMargins,
		limit = height - bottom;
	const pages: Draw[][] = [[]];
	let y = top;
	const append = (block: Block) => {
		pages.at(-1)!.push(...block.draws.map((draw) => translate(draw, left, y)));
		y += block.height;
	};
	const next = (headers: Block[] = []) => {
		pages.push([]);
		y = top;
		for (const header of headers) append(header);
	};
	for (const [index, block] of blocks.entries()) {
		const keepHeight = blocks
			.slice(index, index + (block.keep ?? 0) + 1)
			.reduce((sum, item) => sum + item.height, 0);
		if ((block.before || y + keepHeight > limit) && y > top) next(block.repeat);
		if (block.height > limit - y) splitBlock(block, append, next, () => limit - y);
		else append(block);
		if (block.after && index < blocks.length - 1) next();
	}
	return pages;
}
