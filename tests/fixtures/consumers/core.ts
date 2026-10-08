import { createPdf } from 'minkpdf/core';
export const document = createPdf({ content: 'Hello' });
