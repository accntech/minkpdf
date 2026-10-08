import type {
	Content,
	ContentNode,
	CustomTableLayout,
	Margins,
	Size,
	Style,
	TDocumentDefinitions
} from './interfaces';
import type { PdfFont } from './font';

export type Draw =
	| { kind: 'text'; x: number; y: number; text: string; style: Style; font: PdfFont; width: number }
	| {
			kind: 'rect';
			x: number;
			y: number;
			width: number;
			height: number;
			color: string;
			opacity: number;
	  }
	| { kind: 'line'; x: number; y: number; x2: number; y2: number; width: number; color: string }
	| { kind: 'image'; x: number; y: number; width: number; height: number; source: string };
export type Block = {
	height: number;
	draws: Draw[];
	repeat?: Block[];
	keep?: number;
	before?: boolean;
	after?: boolean;
	atomic?: boolean;
};
type Box = { width: number; height: number; blocks: Block[] };
type FontResolver = (style: Style) => PdfFont;
type ImageSize = (source: string) => { width: number; height: number };

export function margins(value: Margins = 0): [number, number, number, number] {
	if (typeof value === 'number') return [value, value, value, value];
	if (value.length === 2) return [value[0], value[1], value[0], value[1]];
	return value;
}
export function translate(draw: Draw, x: number, y: number): Draw {
	return draw.kind === 'line'
		? { ...draw, x: draw.x + x, y: draw.y + y, x2: draw.x2 + x, y2: draw.y2 + y }
		: { ...draw, x: draw.x + x, y: draw.y + y };
}
function flatten(box: Box): Draw[] {
	let y = 0;
	return box.blocks.flatMap((block) => {
		const draws = block.draws.map((draw) => translate(draw, 0, y));
		y += block.height;
		return draws;
	});
}
function box(width: number, blocks: Block[]): Box {
	return { width, blocks, height: blocks.reduce((total, block) => total + block.height, 0) };
}
function node(value: Content): ContentNode {
	return Array.isArray(value)
		? { stack: value }
		: typeof value === 'object'
			? value
			: { text: String(value) };
}

