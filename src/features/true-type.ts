import {
	zeros,
	dataView,
	concat,
	encode,
	unicode,
	number as n,
	type PdfWriter
} from '../binary.js';
import type { PdfFont } from '../font.js';
import type { TrueTypeFeature } from '../feature.js';

interface EmbeddedFont extends PdfFont {
	subset(characters: Map<number, string>): { bytes: Uint8Array; glyphMap: Map<number, number> };
}
type FontTable = { offset: number; length: number };

export function trueTypeFonts(): TrueTypeFeature {
	return { id: 'truetype', parse: trueType };
}

type FontReader = ReturnType<typeof fontReader>;
function fontReader(bytes: Uint8Array, name: string) {
	const view = dataView(bytes);
	const tables = new Map<string, FontTable>();
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
	return { bytes, name, view, tables, table };
}
function unicodeGlyph(reader: FontReader): (code: number) => number {
	const cmap = reader.table('cmap'),
		{ view } = reader;
	let format4 = 0,
		format12 = 0;
	for (let index = 0; index < view.getUint16(cmap + 2); index++) {
		const record = cmap + 4 + index * 8;
		if (!unicodeEncoding(view.getUint16(record), view.getUint16(record + 2))) continue;
		const start = cmap + view.getUint32(record + 4);
		if (view.getUint16(start) === 4) format4 = start;
		if (view.getUint16(start) === 12) format12 = start;
	}
	if (format12) return (code) => format12Glyph(view, format12, code);
	if (format4) return (code) => format4Glyph(view, format4, code);
	throw new Error(`No Unicode cmap in ${reader.name}`);
}

function unicodeEncoding(platform: number, encoding: number): boolean {
	return platform === 0 || (platform === 3 && (encoding === 1 || encoding === 10));
}
function format12Glyph(view: DataView, format: number, code: number): number {
	let low = 0,
		high = view.getUint32(format + 12) - 1;
	while (low <= high) {
		const mid = (low + high) >>> 1,
			start = format + 16 + mid * 12;
		const first = view.getUint32(start),
			last = view.getUint32(start + 4);
		if (code < first) high = mid - 1;
		else if (code > last) low = mid + 1;
		else return view.getUint32(start + 8) + code - first;
	}
	return 0;
}
function format4Glyph(view: DataView, format: number, code: number): number {
	if (code > 0xffff) return 0;
	const count = view.getUint16(format + 6) / 2;
	for (let index = 0; index < count; index++) {
		if (code > view.getUint16(format + 14 + index * 2)) continue;
		const first = view.getUint16(format + 16 + count * 2 + index * 2);
		if (code < first) return 0;
		const delta = view.getInt16(format + 16 + count * 4 + index * 2);
		const address = format + 16 + count * 6 + index * 2,
			range = view.getUint16(address);
		if (!range) return (code + delta) & 0xffff;
		const id = view.getUint16(address + range + (code - first) * 2);
		return id ? (id + delta) & 0xffff : 0;
	}
	return 0;
}

/** Reads Unicode cmaps and horizontal metrics and subsets referenced outlines. */
function trueType(bytes: Uint8Array, name: string): PdfFont {
	const reader = fontReader(bytes, name),
		view = reader.view;
	const head = reader.table('head'),
		hhea = reader.table('hhea'),
		metrics = reader.table('hmtx');
	const units = view.getUint16(head + 18),
		metricCount = view.getUint16(hhea + 34);
	const scale = (value: number) => (value * 1000) / units;
	const face: EmbeddedFont = {
		glyphBytes: 2,
		emit: (writer, id, characters) => embedTrueType(writer, face, id, characters),
		name,
		glyph: unicodeGlyph(reader),
		width: (id) => scale(view.getUint16(metrics + Math.min(id, metricCount - 1) * 4)),
		ascender: scale(view.getInt16(hhea + 4)),
		descender: scale(view.getInt16(hhea + 6)),
		bbox: [36, 38, 40, 42].map((offset) => scale(view.getInt16(head + offset))),
		subset: (characters) => subsetFont(reader, characters)
	};
	return face;
}

function componentSize(flags: number): number {
	const argumentsSize = flags & 1 ? 4 : 2;
	const transformSize = flags & 8 ? 2 : flags & 64 ? 4 : flags & 128 ? 8 : 0;
	return 4 + argumentsSize + transformSize;
}
function visitComponents(view: DataView, start: number, visit: (cursor: number) => void): void {
	if (view.getInt16(start) >= 0) return;
	let cursor = start + 10,
		flags;
	do {
		flags = view.getUint16(cursor);
		visit(cursor + 2);
		cursor += componentSize(flags);
	} while (flags & 32);
}

