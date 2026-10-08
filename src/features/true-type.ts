import { concat, encode, unicode, number as n, type PdfWriter } from '../binary.js';
import type { PdfFont } from '../font.js';
import type { TrueTypeFeature } from '../feature.js';

interface EmbeddedFont extends PdfFont {
	subset(characters: Map<number, string>): { bytes: Uint8Array; glyphMap: Map<number, number> };
}

export function trueTypeFonts(): TrueTypeFeature {
	return { id: 'truetype', parse: trueType };
}

/** Reads Unicode cmaps and horizontal metrics and subsets referenced outlines. */
function trueType(bytes: Uint8Array, name: string): PdfFont {
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
	const face: EmbeddedFont = {
		glyphBytes: 2,
		emit(writer, id, characters) {
			return embedTrueType(writer, face, id, characters);
		},
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
			// CIDFontType2 uses PDF character mappings, not standalone font metadata.
			for (const tag of ['head', 'hhea', 'maxp', 'cvt ', 'fpgm', 'prep']) {
				const entry = tables.get(tag);
				if (entry) fontTables.set(tag, bytes.slice(entry.offset, entry.offset + entry.length));
			}
			fontTables.set('glyf', concat(outlines));
			fontTables.set('loca', locations);
			fontTables.set('hmtx', horizontalMetrics);
			new DataView(fontTables.get('hhea')!.buffer).setUint16(34, selected.length);
			new DataView(fontTables.get('maxp')!.buffer).setUint16(4, selected.length);
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
	return face;
}

async function embedTrueType(
	writer: PdfWriter,
	face: EmbeddedFont,
	id: number,
	characters: Map<number, string>
): Promise<Map<number, number>> {
	const name = `MINKPD+${face.name.replace(/[^a-z\d-]/gi, '')}`;
	const subset = face.subset(characters);
	const file = await writer.stream(subset.bytes, `/Length1 ${subset.bytes.length}`);
	const descriptor = writer.add(
		`<< /Type /FontDescriptor /FontName /${name} /Flags 32 /FontBBox [${face.bbox.map(n).join(' ')}] /ItalicAngle 0 /Ascent ${n(face.ascender)} /Descent ${n(face.descender)} /CapHeight ${n(face.ascender)} /StemV 80 /FontFile2 ${file} 0 R >>`
	);
	const entries = [...characters]
		.map(([glyph, char]) => [subset.glyphMap.get(glyph)!, glyph, char] as const)
		.sort(([a], [b]) => a - b);
	let widths = '';
	for (let index = 0; index < entries.length;) {
		const first = entries[index][0];
		const values: string[] = [];
		do {
			values.push(n(face.width(entries[index][1])));
			index++;
		} while (index < entries.length && entries[index][0] === first + values.length);
		widths += `${first} [${values.join(' ')}] `;
	}
	const descendant = writer.add(
		`<< /Type /Font /Subtype /CIDFontType2 /BaseFont /${name} /CIDSystemInfo << /Registry (Adobe) /Ordering (Identity) /Supplement 0 >> /FontDescriptor ${descriptor} 0 R /CIDToGIDMap /Identity /DW 1000 /W [${widths.trimEnd()}] >>`
	);
	let cmap =
		'/CIDInit /ProcSet findresource begin\n12 dict begin\nbegincmap\n/CIDSystemInfo << /Registry (Adobe) /Ordering (UCS) /Supplement 0 >> def\n/CMapName /MinkPDFUnicode def\n/CMapType 2 def\n1 begincodespacerange\n<0000> <FFFF>\nendcodespacerange\n';
	for (let index = 0; index < entries.length; index += 100) {
		const chunk = entries.slice(index, index + 100);
		cmap += `${chunk.length} beginbfchar\n${chunk.map(([glyph, , char]) => `<${glyph.toString(16).padStart(4, '0')}> <${unicode(char)}>`).join('\n')}\nendbfchar\n`;
	}
	cmap += 'endcmap\nCMapName currentdict /CMap defineresource pop\nend\nend';
	const mapping = await writer.stream(encode(cmap));
	writer.set(
		id,
		`<< /Type /Font /Subtype /Type0 /BaseFont /${name} /Encoding /Identity-H /DescendantFonts [${descendant} 0 R] /ToUnicode ${mapping} 0 R >>`
	);
	return subset.glyphMap;
}
