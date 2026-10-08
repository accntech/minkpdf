import { createPdfEngine } from './engine.js';

export { createPdfEngine };
export type { PdfDocument, PdfEngine } from './engine.js';
export type { PdfFeature } from './feature.js';

const pdf = /* @__PURE__ */ createPdfEngine();
export const createPdf = pdf.createPdf;