type Outlines = { reader: FontReader; location: (id: number) => number; glyf: number };
function referencedGlyphs(source: Outlines, characters: Map<number, string>): number[] {
	const { reader, location, glyf } = source;
	const glyphs = new Set([0, ...characters.keys()]);
	// Iteration includes newly discovered components of accented and nested glyphs.
	for (const id of glyphs) {
		const start = glyf + location(id),
			end = glyf + location(id + 1);
		if (start !== end)
			visitComponents(reader.view, start, (cursor) => glyphs.add(reader.view.getUint16(cursor)));
	}
	return [...glyphs].sort((a, b) => a - b);
}
function subsetOutlines(source: Outlines, selected: number[], glyphMap: Map<number, number>) {
	const { reader, location, glyf } = source,
		view = reader.view;
	const metrics = reader.table('hmtx'),
		metricCount = view.getUint16(reader.table('hhea') + 34);
	const locations = zeros((selected.length + 1) * 4),
		offsets = dataView(locations);
	const horizontalMetrics = zeros(selected.length * 4),
		horizontalView = dataView(horizontalMetrics);
	const outlines: Uint8Array[] = [];
	let offset = 0;
	for (const [index, id] of selected.entries()) {
		offsets.setUint32(index * 4, offset);
		horizontalView.setUint16(
			index * 4,
			view.getUint16(metrics + Math.min(id, metricCount - 1) * 4)
		);
		const bearing =
			id < metricCount ? metrics + id * 4 + 2 : metrics + metricCount * 4 + (id - metricCount) * 2;
		horizontalView.setInt16(index * 4 + 2, view.getInt16(bearing));
		const outline = reader.bytes.slice(glyf + location(id), glyf + location(id + 1));
		if (outline.length) {
			const components = dataView(outline);
			visitComponents(components, 0, (cursor) =>
				components.setUint16(cursor, glyphMap.get(components.getUint16(cursor))!)
			);
		}
		outlines.push(outline, zeros((4 - (outline.length % 4)) % 4));
		offset += (outline.length + 3) & ~3;
	}
	offsets.setUint32(selected.length * 4, offset);
	return { locations, horizontalMetrics, outlines: concat(outlines) };
}
function subsetFont(reader: FontReader, characters: Map<number, string>) {
	const view = reader.view,
		loca = reader.table('loca'),
		glyf = reader.table('glyf');
	const long = view.getInt16(reader.table('head') + 50) === 1;
	const location = (id: number) =>
		long ? view.getUint32(loca + id * 4) : view.getUint16(loca + id * 2) * 2;
	const source = { reader, location, glyf },
		selected = referencedGlyphs(source, characters);
	const glyphMap = new Map(selected.map((id, index) => [id, index]));
	const { locations, horizontalMetrics, outlines } = subsetOutlines(source, selected, glyphMap);
	const tables = new Map<string, Uint8Array>();
	// CIDFontType2 uses PDF character mappings, not standalone font metadata.
	for (const tag of ['head', 'hhea', 'maxp', 'cvt ', 'fpgm', 'prep']) {
		const entry = reader.tables.get(tag);
		if (entry) tables.set(tag, reader.bytes.slice(entry.offset, entry.offset + entry.length));
	}
	tables.set('glyf', outlines);
	tables.set('loca', locations);
	tables.set('hmtx', horizontalMetrics);
	dataView(tables.get('hhea')!).setUint16(34, selected.length);
	dataView(tables.get('maxp')!).setUint16(4, selected.length);
	const head = dataView(tables.get('head')!);
	head.setUint32(8, 0);
	head.setInt16(50, 1);
	return { bytes: assembleFont(tables), glyphMap };
}
function checksum(data: Uint8Array): number {
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
}
function assembleFont(tables: Map<string, Uint8Array>): Uint8Array {
	const count = tables.size,
		power = 2 ** Math.floor(Math.log2(count));
	const directory = zeros(12 + count * 16),
		view = dataView(directory);
	view.setUint32(0, 0x00010000);
	view.setUint16(4, count);
	view.setUint16(6, power * 16);
	view.setUint16(8, Math.log2(power));
	view.setUint16(10, count * 16 - power * 16);
	const parts: Uint8Array[] = [directory];
	let offset = directory.length,
		headOffset = 0;
	for (const [index, [tag, data]] of [...tables].sort(([a], [b]) => a.localeCompare(b)).entries()) {
		const entry = 12 + index * 16;
		directory.set(encode(tag), entry);
		view.setUint32(entry + 4, checksum(data));
		view.setUint32(entry + 8, offset);
		view.setUint32(entry + 12, data.length);
		if (tag === 'head') headOffset = offset;
		const padding = zeros((4 - (data.length % 4)) % 4);
		parts.push(data, padding);
		offset += data.length + padding.length;
	}
	const output = concat(parts);
	dataView(output).setUint32(headOffset + 8, (0xb1b0afba - checksum(output)) >>> 0);
	return output;
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
