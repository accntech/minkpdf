import { createPdf } from 'minkpdf/core';
import { images } from 'minkpdf/images';
const unused = images;
export const document = createPdf({ content: 'Hello' });
