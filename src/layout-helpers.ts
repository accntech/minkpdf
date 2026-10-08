import type { Content, ContentNode, Margins, Size } from './interfaces.js';
import type { PdfFont } from './font.js';
import type { Style } from './interfaces.js';

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
export type Box = { width: number; height: number; blocks: Block[] };
export type FontResolver = (style: Style) => PdfFont;
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
export function flatten(box: Box): Draw[] {
	let y = 0;
	return box.blocks.flatMap((block) => {
		const draws = block.draws.map((draw) => translate(draw, 0, y));
		y += block.height;
		return draws;
	});
}
export function box(width: number, blocks: Block[]): Box {
	return { width, blocks, height: blocks.reduce((total, block) => total + block.height, 0) };
}
export function node(value: Content): ContentNode {
	return Array.isArray(value)
		? { stack: value }
		: typeof value === 'object'
			? value
			: { text: String(value) };
}

export function widths(sizes: Size[], intrinsic: number[], available: number): number[] {
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