export class Layout {
	constructor(
		private document: TDocumentDefinitions,
		private font: FontResolver,
		private image: ImageSize,
		private layouts: Record<string, CustomTableLayout>
	) {}
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
		if (value.image) return (value.fit?.[0] ?? this.image(value.image).width) + left + right;
		if (value.table) {
			const count = value.table.body[0]?.length ?? 0;
			return (
				Array.from(
					{ length: count },
					(_, index) =>
						Math.max(
							0,
							...value.table!.body.map((row) => this.intrinsic(row[index] ?? '', style))
						) + 8
				).reduce((a, b) => a + b, 0) +
				left +
				right
			);
		}
		return 0;
	}
	private widths(sizes: Size[], intrinsic: number[], available: number): number[] {
		let remaining = available,
			stars = 0;
		const widths = sizes.map((size, index) => {
			if (size === '*') {
				stars++;
				return 0;
			}
			const width =
				size === 'auto'
					? intrinsic[index]
					: typeof size === 'number'
						? size
						: (parseFloat(size) * available) / 100;
			remaining -= width;
			return width;
		});
		return widths.map((width, index) =>
			sizes[index] === '*' ? Math.max(1, remaining / stars) : width
		);
	}
	private table(
		value: ContentNode & { table: NonNullable<ContentNode['table']> },
		width: number,
		style: Style
	): Box {
		const table = value.table,
			count = table.body[0]?.length ?? 0;
		if (!count) return box(width, []);
		const layout: CustomTableLayout =
			typeof value.layout === 'string'
				? value.layout === 'noBorders'
					? { defaultBorder: false, hLineWidth: () => 0, vLineWidth: () => 0 }
					: (this.layouts[value.layout] ??
						(() => {
							throw new Error(`Unknown PDF table layout: ${value.layout}`);
						})())
				: (value.layout ?? {});
		const padding = (index: number) => [
			layout.paddingLeft?.(index, value) ?? 4,
			layout.paddingTop?.(index, value) ?? 2,
			layout.paddingRight?.(index, value) ?? 4,
			layout.paddingBottom?.(index, value) ?? 2
		];
		const intrinsic = Array.from(
			{ length: count },
			(_, index) =>
				Math.max(
					0,
					...table.body.map((row) => {
						const cell = node(row[index] ?? '');
						return (cell.colSpan ?? 1) > 1 ? 0 : this.intrinsic(cell, style);
					})
				) +
				padding(index)[0] +
				padding(index)[2]
		);
		const widths = this.widths(table.widths ?? Array(count).fill('*'), intrinsic, width);
		const totalWidth = widths.reduce((a, b) => a + b, 0);
		const horizontal = (index: number, y: number, cells: ContentNode[]): Draw[] => {
			const thickness =
				layout.hLineWidth?.(index, value) ?? (layout.defaultBorder === false ? 0 : 1);
			if (!thickness) return [];
			let x = 0;
			return cells.flatMap((cell, column) => {
				const span = cell.colSpan ?? 1;
				const cellWidth = widths.slice(column, column + span).reduce((a, b) => a + b, 0);
				const enabled =
					cell.border?.[index === table.body.length ? 3 : 1] ?? layout.defaultBorder !== false;
				const draw: Draw = {
					kind: 'line',
					x,
					y,
					x2: x + cellWidth,
					y2: y,
					width: thickness,
					color: layout.hLineColor?.(index, value) ?? '#000000'
				};
				x += widths[column];
				return enabled ? [draw] : [];
			});
		};
		const rows: Block[] = table.body.map((row, index) => {
			const contents: {
				node: ContentNode;
				box: Box;
				x: number;
				width: number;
				padding: number[];
				column: number;
			}[] = [];
			let x = 0;
			for (let column = 0; column < count;) {
				const cell = node(row[column] ?? ''),
					span = cell.colSpan ?? 1;
				const cellWidth = widths.slice(column, column + span).reduce((a, b) => a + b, 0),
					space = padding(column);
				contents.push({
					node: cell,
					box: this.content(cell, cellWidth - space[0] - space[2], style),
					x,
					width: cellWidth,
					padding: space,
					column
				});
				x += cellWidth;
				column += span;
			}
			const requestedHeight =
				typeof table.heights === 'function'
					? table.heights(index)
					: Array.isArray(table.heights)
						? table.heights[index]
						: (table.heights ?? 0);
			const height = Math.max(
				requestedHeight,
				...contents.map((cell) => cell.box.height + cell.padding[1] + cell.padding[3])
			);
			const draws: Draw[] = [];
			for (const cell of contents) {
				const fill = cell.node.fillColor ?? layout.fillColor?.(index, value, cell.column);
				if (fill)
					draws.push({
						kind: 'rect',
						x: cell.x,
						y: 0,
						width: cell.width,
						height,
						color: fill,
						opacity: cell.node.fillOpacity ?? 1
					});
				draws.push(
					...flatten(cell.box).map((draw) =>
						translate(draw, cell.x + cell.padding[0], cell.padding[1])
					)
				);
				const thickness =
					layout.vLineWidth?.(cell.column, value) ?? (layout.defaultBorder === false ? 0 : 1);
				if (thickness && (cell.node.border?.[0] ?? layout.defaultBorder !== false))
					draws.push({
						kind: 'line',
						x: cell.x,
						y: 0,
						x2: cell.x,
						y2: height,
						width: thickness,
						color: layout.vLineColor?.(cell.column, value) ?? '#000000'
					});
			}
			const thickness =
				layout.vLineWidth?.(count, value) ?? (layout.defaultBorder === false ? 0 : 1);
			if (thickness && (contents.at(-1)?.node.border?.[2] ?? layout.defaultBorder !== false))
				draws.push({
					kind: 'line',
					x: totalWidth,
					y: 0,
					x2: totalWidth,
					y2: height,
					width: thickness,
					color: layout.vLineColor?.(count, value) ?? '#000000'
				});
			draws.push(...horizontal(index, 0, row.map(node)));
			if (index === table.body.length - 1)
				draws.push(...horizontal(index + 1, height, row.map(node)));
			return { height, draws, atomic: table.dontBreakRows };
		});
		const headers = rows.slice(0, table.headerRows ?? 0);
		for (let index = 0; index < rows.length; index++) {
			if (index >= headers.length) rows[index].repeat = headers;
			if (index < headers.length)
				rows[index].keep = Math.max(
					0,
					headers.length - index - 1 + (table.keepWithHeaderRows ?? 1)
				);
		}
		return box(totalWidth, rows);
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
			const widths = this.widths(
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
		} else if (value.table)
			result = this.table(
				value as ContentNode & { table: NonNullable<ContentNode['table']> },
				width,
				style
			);
		else if (value.image) {
			const dimensions = this.image(value.image);
			const ratio = value.fit
				? Math.min(value.fit[0] / dimensions.width, value.fit[1] / dimensions.height)
				: typeof value.width === 'number'
					? value.width / dimensions.width
					: 1;
			const imageWidth = dimensions.width * ratio,
				height = value.height ?? dimensions.height * ratio;
			const x =
				style.alignment === 'right'
					? width - imageWidth
					: style.alignment === 'center'
						? (width - imageWidth) / 2
						: 0;
			result = box(imageWidth, [
				{
					height,
					draws: [{ kind: 'image', x, y: 0, width: imageWidth, height, source: value.image }]
				}
			]);
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
