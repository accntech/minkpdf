import type { TDocumentDefinitions } from '../src/interfaces';

const header = { text: 'José García Trading', fontSize: 14, bold: true };
const footer: TDocumentDefinitions['footer'] = (page, total) => ({
	text: `Libro · Page ${page} of ${total}`,
	fontSize: 7,
	margin: [40, 0]
});
const base = {
	defaultStyle: { font: 'Inter', fontSize: 9 },
	pageMargins: [40, 40, 40, 60] as [number, number, number, number],
	footer
};

function table(rows: number): TDocumentDefinitions {
	return {
		...base,
		info: { title: `Trial balance (${rows} rows)`, author: 'Libro' },
		content: [
			header,
			{ text: 'Trial Balance', fontSize: 16, bold: true, margin: [0, 16, 0, 12] },
			{
				table: {
					headerRows: 1,
					keepWithHeaderRows: 1,
					dontBreakRows: true,
					widths: ['*', 100, 100],
					body: [
						[
							{ text: 'ACCOUNT', bold: true },
							{ text: 'DEBIT (₱)', bold: true },
							{ text: 'CREDIT (₱)', bold: true }
						],
						...Array.from({ length: rows }, (_, index) => [
							{
								text: [
									{ text: String(1000 + index), font: 'GeistMono' },
									{
										text: ` · Account ${String(index + 1).padStart(4, '0')} – branch service income`
									}
								],
								margin: [4, 4] as [number, number]
							},
							{
								text: '12,345.67',
								font: 'GeistMono',
								alignment: 'right' as const,
								margin: [4, 4] as [number, number]
							},
							{
								text: '0.00',
								font: 'GeistMono',
								alignment: 'right' as const,
								margin: [4, 4] as [number, number]
							}
						]),
						[
							{ text: 'TOTAL', bold: true },
							{
								text: `₱${(rows * 12345.67).toFixed(2)}`,
								font: 'GeistMono',
								bold: true,
								alignment: 'right'
							},
							''
						]
					]
				},
				layout: { vLineWidth: () => 0, hLineWidth: () => 0.25, hLineColor: () => '#d0d5dd' }
			}
		]
	};
}

const voucher: TDocumentDefinitions = {
	...base,
	info: { title: 'Cash voucher', author: 'Libro' },
	watermark: { text: 'CANCELLED', color: '#ff0000', opacity: 0.15, fontSize: 60 },
	content: [
		header,
		{ text: 'CASH VOUCHER CV-000123', fontSize: 13, bold: true, margin: [0, 16, 0, 12] },
		{
			table: {
				widths: ['*', 180],
				body: [
					[
						{
							stack: [
								{ text: 'PAID TO', fontSize: 7, bold: true },
								{ text: 'José García', bold: true, fontSize: 11 },
								'Makati City'
							],
							margin: [8, 8],
							fillColor: '#f6f7f8'
						},
						{
							table: {
								widths: [60, '*'],
								body: [
									['Date', '2026-10-08'],
									['Reference', 'REF-12345678901234567890']
								]
							},
							layout: 'noBorders',
							margin: [4, 4],
							fillColor: '#f6f7f8'
						}
					],
					[
						{
							text: [{ text: 'Description ', bold: true }, 'Department collection and settlement'],
							colSpan: 2,
							margin: [8, 8]
						},
						{}
					]
				]
			},
			layout: 'noBorders',
			margin: [0, 0, 0, 16]
		},
		...Array.from({ length: 20 }, (_, index) => ({
			text: `Allocation ${index + 1}: ₱1,234.50`,
			margin: [4, 4] as [number, number]
		})),
		{
			unbreakable: true,
			margin: [0, 30, 0, 0],
			columns: [
				{
					stack: [
						'Prepared by',
						{ text: 'JOSÉ GARCÍA', bold: true, margin: [0, 20, 0, 0] },
						'Accountant'
					]
				},
				{
					stack: [
						'Approved by',
						{ text: 'MARÍA SANTOS', bold: true, margin: [0, 20, 0, 0] },
						'Finance director'
					]
				}
			]
		}
	]
};

