import { concat, encode, unicode } from './binary';

export interface PdfFont {
	name: string;
	glyph(code: number): number;
	width(glyph: number): number;
	ascender: number;
	descender: number;
	bbox: number[];
	subset?: (characters: Map<number, string>) => {
		bytes: Uint8Array;
		glyphMap: Map<number, number>;
	};
}

/** Reads Unicode cmaps and horizontal metrics and subsets referenced outlines. */
export function trueType(bytes: Uint8Array, name: string): PdfFont {
	const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
	const tables = new Map<string, { offset: number; length: number }>();
	for (let index = 0; index < view.getUint16(4); index++) {
		const start = 12 + index * 16;
		tables.set(String.fromCharCode(...bytes.subarray(start, start + 4)), {
			offset: view.getUint32(start + 8),
			length: view.getUint32(start + 12)
		});
	}
	const table = (tag: string) => {
		const entry = tables.get(tag);
		if (!entry || entry.offset + entry.length > bytes.length)
			throw new Error(`Invalid TrueType font ${name}: ${tag}`);
		return entry.offset;
	};
	const head = table('head'),
		hhea = table('hhea'),
		metrics = table('hmtx');
	const units = view.getUint16(head + 18);
	const metricCount = view.getUint16(hhea + 34);
	const cmap = table('cmap');
	let format4 = 0,
		format12 = 0;
	for (let index = 0; index < view.getUint16(cmap + 2); index++) {
		const record = cmap + 4 + index * 8;
		const platform = view.getUint16(record),
			encoding = view.getUint16(record + 2);
		if (platform !== 0 && !(platform === 3 && (encoding === 1 || encoding === 10))) continue;
		const start = cmap + view.getUint32(record + 4);
		if (view.getUint16(start) === 4) format4 = start;
		if (view.getUint16(start) === 12) format12 = start;
	}
	if (!format4 && !format12) throw new Error(`No Unicode cmap in ${name}`);
	const glyph = (code: number): number => {
		if (format12) {
			let low = 0,
				high = view.getUint32(format12 + 12) - 1;
			while (low <= high) {
				const mid = (low + high) >>> 1,
					start = format12 + 16 + mid * 12;
				const first = view.getUint32(start),
					last = view.getUint32(start + 4);
				if (code < first) high = mid - 1;
				else if (code > last) low = mid + 1;
				else return view.getUint32(start + 8) + code - first;
			}
			return 0;
		}
		if (code > 0xffff) return 0;
		const count = view.getUint16(format4 + 6) / 2;
		for (let index = 0; index < count; index++) {
			const end = view.getUint16(format4 + 14 + index * 2);
			if (code > end) continue;
			const first = view.getUint16(format4 + 16 + count * 2 + index * 2);
			if (code < first) return 0;
			const delta = view.getInt16(format4 + 16 + count * 4 + index * 2);
			const rangeAddress = format4 + 16 + count * 6 + index * 2;
			const range = view.getUint16(rangeAddress);
			if (!range) return (code + delta) & 0xffff;
			const id = view.getUint16(rangeAddress + range + (code - first) * 2);
			return id ? (id + delta) & 0xffff : 0;
		}
		return 0;
	};
	const scale = (value: number) => (value * 1000) / units;
	return {
		name,
		glyph,
		width: (id) => scale(view.getUint16(metrics + Math.min(id, metricCount - 1) * 4)),
		ascender: scale(view.getInt16(hhea + 4)),
		descender: scale(view.getInt16(hhea + 6)),
		bbox: [36, 38, 40, 42].map((offset) => scale(view.getInt16(head + offset))),
		subset(characters) {
			const loca = table('loca'),
				glyf = table('glyf');
			const long = view.getInt16(head + 50) === 1;
			const location = (id: number) =>
				long ? view.getUint32(loca + id * 4) : view.getUint16(loca + id * 2) * 2;
			const glyphs = new Set([0, ...characters.keys()]);
			// Composite glyphs reference other outlines (e.g. accented names).
			for (const id of glyphs) {
				const start = glyf + location(id),
					end = glyf + location(id + 1);
				if (end === start || view.getInt16(start) >= 0) continue;
				let cursor = start + 10,
					flags;
				do {
					flags = view.getUint16(cursor);
					glyphs.add(view.getUint16(cursor + 2));
					cursor +=
						4 + (flags & 1 ? 4 : 2) + (flags & 8 ? 2 : flags & 64 ? 4 : flags & 128 ? 8 : 0);
				} while (flags & 32);
			}
			const selected = [...glyphs].sort((a, b) => a - b),
				glyphMap = new Map(selected.map((id, index) => [id, index]));
			const locations = new Uint8Array((selected.length + 1) * 4),
				offsets = new DataView(locations.buffer);
			const horizontalMetrics = new Uint8Array(selected.length * 4),
				horizontalView = new DataView(horizontalMetrics.buffer);
			const outlines: Uint8Array[] = [];
			let offset = 0;
			for (const [index, id] of selected.entries()) {
				offsets.setUint32(index * 4, offset);
				horizontalView.setUint16(
					index * 4,
					view.getUint16(metrics + Math.min(id, metricCount - 1) * 4)
				);
				horizontalView.setInt16(
					index * 4 + 2,
					view.getInt16(
						id < metricCount
							? metrics + id * 4 + 2
							: metrics + metricCount * 4 + (id - metricCount) * 2
					)
				);
				const outline = bytes.slice(glyf + location(id), glyf + location(id + 1));
				if (outline.length && new DataView(outline.buffer).getInt16(0) < 0) {
					const components = new DataView(outline.buffer);
					let cursor = 10,
						flags;
					do {
						flags = components.getUint16(cursor);
						components.setUint16(cursor + 2, glyphMap.get(components.getUint16(cursor + 2))!);
						cursor +=
							4 + (flags & 1 ? 4 : 2) + (flags & 8 ? 2 : flags & 64 ? 4 : flags & 128 ? 8 : 0);
					} while (flags & 32);
				}
				outlines.push(outline, new Uint8Array((4 - (outline.length % 4)) % 4));
				offset += (outline.length + 3) & ~3;
			}
			offsets.setUint32(selected.length * 4, offset);
			const fontTables = new Map<string, Uint8Array>();
			for (const tag of ['OS/2', 'head', 'hhea', 'maxp', 'cvt ', 'fpgm', 'prep', 'gasp']) {
				const entry = tables.get(tag);
				if (entry) fontTables.set(tag, bytes.slice(entry.offset, entry.offset + entry.length));
			}
			fontTables.set('glyf', concat(outlines));
			fontTables.set('loca', locations);
			fontTables.set('hmtx', horizontalMetrics);
			new DataView(fontTables.get('hhea')!.buffer).setUint16(34, selected.length);
			new DataView(fontTables.get('maxp')!.buffer).setUint16(4, selected.length);
			// PDF text uses the external ToUnicode map; the embedded cmap needs only
			// the glyphs actually drawn, not the original font's entire repertoire.
			const mappings = [...characters].sort(
				([, a], [, b]) => a.codePointAt(0)! - b.codePointAt(0)!
			);
			const cmapBytes = new Uint8Array(28 + mappings.length * 12),
				cmapView = new DataView(cmapBytes.buffer);
			cmapView.setUint16(2, 1);
			cmapView.setUint16(4, 3);
			cmapView.setUint16(6, 10);
			cmapView.setUint32(8, 12);
			cmapView.setUint16(12, 12);
			cmapView.setUint32(16, cmapBytes.length - 12);
			cmapView.setUint32(24, mappings.length);
			for (const [index, [glyph, char]] of mappings.entries()) {
				const offset = 28 + index * 12;
				cmapView.setUint32(offset, char.codePointAt(0)!);
				cmapView.setUint32(offset + 4, char.codePointAt(0)!);
				cmapView.setUint32(offset + 8, glyphMap.get(glyph)!);
			}
			fontTables.set('cmap', cmapBytes);
			const post = new Uint8Array(32);
			new DataView(post.buffer).setUint32(0, 0x00030000);
			fontTables.set('post', post);
			const names = [name, 'Regular', name.replace(/[^a-z\d-]/gi, '')].map((value) =>
				Uint8Array.from(
					unicode(value)
						.match(/../g)!
						.map((byte) => parseInt(byte, 16))
				)
			);
			const nameBytes = new Uint8Array(42 + names.reduce((sum, data) => sum + data.length, 0)),
				nameView = new DataView(nameBytes.buffer);
			nameView.setUint16(2, 3);
			nameView.setUint16(4, 42);
			let nameOffset = 0;
			for (const [index, data] of names.entries()) {
				const offset = 6 + index * 12;
				nameView.setUint16(offset, 3);
				nameView.setUint16(offset + 2, 1);
				nameView.setUint16(offset + 4, 0x0409);
				nameView.setUint16(offset + 6, [1, 2, 6][index]);
				nameView.setUint16(offset + 8, data.length);
				nameView.setUint16(offset + 10, nameOffset);
				nameBytes.set(data, 42 + nameOffset);
				nameOffset += data.length;
			}
			fontTables.set('name', nameBytes);
			const headBytes = fontTables.get('head')!,
				headView = new DataView(headBytes.buffer);
			headView.setUint32(8, 0);
			headView.setInt16(50, 1);
			const count = fontTables.size,
				power = 2 ** Math.floor(Math.log2(count));
			const directory = new Uint8Array(12 + count * 16),
				directoryView = new DataView(directory.buffer);
			directoryView.setUint32(0, 0x00010000);
			directoryView.setUint16(4, count);
			directoryView.setUint16(6, power * 16);
			directoryView.setUint16(8, Math.log2(power));
			directoryView.setUint16(10, count * 16 - power * 16);
			const parts: Uint8Array[] = [directory];
			let fontOffset = directory.length,
				headOffset = 0;
			const checksum = (data: Uint8Array) => {
				let sum = 0;
				for (let index = 0; index < data.length; index += 4)
					sum =
						(sum +
							(((data[index] ?? 0) << 24) |
								((data[index + 1] ?? 0) << 16) |
								((data[index + 2] ?? 0) << 8) |
								(data[index + 3] ?? 0))) >>>
						0;
				return sum;
			};
			for (const [index, [tag, data]] of [...fontTables]
				.sort(([a], [b]) => a.localeCompare(b))
				.entries()) {
				const entry = 12 + index * 16;
				directory.set(encode(tag), entry);
				directoryView.setUint32(entry + 4, checksum(data));
				directoryView.setUint32(entry + 8, fontOffset);
				directoryView.setUint32(entry + 12, data.length);
				if (tag === 'head') headOffset = fontOffset;
				const padding = new Uint8Array((4 - (data.length % 4)) % 4);
				parts.push(data, padding);
				fontOffset += data.length + padding.length;
			}
			const output = concat(parts);
			new DataView(output.buffer).setUint32(headOffset + 8, (0xb1b0afba - checksum(output)) >>> 0);
			return { bytes: output, glyphMap };
		}
	};
}

