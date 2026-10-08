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
	}
];
