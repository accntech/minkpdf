import { cached } from '../cache.js';
import { number as n } from '../binary.js';
import { parseImage, embedImage } from '../image.js';
import { box } from '../layout-helpers.js';
import type { ImageFeature } from '../feature.js';

export function images(): ImageFeature {
	return {
		id: 'images',
		create() {
			const parsed = new Map<string, ReturnType<typeof parseImage>>();
			const ids = new Map<string, { name: string; id: number }>();
			const image = (source: string) => cached(parsed, source, () => parseImage(source));
			return {
				intrinsic: (value) => value.fit?.[0] ?? image(value.image).width,
				layout(value, width, style) {
					const dimensions = image(value.image);
					const ratio = value.fit
						? Math.min(value.fit[0] / dimensions.width, value.fit[1] / dimensions.height)
						: typeof value.width === 'number'
							? value.width / dimensions.width
							: 1;
					const imageWidth = dimensions.width * ratio,
						height = value.height ?? dimensions.height * ratio;
					const x =
						style.alignment === 'right'
							? width - imageWidth
							: style.alignment === 'center'
								? (width - imageWidth) / 2
								: 0;
					return box(imageWidth, [
						{
							height,
							draws: [{ kind: 'image', x, y: 0, width: imageWidth, height, source: value.image }]
						}
					]);
				},
				async prepare(writer) {
					for (const [source, value] of parsed)
						ids.set(source, { name: `I${ids.size + 1}`, id: await embedImage(writer, value) });
				},
				command(draw, height) {
					return `q ${n(draw.width)} 0 0 ${n(draw.height)} ${n(draw.x)} ${n(height - draw.y - draw.height)} cm /${ids.get(draw.source)!.name} Do Q\n`;
				},
				resources() {
					return [...ids.values()].map((value) => `/${value.name} ${value.id} 0 R`).join(' ');
				}
			};
		}
	};
}
