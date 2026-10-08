import pdf from 'minkpdf';
export const engine = pdf;
export const document = pdf.createPdf({ content: 'Hello' });
