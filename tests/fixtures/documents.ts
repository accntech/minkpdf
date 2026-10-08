import type { TDocumentDefinitions } from '../../src/interfaces';

export const documents: Record<string, TDocumentDefinitions> = {
	columns: {
		pageSize: { width: 300, height: 200 },
		pageMargins: 20,
		content: [
			{
				columns: [
					{ text: 'Heading', width: 'auto', bold: true },
					{ text: 'Right', alignment: 'right' }
				]
			},
			{ text: 'Next', pageBreak: 'before' }
		],
		footer: (page, total) => ({ text: `${page}/${total}`, margin: [20, 0] })
	},
	table: {
		pageSize: { width: 300, height: 160 },
		pageMargins: 20,
		content: {
			margin: [30, 0, 0, 0],
			table: {
				widths: ['auto', '*'],
				headerRows: 1,
				body: [
					['Code', 'Name'],
					...Array.from({ length: 20 }, (_, i) => [String(i), `Department ${i}`])
				]
			}
		}
	},
	unicode: {
		defaultStyle: { font: 'Inter' },
		content: ['José García ₱100', { text: 'Right', alignment: 'right' }]
	}
};
