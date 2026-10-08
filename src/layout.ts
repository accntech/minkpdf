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
	flatten,
	margins,
	node,
	translate,
	widths as resolveWidths,
	type Block,
	type Box,
	type Draw,
	type FontResolver
} from './layout-helpers.js';

export class Layout {
	constructor(
		private document: TDocumentDefinitions,
		private font: FontResolver,
		private images: ImageRenderer | undefined,
		private layouts: Record<string, CustomTableLayout>,
		private tables: TableFeature | undefined
	) {}
	private get context(): LayoutContext {
		return {
			content: (value, width, style) => this.content(value, width, style),
			intrinsic: (value, style) => this.intrinsic(value, style),
			layouts: this.layouts
		};
	}
	private style(value: ContentNode, parent: Style): Style {
		const names = typeof value.style === 'string' ? [value.style] : (value.style ?? []);
		const style = {
			...parent,
			...Object.assign({}, ...names.map((name) => this.document.styles?.[name])),
			...value
		};
		// Node-local spacing and fills must not leak into descendants.
		delete style.margin;
		delete style.fillColor;
		return style;
	}
	private measure(text: string, style: Style): number {
		const font = this.font(style),
			size = style.fontSize ?? 12,
			spacing = style.characterSpacing ?? 0;
		return [...text].reduce(
			(width, char) =>
				width + (font.width(font.glyph(char.codePointAt(0)!)) * size) / 1000 + spacing,
			0
		);
	}
	private runs(value: Content, style: Style): { text: string; style: Style }[] {
		if (Array.isArray(value)) return value.flatMap((child) => this.runs(child, style));
		if (typeof value === 'object') return this.runs(value.text ?? '', this.style(value, style));
		return [{ text: String(value).replaceAll('\u200b', ''), style }];
	}
	private text(value: ContentNode, width: number, style: Style): Box {
		const lines: { text: string; style: Style; width: number }[][] = [[]];
		let used = 0;
		const next = () => {
			lines.push([]);
			used = 0;
		};
		for (const run of this.runs(value.text ?? '', style)) {
			for (const token of run.text.split(/(\n|[^\S\n]+|[^\s]+)/).filter(Boolean)) {
				if (token === '\n') {
					next();
					continue;
				}
				const tokenWidth = this.measure(token, run.style);
				if (!style.noWrap && used && used + tokenWidth > width + 0.001 && token.trim()) next();
				if (!used && !token.trim() && lines.length > 1) continue;
				if (!style.noWrap && tokenWidth > width + 0.001 && token.trim()) {
					for (const char of token) {
						const charWidth = this.measure(char, run.style);
						if (used && used + charWidth > width + 0.001) next();
						const last = lines.at(-1)!.at(-1);
						if (last?.style === run.style) {
							last.text += char;
							last.width += charWidth;
						} else lines.at(-1)!.push({ text: char, style: run.style, width: charWidth });
						used += charWidth;
					}
				} else {
					const last = lines.at(-1)!.at(-1);
					if (last?.style === run.style) {
						last.text += token;
						last.width += tokenWidth;
					} else lines.at(-1)!.push({ ...run, text: token, width: tokenWidth });
					used += tokenWidth;
				}
			}
		}
		if (!lines.some((line) => line.length)) return box(width, []);
		return box(
			width,
			lines.map((line) => {
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
						font: this.font(run.style),
						width: run.width
					};
					x += run.width;
					return draw;
				});
				return { height, draws };
			})
		);
	}
	private intrinsic(content: Content, parent: Style): number {
		const value = node(content),
			style = this.style(value, parent);
		const [left, , right] = margins(value.margin);
		if (typeof value.width === 'number') return value.width;
		if (value.text !== undefined) {
			const lines = [0];
			for (const run of this.runs(value.text, style)) {
				for (const [index, text] of run.text.split('\n').entries()) {
					if (index) lines.push(0);
					lines[lines.length - 1] += this.measure(text, run.style);
				}
			}
			return Math.max(...lines) + left + right;
		}
		if (value.stack)
			return (
				Math.max(0, ...value.stack.map((child) => this.intrinsic(child, style))) + left + right
			);
		if (value.columns)
			return (
				value.columns.reduce<number>((sum, child) => sum + this.intrinsic(child, style), 0) +
				(value.columnGap ?? 0) * (value.columns.length - 1) +
				left +
				right
			);
		if (value.image)
			return (
				requireFeature(this.images, 'images').intrinsic(value as ContentNode & { image: string }) +
				left +
				right
			);
		if (value.table)
			return (
				requireFeature(this.tables, 'tables').intrinsic(value as TableNode, style, this.context) +
				left +
				right
			);
		return 0;
	}
	content(
		content: Content,
		available: number,
		parent: Style = this.document.defaultStyle ?? {}
	): Box {
		const value = node(content),
			style = this.style(value, parent);
		const [left, top, right, bottom] = margins(value.margin),
			width = Math.max(1, available - left - right);
		let result: Box;
		if (value.text !== undefined) result = this.text(value, width, style);
		else if (value.stack)
			result = box(
				width,
				value.stack.flatMap((child) => this.content(child, width, style).blocks)
			);
		else if (value.columns) {
			const gap = value.columnGap ?? 0;
			const widths = resolveWidths(
				value.columns.map((child) => node(child).width ?? '*'),
				value.columns.map((child) => this.intrinsic(child, style)),
				width - gap * (value.columns.length - 1)
			);
			let x = 0;
			const draws: Draw[] = [];
			let height = 0;
			value.columns.forEach((child, index) => {
				const column = this.content(child, widths[index], style);
				draws.push(...flatten(column).map((draw) => translate(draw, x, 0)));
				height = Math.max(height, column.height);
				x += widths[index] + gap;
			});
			result = box(width, [{ height, draws }]);
		} else if (value.table) {
			result = requireFeature(this.tables, 'tables').layout(
				value as TableNode,
				width,
				style,
				this.context
			);
		} else if (value.image) {
			result = requireFeature(this.images, 'images').layout(
				value as ContentNode & { image: string },
				width,
				style
			);
		} else if (value.canvas) {
			const draws: Draw[] = value.canvas.map((line) => {
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
			result = box(width, [
				{ height: Math.max(0, ...value.canvas.map((line) => Math.max(line.y1, line.y2))), draws }
			]);
		} else {
			const keys = Object.keys(value);
			if (keys.length) throw new Error(`Unsupported PDF node: ${keys.join(', ')}`);
			return box(width, []);
		}
		if (!result.blocks.length && (top || bottom)) result = box(width, [{ height: 0, draws: [] }]);
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
	const next = () => {
		pages.push([]);
		y = top;
	};
	for (const [index, block] of blocks.entries()) {
		const keepHeight = blocks
			.slice(index, index + (block.keep ?? 0) + 1)
			.reduce((sum, item) => sum + item.height, 0);
		if ((block.before || y + keepHeight > limit) && y > top) {
			next();
			for (const header of block.repeat ?? []) append(header);
		}
		if (block.height > limit - y) {
			// Oversized rows/columns split at text baselines, preserving every character.
			let offset = 0;
			while (offset < block.height) {
				const remaining = limit - y;
				let end = Math.min(block.height, offset + remaining);
				const crossing = block.draws.filter(
					(draw) =>
						draw.kind === 'text' &&
						draw.y > offset &&
						draw.y <= end &&
						draw.y + (draw.style.fontSize ?? 12) * 0.2 > end
				);
				if (crossing.length)
					end = Math.min(
						...crossing.map(
							(draw) => draw.y - (draw.kind === 'text' ? (draw.style.fontSize ?? 12) : 0)
						)
					);
				if (end <= offset) throw new Error('PDF content cannot fit within the page margins');
				const draws = block.draws.flatMap((draw) => {
					if (draw.kind === 'rect') {
						const start = Math.max(offset, draw.y),
							stop = Math.min(end, draw.y + draw.height);
						return stop > start ? [{ ...draw, y: start - offset, height: stop - start }] : [];
					}
					return draw.y >= offset && draw.y < end ? [translate(draw, 0, -offset)] : [];
				});
				append({ height: end - offset, draws });
				offset = end;
				if (offset < block.height) {
					next();
					for (const header of block.repeat ?? []) append(header);
				}
			}
		} else append(block);
		if (block.after && index < blocks.length - 1) next();
	}
	return pages;
}