export const scenarios = [
	{
		name: 'short document',
		document: { ...base, content: [header, 'Receipt for ₱1,234.50'] },
		expected: ['Receipt', '₱1,234.50']
	},
	{ name: '100-row report', document: table(100), expected: ['Account 0100', 'TOTAL'] },
	{ name: '1,000-row report', document: table(1000), expected: ['Account 1000', 'TOTAL'] },
	{
		name: 'nested voucher',
		document: voucher,
		expected: ['Allocation 20', 'JOSÉ GARCÍA', 'MARÍA SANTOS']
	},
	{
		name: 'invoice overlay',
		document: {
			defaultStyle: { font: 'Inter', fontSize: 9 },
			pageSize: { width: 420, height: 595 },
			pageMargins: 0,
			content: [
				{ text: 'INV-000123', absolutePosition: { x: 300, y: 30 } },
				{
					columns: [{ width: 240, text: 'José García', noWrap: true }],
					absolutePosition: { x: 40, y: 75 }
				},
				...Array.from({ length: 10 }, (_, index) => ({
					columns: [
						{ width: 230, text: `Service ${index + 1}` },
						{ width: 100, text: '₱1,234.50', alignment: 'right' as const }
					],
					absolutePosition: { x: 40, y: 130 + index * 18 }
				})),
				{
					columns: [{ width: 330, text: 'TOTAL ₱12,345.00', alignment: 'right' }],
					absolutePosition: { x: 40, y: 360 },
					bold: true
				}
			]
		} satisfies TDocumentDefinitions,
		expected: ['INV-000123', 'José García', 'Service 10', 'TOTAL ₱12,345.00']
	},
	{
		name: 'ERP registration form',
		document: {
			...base,
			styles: {
				title: { bold: true, fontSize: 14, marginTop: 12, marginBottom: 12 },
				label: { bold: true, fillColor: 'lightgray', margin: [3, 2] },
				value: { marginLeft: 3, marginTop: 2, marginBottom: 2 }
			},
			watermark: {
				text: 'CANCELLED',
				color: 'red',
				opacity: 0.15,
				bold: true,
				italics: false,
				fontSize: 70
			},
			content: [
				header,
				{ text: 'REGISTRATION FORM', style: 'title' },
				{ text: 'REG-000123', relativePosition: { x: 350, y: -20 } },
				{
					table: {
						widths: [85, '*', '*'],
						body: [
							[
								{ text: 'Name', rowSpan: 2, style: 'label' },
								{ text: 'GARCÍA', style: 'value' },
								{ text: 'JOSÉ', style: 'value' }
							],
							[{}, 'Last name', 'First name'],
							[
								{ text: 'Address', rowSpan: 2, style: 'label' },
								{ text: 'Makati City', colSpan: 2, style: 'value' },
								{}
							],
							[{}, { text: 'Metro Manila', colSpan: 2 }, {}]
						]
					},
					marginBottom: 16
				},
				{
					table: {
						widths: [85, '*', 75],
						headerRows: 1,
						body: [
							['CODE', 'DESCRIPTION', 'UNITS'].map((text) => ({ text, style: 'label' })),
							...Array.from({ length: 15 }, (_, index) => [
								`SUB-${index + 1}`,
								`Subject ${index + 1}`,
								'3'
							]),
							[{ text: 'TOTAL UNITS', colSpan: 2, bold: true }, {}, '45']
						]
					}
				},
				{ text: 'Prepared by: MARÍA SANTOS', marginTop: 20, color: 'gray' }
			]
		} satisfies TDocumentDefinitions,
		expected: [
			'REGISTRATION FORM',
			'REG-000123',
			'GARCÍA',
			'Makati City',
			'Subject 15',
			'TOTAL UNITS',
			'MARÍA SANTOS'
		]
	}
];
