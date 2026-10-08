import { createPdfEngine } from 'minkpdf/core';
import { trueTypeFonts } from 'minkpdf/truetype';
export const engine = createPdfEngine({ features: [trueTypeFonts()] });
export const document = engine.createPdf({ content: 'Hello' });
