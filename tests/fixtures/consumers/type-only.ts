import { createPdf } from 'minkpdf/core';
import type { images } from 'minkpdf/images';
export type ImageCapability = ReturnType<typeof images>;
export const document = createPdf({ content: 'Hello' });
