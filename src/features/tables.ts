import {
	box,
	flatten,
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

type Cell = { node: ContentNode; row: number; column: number; rows: number; columns: number };
type Spacing = [number, number, number, number];
type MeasuredCell = Cell & { space: Spacing; width: number; box: Box };
type Grid = { grid: Cell[][]; origins: Cell[]; count: number };
type Geometry = Grid & {
	value: TableNode;
	layout: CustomTableLayout;
	xs: number[];
	ys: number[];
	heights: number[];
};

function validateSpan(cell: Cell, axis: 'row' | 'col', limit: number): void {
	const [length, start] = axis === 'row' ? [cell.rows, cell.row] : [cell.columns, cell.column];
	if (!Number.isInteger(length) || length < 1 || start + length > limit)
		throw new Error(`Invalid PDF ${axis}Span at row ${cell.row}, column ${cell.column}`);
}
function validateCell(cell: Cell, rows: number, columns: number, headers: number): void {
	validateSpan(cell, 'row', rows);
	validateSpan(cell, 'col', columns);
	if (cell.row < headers && cell.row + cell.rows > headers)
		throw new Error('PDF rowSpan cannot cross the repeated-header boundary');
}
function occupy(grid: Cell[][], cell: Cell): void {
	for (let row = cell.row; row < cell.row + cell.rows; row++) {
		for (let column = cell.column; column < cell.column + cell.columns; column++) {
			if (grid[row][column])
				throw new Error(`Overlapping PDF spans at row ${row}, column ${column}`);
			grid[row][column] = cell;
		}
	}
}
function origin(value: TableNode, context: LayoutContext, row: number, column: number): Cell {
	const node = context.resolve(value.table.body[row][column] ?? '');
	return { node, row, column, rows: node.rowSpan ?? 1, columns: node.colSpan ?? 1 };
}
function cells(value: TableNode, context: LayoutContext): Grid {
	const body = value.table.body,
		count = body[0]?.length ?? 0;
	const grid: Cell[][] = body.map(() => Array(count)),
		origins: Cell[] = [];
	for (let row = 0; row < body.length; row++) {
		for (let column = 0; column < count; column++) {
			if (grid[row][column]) continue;
			const cell = origin(value, context, row, column);
			validateCell(cell, body.length, count, value.table.headerRows ?? 0);
			occupy(grid, cell);
			origins.push(cell);
		}
	}
	return { grid, origins, count };
}
function spanSize(sizes: number[], start: number, count: number): number {
	return sizes.slice(start, start + count).reduce((a, b) => a + b, 0);
}
function intrinsicTable(value: TableNode, style: Style, context: LayoutContext): number {
	const { origins, count } = cells(value, context),
		widths = Array<number>(count).fill(8);
	for (const cell of origins) {
		const requested = context.intrinsic(cell.node, style) + 8;
		const existing = spanSize(widths, cell.column, cell.columns);
		if (requested > existing)
			for (let c = cell.column; c < cell.column + cell.columns; c++)
				widths[c] += (requested - existing) / cell.columns;
	}
	return widths.reduce((a, b) => a + b, 0);
}
function tableLayout(value: TableNode, context: LayoutContext): CustomTableLayout {
	if (typeof value.layout !== 'string') return value.layout ?? {};
	if (value.layout === 'noBorders')
		return { defaultBorder: false, hLineWidth: () => 0, vLineWidth: () => 0 };
	const layout = context.layouts[value.layout];
	if (!layout) throw new Error(`Unknown PDF table layout: ${value.layout}`);
	return layout;
}
function padding(layout: CustomTableLayout, value: TableNode, column: number): Spacing {
	return [
		layout.paddingLeft?.(column, value) ?? 4,
		layout.paddingTop?.(column, value) ?? 2,
		layout.paddingRight?.(column, value) ?? 4,
		layout.paddingBottom?.(column, value) ?? 2
	];
}
function distributeSpan(widths: number[], cell: Cell, needed: number, value: TableNode): void {
	const automatic = Array.from({ length: cell.columns }, (_, i) => cell.column + i).filter(
		(column) => value.table.widths?.[column] === 'auto'
	);
	if (!automatic.length) return;
	const available = spanSize(widths, cell.column, cell.columns);
	for (const column of automatic)
		widths[column] += Math.max(0, needed - available) / automatic.length;
}
function columnWidths(
	geometry: Geometry,
	width: number,
	style: Style,
	context: LayoutContext
): number[] {
	const { value, origins, count, layout } = geometry;
	const intrinsic = Array<number>(count).fill(0);
	for (const cell of origins)
		if (cell.columns === 1)
			intrinsic[cell.column] = Math.max(
				intrinsic[cell.column],
				context.intrinsic(cell.node, style)
			);
	const widths = resolveWidths(
		value.table.widths ?? Array(count).fill('*'),
		intrinsic.map((w, c) => w + padding(layout, value, c)[0] + padding(layout, value, c)[2]),
		width
	);
	for (const cell of origins) {
		if (cell.columns === 1) continue;
		const space = padding(layout, value, cell.column);
		distributeSpan(widths, cell, context.intrinsic(cell.node, style) + space[0] + space[2], value);
	}
	return widths;
}
function offsets(sizes: number[]): number[] {
	const positions = [0];
	for (const size of sizes) positions.push(positions.at(-1)! + size);
	return positions;
}
function measureCells(geometry: Geometry, style: Style, context: LayoutContext): MeasuredCell[] {
	return geometry.origins.map((cell) => {
		const space = padding(geometry.layout, geometry.value, cell.column);
		const width = geometry.xs[cell.column + cell.columns] - geometry.xs[cell.column];
		return {
			...cell,
			space,
			width,
			box: context.content(cell.node, width - space[0] - space[2], style)
		};
	});
}
function requestedHeight(value: TableNode, row: number): number {
	const heights = value.table.heights;
	if (typeof heights === 'function') return heights(row);
	if (Array.isArray(heights)) return heights[row] ?? 0;
	return heights ?? 0;
}
function rowHeights(value: TableNode, cells: MeasuredCell[]): number[] {
	const heights = value.table.body.map((_, row) => requestedHeight(value, row));
	for (const cell of cells)
		if (cell.rows === 1)
			heights[cell.row] = Math.max(
				heights[cell.row],
				cell.box.height + cell.space[1] + cell.space[3]
			);
	for (const cell of cells.filter((c) => c.rows > 1).sort((a, b) => a.rows - b.rows)) {
		const available = spanSize(heights, cell.row, cell.rows);
		const needed = cell.box.height + cell.space[1] + cell.space[3];
		heights[cell.row + cell.rows - 1] += Math.max(0, needed - available);
	}
	return heights;
}
function drawCells(rows: Block[], cells: MeasuredCell[], geometry: Geometry): void {
	const { xs, ys, layout, value } = geometry;
	for (const cell of cells) {
		const draws = rows[cell.row].draws;
		const fill = cell.node.fillColor ?? layout.fillColor?.(cell.row, value, cell.column);
		if (fill)
			draws.push({
				kind: 'rect',
				x: xs[cell.column],
				y: 0,
				width: cell.width,
				height: ys[cell.row + cell.rows] - ys[cell.row],
				color: fill,
				opacity: cell.node.fillOpacity ?? 1
			});
		draws.push(
			...flatten(cell.box).map((draw) =>
				translate(draw, xs[cell.column] + cell.space[0], cell.space[1])
			)
		);
	}
}
function border(cell: Cell | undefined, side: number, layout: CustomTableLayout): boolean {
	return !!cell && (cell.node.border?.[side] ?? layout.defaultBorder !== false);
}
type LineKey = 'hLineWidth' | 'vLineWidth' | 'hLineColor' | 'vLineColor';
type LineValue<K extends LineKey> = ReturnType<NonNullable<CustomTableLayout[K]>>;
function lineValue<K extends LineKey>(
	geometry: Geometry,
	index: number,
	key: K,
	fallback: LineValue<K>
): LineValue<K> {
	const callback: ((index: number, value: TableNode) => number | string) | undefined =
		geometry.layout[key];
	return (callback?.call(geometry.layout, index, geometry.value) ?? fallback) as LineValue<K>;
}
function visibleBorder(
	first: Cell | undefined,
	second: Cell | undefined,
	side: number,
	layout: CustomTableLayout
): boolean {
	return first !== second && (border(first, side + 2, layout) || border(second, side, layout));
}
function verticalBorder(row: number, column: number, geometry: Geometry): Draw[] {
	const { grid, layout, xs, heights } = geometry;
	const left = grid[row][column - 1],
		right = grid[row][column];
	if (left && left === right) return [];
	const thickness = lineValue(
		geometry,
		column,
		'vLineWidth',
		layout.defaultBorder === false ? 0 : 1
	);
	if (!thickness || !visibleBorder(left, right, 0, layout)) return [];
	return [
		{
			kind: 'line',
			x: xs[column],
			x2: xs[column],
			y: 0,
			y2: heights[row],
			width: thickness,
			color: lineValue(geometry, column, 'vLineColor', '#000000')
		}
	];
}
function boundaryEnd(geometry: Geometry, boundary: number, column: number): number {
	const { grid, count } = geometry;
	const above = grid[boundary - 1]?.[column],
		below = grid[boundary]?.[column];
	let end = column + 1;
	while (end < count && grid[boundary - 1]?.[end] === above && grid[boundary]?.[end] === below)
		end++;
	return end;
}
function horizontalBorder(boundary: number, y: number, geometry: Geometry): Draw[] {
	const { grid, layout, xs, count } = geometry;
	const thickness = lineValue(
		geometry,
		boundary,
		'hLineWidth',
		layout.defaultBorder === false ? 0 : 1
	);
	if (!thickness) return [];
	const draws: Draw[] = [];
	for (let column = 0; column < count;) {
		const above = grid[boundary - 1]?.[column],
			below = grid[boundary]?.[column];
		const end = boundaryEnd(geometry, boundary, column);
		if (visibleBorder(above, below, 1, layout))
			draws.push({
				kind: 'line',
				x: xs[column],
				x2: xs[end],
				y,
				y2: y,
				width: thickness,
				color: lineValue(geometry, boundary, 'hLineColor', '#000000')
			});
		column = end;
	}
	return draws;
}
function drawBorders(rows: Block[], geometry: Geometry): void {
	for (let row = 0; row < rows.length; row++) {
		const draws = rows[row].draws;
		for (let column = 0; column <= geometry.count; column++)
			draws.push(...verticalBorder(row, column, geometry));
		draws.push(...horizontalBorder(row, 0, geometry));
		if (row === rows.length - 1)
			draws.push(...horizontalBorder(row + 1, geometry.heights[row], geometry));
	}
}
function groupEnd(grid: Cell[][], first: number): number {
	let end = first + 1;
	for (let row = first; row < end; row++)
		for (const cell of grid[row]) end = Math.max(end, cell.row + cell.rows);
	return end;
}
function paginationGroups(rows: Block[], geometry: Geometry): Block[] {
	const { value, grid, xs, count } = geometry;
	const groups: (Block & { first: number; last: number })[] = [];
	// Connected spans move together; oversized units still split in paginate().
	for (let first = 0; first < rows.length;) {
		const end = groupEnd(grid, first),
			group = box(xs[count], rows.slice(first, end));
		groups.push({
			height: group.height,
			draws: flatten(group),
			atomic: value.table.dontBreakRows || end > first + 1,
			first,
			last: end
		});
		first = end;
	}
	const headers = groups.filter((group) => group.last <= (value.table.headerRows ?? 0));
	let bodyGroups = 0,
		bodyRows = 0;
	while (
		headers.length + bodyGroups < groups.length &&
		bodyRows < (value.table.keepWithHeaderRows ?? 1)
	) {
		const group = groups[headers.length + bodyGroups++];
		bodyRows += group.last - group.first;
	}
	for (let index = 0; index < groups.length; index++) {
		if (index >= headers.length) groups[index].repeat = headers;
		else groups[index].keep = headers.length - index - 1 + bodyGroups;
	}
	return groups;
}
function layoutTable(value: TableNode, width: number, style: Style, context: LayoutContext): Box {
	const grid = cells(value, context);
	if (!grid.count) return box(width, []);
	const geometry: Geometry = {
		...grid,
		value,
		layout: tableLayout(value, context),
		xs: [],
		ys: [],
		heights: []
	};
	geometry.xs = offsets(columnWidths(geometry, width, style, context));
	const measured = measureCells(geometry, style, context);
	geometry.heights = rowHeights(value, measured);
	geometry.ys = offsets(geometry.heights);
	const rows: Block[] = geometry.heights.map((height) => ({
		height,
		draws: [],
		atomic: value.table.dontBreakRows
	}));
	drawCells(rows, measured, geometry);
	drawBorders(rows, geometry);
	return box(geometry.xs[grid.count], paginationGroups(rows, geometry));
}
