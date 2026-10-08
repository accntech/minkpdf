import { concat, fromBase64, inflate, PdfWriter } from './binary.js';

export type PdfImage = {
	bytes: Uint8Array;
	width: number;
	height: number;
	format: 'png' | 'jpeg';
	components: number;
};
export function parseImage(source: string): PdfImage {
	if (!/^data:image\/(png|jpe?g);base64,/.test(source))
		throw new Error('PDF images must be PNG or JPEG base64 data URLs');
	const bytes = fromBase64(source.slice(source.indexOf(',') + 1)),
		view = new DataView(bytes.buffer);
	if (bytes[0] === 137 && bytes[1] === 80) {
		return {
			bytes,
			format: 'png',
			width: view.getUint32(16),
			height: view.getUint32(20),
			components: 3
		};
	}
	if (bytes[0] !== 255 || bytes[1] !== 216) throw new Error('Invalid PDF image');
	let offset = 2;
	while (offset < bytes.length) {
		if (bytes[offset++] !== 255) throw new Error('Invalid JPEG marker');
		while (bytes[offset] === 255) offset++;
		const marker = bytes[offset++];
		if (marker === 217 || marker === 218) break;
		const length = view.getUint16(offset);
		if ([192, 193, 194].includes(marker))
			return {
				bytes,
				format: 'jpeg',
				width: view.getUint16(offset + 5),
				height: view.getUint16(offset + 3),
				components: bytes[offset + 7]
			};
		offset += length;
	}
	throw new Error('JPEG image has no supported frame');
}

export async function embedImage(writer: PdfWriter, image: PdfImage): Promise<number> {
	const { bytes, width, height } = image;
	if (image.format === 'jpeg')
		return writer.stream(
			bytes,
			`/Type /XObject /Subtype /Image /Width ${width} /Height ${height} /BitsPerComponent 8 /ColorSpace /${image.components === 1 ? 'DeviceGray' : image.components === 4 ? 'DeviceCMYK' : 'DeviceRGB'} /Filter /DCTDecode ${image.components === 4 ? '/Decode [1 0 1 0 1 0 1 0]' : ''}`,
			false
		);
	const view = new DataView(bytes.buffer),
		depth = bytes[24],
		type = bytes[25];
	if (depth !== 8 || bytes[28] !== 0 || ![0, 2, 3, 4, 6].includes(type))
		throw new Error('PDF logos require a non-interlaced 8-bit PNG');
	const channels = type === 6 ? 4 : type === 4 ? 2 : type === 2 ? 3 : 1;
	const parts: Uint8Array[] = [];
	let palette = new Uint8Array(),
		transparency = new Uint8Array();
	for (let offset = 8; offset < bytes.length; ) {
		const length = view.getUint32(offset),
			tag = String.fromCharCode(...bytes.subarray(offset + 4, offset + 8));
		const data = bytes.slice(offset + 8, offset + 8 + length);
		if (tag === 'IDAT') parts.push(data);
		if (tag === 'PLTE') palette = data;
		if (tag === 'tRNS') transparency = data;
		offset += length + 12;
	}
	const encoded = await inflate(concat(parts)),
		stride = width * channels;
	if (encoded.length !== height * (stride + 1)) throw new Error('Invalid PNG scanline length');
	const pixels = new Uint8Array(width * height * channels);
	const paeth = (a: number, b: number, c: number) => {
		const p = a + b - c,
			pa = Math.abs(p - a),
			pb = Math.abs(p - b),
			pc = Math.abs(p - c);
		return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
	};
	for (let row = 0; row < height; row++) {
		const filter = encoded[row * (stride + 1)];
		if (filter > 4) throw new Error('Invalid PNG scanline filter');
		for (let column = 0; column < stride; column++) {
			const index = row * stride + column,
				a = column >= channels ? pixels[index - channels] : 0,
				b = row ? pixels[index - stride] : 0,
				c = row && column >= channels ? pixels[index - stride - channels] : 0;
			pixels[index] =
				encoded[row * (stride + 1) + column + 1] +
				(filter === 1
					? a
					: filter === 2
						? b
						: filter === 3
							? Math.floor((a + b) / 2)
							: filter === 4
								? paeth(a, b, c)
								: 0);
		}
	}
	const rgb = new Uint8Array(width * height * 3),
		alpha = new Uint8Array(width * height);
	let hasAlpha = false;
	for (let index = 0; index < width * height; index++) {
		const offset = index * channels,
			pixel = pixels[offset];
		if (type === 3) rgb.set(palette.subarray(pixel * 3, pixel * 3 + 3), index * 3);
		else if (type === 0 || type === 4) rgb.fill(pixel, index * 3, index * 3 + 3);
		else rgb.set(pixels.subarray(offset, offset + 3), index * 3);
		const opacity =
			type === 6
				? pixels[offset + 3]
				: type === 4
					? pixels[offset + 1]
					: type === 3
						? (transparency[pixel] ?? 255)
						: type === 0 &&
							  transparency.length &&
							  pixel === new DataView(transparency.buffer).getUint16(0)
							? 0
							: type === 2 &&
								  transparency.length &&
								  [0, 1, 2].every(
										(channel) =>
											pixels[offset + channel] ===
											new DataView(transparency.buffer).getUint16(channel * 2)
								  )
								? 0
								: 255;
		alpha[index] = opacity;
		if (opacity < 255) hasAlpha = true;
	}
	const mask = hasAlpha
		? await writer.stream(
				alpha,
				`/Type /XObject /Subtype /Image /Width ${width} /Height ${height} /BitsPerComponent 8 /ColorSpace /DeviceGray`
			)
		: 0;
	return writer.stream(
		rgb,
		`/Type /XObject /Subtype /Image /Width ${width} /Height ${height} /BitsPerComponent 8 /ColorSpace /DeviceRGB ${mask ? `/SMask ${mask} 0 R` : ''}`
	);
}
