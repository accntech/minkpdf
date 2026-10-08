import { expect, test } from 'bun:test';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { deflateSync } from 'node:zlib';
import { createPdfEngine } from '../src/core';
import { images } from '../src/features/images';
import { command, withPdf } from './helpers/pdf';

const source = (bytes: Uint8Array) =>
	`data:image/png;base64,${Buffer.from(bytes).toString('base64')}`;
const fixture = (name: string) =>
	readFileSync(new URL(`./fixtures/images/${name}.png`, import.meta.url));

// Poppler writes binary PPM/PGM files with this header and uncompressed pixel bytes.
function pixels(path: string) {
	const bytes = readFileSync(path);
	const header = bytes.toString('ascii').match(/^P[56]\s+(\d+)\s+(\d+)\s+255\s/);
	if (!header) throw new Error(`Unexpected extracted image header: ${path}`);
	return {
		width: Number(header[1]),
		height: Number(header[2]),
		bytes: [...bytes.subarray(header[0].length)]
	};
}

test.each([
	[
		'filters',
		5,
		[
			10, 20, 30, 40, 50, 60, 70, 80, 90, 20, 40, 60, 80, 100, 120, 140, 160, 180, 30, 60, 90, 120,
			150, 180, 210, 240, 14, 45, 75, 105, 135, 165, 195, 225, 255, 29, 90, 20, 200, 60, 190, 30,
			250, 80, 150
		],
		undefined
	],
	['gray', 1, [0, 0, 0, 128, 128, 128, 255, 255, 255], undefined],
	['gray-alpha', 1, [0, 0, 0, 128, 128, 128, 255, 255, 255], [0, 127, 255]],
	['rgba', 1, [255, 0, 0, 0, 255, 0, 0, 0, 255], [0, 127, 255]],
	['indexed', 1, [255, 0, 0, 0, 255, 0, 0, 0, 255], [0, 127, 255]],
	['gray-key', 1, [0, 0, 0, 128, 128, 128, 255, 255, 255], [255, 0, 255]],
	['rgb-key', 1, [255, 0, 0, 0, 255, 0, 0, 0, 255], [255, 0, 255]]
] as const)('preserves %s PNG pixels and transparency', async (name, height, rgb, alpha) => {
	const bytes = await createPdfEngine({ features: [images()] })
		.createPdf({ content: { image: source(fixture(name)) } })
		.getBuffer();
	await withPdf(bytes, async (path) => {
		const directory = dirname(path);
		await command(['pdfimages', path, join(directory, 'pixels')]);
		const files = readdirSync(directory);
		const colors = files.filter((file) => file.endsWith('.ppm')).sort();
		expect(colors).toHaveLength(alpha ? 2 : 1);
		expect(pixels(join(directory, colors[0]))).toEqual({ width: 3, height, bytes: [...rgb] });
		// pdfimages expands the grayscale soft mask into RGB when writing PPM.
		if (alpha)
			expect(pixels(join(directory, colors[1]))).toEqual({
				width: 3,
				height,
				bytes: alpha.flatMap((value) => [value, value, value])
			});
	});
});

test('reuses one image resource for repeated placements within a document', async () => {
	const image = source(fixture('filters'));
	const bytes = await createPdfEngine({ features: [images()] })
		.createPdf({
			content: [{ image }, { image, width: 30 }, { image, fit: [60, 60] }]
		})
		.getBuffer();
	const rows = (await withPdf(bytes, (path) => command(['pdfimages', '-list', path])))
		.trim()
		.split('\n')
		.slice(2)
		.map((row) => row.trim().split(/\s+/));
	expect(rows).toHaveLength(3);
	// Poppler lists placements; object and generation identify the shared PDF resource.
	expect(new Set(rows.map((row) => `${row[10]} ${row[11]}`)).size).toBe(1);
});

test.each([
	['external URL', 'https://example.com/logo.png', 'PNG or JPEG base64 data URLs'],
	['invalid image bytes', 'data:image/png;base64,AAAA', 'Invalid PDF image'],
	['invalid JPEG marker', 'data:image/jpeg;base64,/9gAAA==', 'Invalid JPEG marker'],
	['missing JPEG frame', 'data:image/jpeg;base64,/9j/2Q==', 'JPEG image has no supported frame']
])('rejects %s', async (_name, image, message) => {
	await expect(
		createPdfEngine({ features: [images()] })
			.createPdf({ content: { image } })
			.getBuffer()
	).rejects.toThrow(message);
});

test.each([
	['bit depth', 24, 16],
	['color type', 25, 1],
	['interlacing', 28, 1]
] as const)('rejects unsupported PNG %s', async (_name, offset, value) => {
	const bytes = Buffer.from(fixture('gray'));
	bytes[offset] = value;
	await expect(
		createPdfEngine({ features: [images()] })
			.createPdf({ content: { image: source(bytes) } })
			.getBuffer()
	).rejects.toThrow('non-interlaced 8-bit PNG');
});

test.each([
	['scanline length', [0, 128], 'Invalid PNG scanline length'],
	['scanline filter', [5, 0, 128, 255], 'Invalid PNG scanline filter']
] as const)('rejects invalid PNG %s', async (_name, scanline, message) => {
	const original = fixture('gray');
	const compressed = deflateSync(new Uint8Array(scanline));
	const length = Buffer.alloc(4);
	length.writeUInt32BE(compressed.length);
	// Replace IDAT payload. CRC is ignored by the decoder; keep the unchanged IEND chunk.
	const bytes = Buffer.concat([
		original.subarray(0, 33),
		length,
		Buffer.from('IDAT'),
		compressed,
		Buffer.alloc(4),
		original.subarray(-12)
	]);
	await expect(
		createPdfEngine({ features: [images()] })
			.createPdf({ content: { image: source(bytes) } })
			.getBuffer()
	).rejects.toThrow(message);
});
