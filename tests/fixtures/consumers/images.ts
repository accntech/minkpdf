import { createPdfEngine } from 'minkpdf/core';
import { images } from 'minkpdf/images';
export const engine = createPdfEngine({ features: [images()] });
export const document = engine.createPdf({
	content: [
		'Hello',
		{
			image:
				'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAACklEQVR4nGMAAQAABQABDQottAAAAABJRU5ErkJggg==',
			fit: [20, 20]
		}
	]
});
