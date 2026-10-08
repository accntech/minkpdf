import { createPdfEngine } from './engine.js';
import { tables } from './features/tables.js';
import { images } from './features/images.js';
import { trueTypeFonts } from './features/true-type.js';

const pdf = /* @__PURE__ */ createPdfEngine({ features: [tables(), images(), trueTypeFonts()] });
export const { fonts, addFonts, addVirtualFileSystem, addTableLayouts, createPdf } = pdf;
export default pdf;
