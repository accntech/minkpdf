/** The pdfmake document-definition features supported by Libro's PDF engine. */
export type PageOrientation = 'portrait' | 'landscape';
export type PageSize = 'A4' | 'LETTER' | 'LEGAL' | { width: number; height: number };
export type Margins = number | [number, number] | [number, number, number, number];
export type Size = number | 'auto' | '*' | `${number}%`;
export interface Style {
	font?: string;
	fontSize?: number;
	bold?: boolean;
	italics?: boolean;
	color?: string;
	lineHeight?: number;
	characterSpacing?: number;
	alignment?: 'left' | 'center' | 'right';
	noWrap?: boolean;
	margin?: Margins;
	fillColor?: string;
	fillOpacity?: number;
	decoration?: 'underline' | 'lineThrough' | 'overline';
}
export type Content = string | number | ContentNode | Content[];
export type Column = ContentNode;
export type TableCell = string | ContentNode;
export type TableLayout = string | CustomTableLayout;
export interface Table {
	widths?: Size[];
	body: TableCell[][];
	headerRows?: number;
	keepWithHeaderRows?: number;
	dontBreakRows?: boolean;
	heights?: number | number[] | ((row: number) => number);
}
export interface CustomTableLayout {
	hLineWidth?: (index: number, node: ContentNode & { table: Table }) => number;
	vLineWidth?: (index: number, node: ContentNode & { table: Table }) => number;
	hLineColor?: (index: number, node: ContentNode & { table: Table }) => string;
	vLineColor?: (index: number, node: ContentNode & { table: Table }) => string;
	paddingLeft?: (index: number, node: ContentNode & { table: Table }) => number;
	paddingRight?: (index: number, node: ContentNode & { table: Table }) => number;
	paddingTop?: (index: number, node: ContentNode & { table: Table }) => number;
	paddingBottom?: (index: number, node: ContentNode & { table: Table }) => number;
	fillColor?: (row: number, node: ContentNode & { table: Table }, column: number) => string | null;
	defaultBorder?: boolean;
}
export interface CanvasElement {
	type: 'line';
	x1: number;
	y1: number;
	x2: number;
	y2: number;
	lineWidth?: number;
	lineColor?: string;
}
export interface ContentNode extends Style {
	text?: Content;
	stack?: Content[];
	columns?: Content[];
	columnGap?: number;
	width?: Size;
	height?: number;
	table?: Table;
	layout?: TableLayout;
	colSpan?: number;
	border?: [boolean, boolean, boolean, boolean];
	unbreakable?: boolean;
	pageBreak?: 'before' | 'after';
	style?: string | string[];
	image?: string;
	fit?: [number, number];
	canvas?: CanvasElement[];
}
export interface TFontDictionary {
	[family: string]: { normal: string; bold?: string; italics?: string; bolditalics?: string };
}
export interface TDocumentDefinitions {
	content: Content;
	pageSize?: PageSize;
	pageOrientation?: PageOrientation;
	pageMargins?: Margins;
	defaultStyle?: Style;
	styles?: Record<string, Style>;
	info?: { title?: string; author?: string; subject?: string; keywords?: string; creator?: string };
	header?:
		| Content
		| ((
				page: number,
				total: number,
				size: { width: number; height: number; orientation: PageOrientation }
		  ) => Content);
	footer?:
		| Content
		| ((
				page: number,
				total: number,
				size: { width: number; height: number; orientation: PageOrientation }
		  ) => Content);
	watermark?:
		| string
		| {
				text: string;
				color?: string;
				opacity?: number;
				bold?: boolean;
				fontSize?: number;
				angle?: number;
		  };
}