const helveticaWidths = [
	278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556,
	556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556, 1015, 667, 667, 722, 722, 667,
	611, 778, 722, 278, 500, 667, 556, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667,
	667, 611, 278, 278, 278, 469, 556, 333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500,
	222, 833, 556, 556, 556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584
];
const helveticaBoldWidths = [
	278, 333, 474, 556, 556, 889, 722, 278, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556,
	556, 556, 556, 556, 556, 556, 556, 333, 333, 584, 584, 584, 611, 975, 722, 722, 722, 722, 667,
	611, 778, 722, 278, 556, 722, 611, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667,
	667, 611, 333, 278, 333, 584, 556, 278, 556, 611, 556, 611, 556, 333, 611, 611, 278, 278, 556,
	278, 889, 611, 611, 611, 611, 389, 556, 333, 611, 556, 778, 556, 556, 500, 389, 280, 389, 584
];
export function standardFont(bold: boolean, italics: boolean): PdfFont {
	return {
		name: `Helvetica${bold ? (italics ? '-BoldOblique' : '-Bold') : italics ? '-Oblique' : ''}`,
		glyph(code) {
			if (code < 32 || code > 126)
				throw new Error('Non-ASCII text requires an embedded TrueType font');
			return code;
		},
		width: (glyph) => (bold ? helveticaBoldWidths : helveticaWidths)[glyph - 32],
		ascender: 718,
		descender: -207,
		bbox: [-166, -225, 1000, 931]
	};
}
