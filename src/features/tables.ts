import {
	box,
	flatten,
	node,
	translate,
	widths as resolveWidths,
	type Block,
	type Box,
	type Draw
} from '../layout-helpers.js';
import type { ContentNode, CustomTableLayout, Style } from '../interfaces.js';
import type { LayoutContext, TableFeature, TableNode } from '../feature.js';

export function tables(): TableFeature {
	return { id: 'tables', layout: layoutTable, intrinsic: intrinsicTable };
}
function intrinsicTable(value: TableNode, style: Style, context: LayoutContext): number {
	const count = value.table.body[0]?.length ?? 0;
	return Array.from(
		{ length: count },
		(_, index) =>
			Math.max(0, ...value.table!.body.map((row) => context.intrinsic(row[index] ?? '', style))) + 8
	).reduce((a, b) => a + b, 0);
}
function layoutTable(
	value: ContentNode & { table: NonNullable<ContentNode['table']> },
	width: number,
	style: Style,
	context: LayoutContext
): Box {
	const table = value.table,
		count = table.body[0]?.length ?? 0;
	if (!count) return box(width, []);
	const layout: CustomTableLayout =
		typeof value.layout === 'string'
			? value.layout === 'noBorders'
				? { defaultBorder: false, hLineWidth: () => 0, vLineWidth: () => 0 }
				: (context.layouts[value.layout] ??
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
					return (cell.colSpan ?? 1) > 1 ? 0 : context.intrinsic(cell, style);
				})
			) +
			padding(index)[0] +
			padding(index)[2]
	);
	const widths = resolveWidths(table.widths ?? Array(count).fill('*'), intrinsic, width);
	const totalWidth = widths.reduce((a, b) => a + b, 0);
	const horizontal = (index: number, y: number, cells: ContentNode[]): Draw[] => {
		const thickness = layout.hLineWidth?.(index, value) ?? (layout.defaultBorder === false ? 0 : 1);
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
		for (let column = 0; column < count; ) {
			const cell = node(row[column] ?? ''),
				span = cell.colSpan ?? 1;
			const cellWidth = widths.slice(column, column + span).reduce((a, b) => a + b, 0),
				space = padding(column);
			contents.push({
				node: cell,
				box: context.content(cell, cellWidth - space[0] - space[2], style),
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
		const thickness = layout.vLineWidth?.(count, value) ?? (layout.defaultBorder === false ? 0 : 1);
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
			rows[index].keep = Math.max(0, headers.length - index - 1 + (table.keepWithHeaderRows ?? 1));
	}
	return box(totalWidth, rows);
}
