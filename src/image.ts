import { zeros, dataView, concat, fromBase64, inflate, PdfWriter } from './binary.js';

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
		view = dataView(bytes);
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

type Png = {
	channels: number;
	type: number;
	parts: Uint8Array[];
	palette: Uint8Array;
	transparency: Uint8Array;
};

function readPng(bytes: Uint8Array): Png {
	const depth = bytes[24],
		type = bytes[25];
	if (depth !== 8 || bytes[28] !== 0 || ![0, 2, 3, 4, 6].includes(type))
		throw new Error('PDF logos require a non-interlaced 8-bit PNG');
	const channels = ({ 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 } as Record<number, number>)[type];
	const png: Png = {
		channels,
		type,
		parts: [],
		palette: zeros(),
		transparency: zeros()
	};
	const view = dataView(bytes);
	for (let offset = 8; offset < bytes.length;) {
		const length = view.getUint32(offset);
		const tag = String.fromCharCode(...bytes.subarray(offset + 4, offset + 8));
		const data = bytes.slice(offset + 8, offset + 8 + length);
		if (tag === 'IDAT') png.parts.push(data);
		if (tag === 'PLTE') png.palette = data;
		if (tag === 'tRNS') png.transparency = data;
		offset += length + 12;
	}
	return png;
}

function paeth(a: number, b: number, c: number): number {
	const p = a + b - c;
	const pa = Math.abs(p - a),
		pb = Math.abs(p - b),
		pc = Math.abs(p - c);
	if (pa <= pb && pa <= pc) return a;
	return pb <= pc ? b : c;
}

function predictor(filter: number, a: number, b: number, c: number): number {
	switch (filter) {
		case 1:
			return a;
		case 2:
			return b;
		case 3:
			return Math.floor((a + b) / 2);
		case 4:
			return paeth(a, b, c);
		default:
			return 0;
	}
}

type Scanlines = { encoded: Uint8Array; pixels: Uint8Array; stride: number; channels: number };
function unfilterRow(scanlines: Scanlines, row: number): void {
	const { encoded, pixels, stride, channels } = scanlines;
	const filter = encoded[row * (stride + 1)];
	if (filter > 4) throw new Error('Invalid PNG scanline filter');
	for (let column = 0; column < stride; column++) {
		const index = row * stride + column;
		const a = column >= channels ? pixels[index - channels] : 0;
		const b = row ? pixels[index - stride] : 0;
		const c = row && column >= channels ? pixels[index - stride - channels] : 0;
		pixels[index] = encoded[row * (stride + 1) + column + 1] + predictor(filter, a, b, c);
	}
}
function unfilter(
	encoded: Uint8Array,
	width: number,
	height: number,
	channels: number
): Uint8Array {
	const stride = width * channels;
	if (encoded.length !== height * (stride + 1)) throw new Error('Invalid PNG scanline length');
	const pixels = zeros(width * height * channels),
		scanlines = { encoded, pixels, stride, channels };
	for (let row = 0; row < height; row++) unfilterRow(scanlines, row);
	return pixels;
}

function pixelAlpha(png: Png, pixels: Uint8Array, offset: number): number {
	const { type, transparency } = png;
	if (type === 6) return pixels[offset + 3];
	if (type === 4) return pixels[offset + 1];
	if (type === 3) return transparency[pixels[offset]] ?? 255;
	if (!transparency.length) return 255;
	const key = dataView(transparency);
	const channels = type === 0 ? 1 : 3;
	for (let channel = 0; channel < channels; channel++)
		if (pixels[offset + channel] !== key.getUint16(channel * 2)) return 255;
	return 0;
}

function colorPlanes(png: Png, pixels: Uint8Array, count: number) {
	const rgb = zeros(count * 3),
		alpha = zeros(count);
	let hasAlpha = false;
	for (let index = 0; index < count; index++) {
		const offset = index * png.channels,
			pixel = pixels[offset];
		if (png.type === 3) rgb.set(png.palette.subarray(pixel * 3, pixel * 3 + 3), index * 3);
		else if (png.type === 0 || png.type === 4) rgb.fill(pixel, index * 3, index * 3 + 3);
		else rgb.set(pixels.subarray(offset, offset + 3), index * 3);
		alpha[index] = pixelAlpha(png, pixels, offset);
		if (alpha[index] < 255) hasAlpha = true;
	}
	return { rgb, alpha, hasAlpha };
}

export async function embedImage(writer: PdfWriter, image: PdfImage): Promise<number> {
	const { bytes, width, height } = image;
	const dictionary = `/Type /XObject /Subtype /Image /Width ${width} /Height ${height} /BitsPerComponent 8`;
	if (image.format === 'jpeg') {
		const space =
			image.components === 1 ? 'DeviceGray' : image.components === 4 ? 'DeviceCMYK' : 'DeviceRGB';
		const decode = image.components === 4 ? '/Decode [1 0 1 0 1 0 1 0]' : '';
		return writer.stream(
			bytes,
			`${dictionary} /ColorSpace /${space} /Filter /DCTDecode ${decode}`,
			false
		);
	}
	const png = readPng(bytes);
	const encoded = await inflate(concat(png.parts));
	const pixels = unfilter(encoded, width, height, png.channels);
	const { rgb, alpha, hasAlpha } = colorPlanes(png, pixels, width * height);
	const mask = hasAlpha ? await writer.stream(alpha, `${dictionary} /ColorSpace /DeviceGray`) : 0;
	return writer.stream(
		rgb,
		`${dictionary} /ColorSpace /DeviceRGB ${mask ? `/SMask ${mask} 0 R` : ''}`
	);
}
