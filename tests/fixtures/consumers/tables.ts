import { createPdfEngine } from 'minkpdf/core';
import { tables } from 'minkpdf/tables';
export const engine = createPdfEngine({ features: [tables()] });
export const document = engine.createPdf({ content: { table: { body: [['Hello']] } } });
