import { encode, number as n, PdfWriter, unicode } from './binary';
import type { PdfFont } from './font';
import { embedImage, parseImage } from './image';
import { Layout, margins, paginate, translate, type Draw } from './layout';
import type { CustomTableLayout, Style, TDocumentDefinitions } from './interfaces';

function color(value = '#000000'): string {
	const hex = value.replace('#', '');
	if (!/^(?:[a-f\d]{3}|[a-f\d]{6})$/i.test(hex)) throw new Error(`Unsupported PDF color: ${value}`);
	const rgb =
		hex.length === 3
			? [...hex].map((char) => parseInt(char + char, 16))
			: [0, 2, 4].map((index) => parseInt(hex.slice(index, index + 2), 16));
	return rgb.map((component) => n(component / 255)).join(' ');
}

export async function render(
	document: TDocumentDefinitions,
	font: (style: Style) => PdfFont,
	layouts: Record<string, CustomTableLayout>
): Promise<Uint8Array> {
	const dimensions =
		typeof document.pageSize === 'object'
			? document.pageSize
			: document.pageSize === 'LETTER'
				? { width: 612, height: 792 }
				: document.pageSize === 'LEGAL'
					? { width: 612, height: 1008 }
					: { width: 595.28, height: 841.89 };
	let { width, height } = dimensions;
	if (document.pageOrientation === 'landscape' && width < height) [width, height] = [height, width];
	const pageMargins = margins(document.pageMargins ?? 40);
	if (width <= pageMargins[0] + pageMargins[2] || height <= pageMargins[1] + pageMargins[3])
		throw new Error('PDF margins leave no content area');
	const images = new Map<string, ReturnType<typeof parseImage>>();
	const layout = new Layout(
		document,
		font,
		(source) => {
			if (!images.has(source)) images.set(source, parseImage(source));
			return images.get(source)!;
		},
		layouts
	);
	const pages = paginate(
		layout.content(document.content, width - pageMargins[0] - pageMargins[2]).blocks,
		width,
		height,
		pageMargins
	);
	for (const [index, page] of pages.entries()) {
		for (const [kind, content] of [
			['header', document.header],
			['footer', document.footer]
		] as const) {
			if (content === undefined) continue;
			const definition =
				typeof content === 'function'
					? content(index + 1, pages.length, {
							width,
							height,
							orientation: width > height ? 'landscape' : 'portrait'
						})
					: content;
			const box = layout.content(definition, width);
			let y = kind === 'header' ? 0 : height - pageMargins[3];
			for (const block of box.blocks) {
				page.push(...block.draws.map((draw) => translate(draw, 0, y)));
				y += block.height;
			}
		}
	}
	const writer = new PdfWriter(),
		root = writer.reserve(),
		pageTree = writer.reserve(),
		resources = writer.reserve();
	const fontUses = new Map<
		PdfFont,
		{ name: string; characters: Map<number, string>; id: number }
	>();
	const imageIds = new Map<string, { name: string; id: number }>();
	const opacityIds = new Map<number, { name: string; id: number }>();
	const opacity = (value: number) => {
		if (!opacityIds.has(value))
			opacityIds.set(value, {
				name: `G${opacityIds.size + 1}`,
				id: writer.add(`<< /Type /ExtGState /ca ${n(value)} /CA ${n(value)} >>`)
			});
		return opacityIds.get(value)!.name;
	};
	const fontUse = (value: PdfFont) => {
		if (!fontUses.has(value))
			fontUses.set(value, {
				name: `F${fontUses.size + 1}`,
				characters: new Map(),
				id: writer.reserve()
			});
		return fontUses.get(value)!;
	};
	const textCommand = (draw: Extract<Draw, { kind: 'text' }>) => {
		const use = fontUse(draw.font);
		let text = '';
		for (const char of draw.text) {
			const glyph = draw.font.glyph(char.codePointAt(0)!);
			use.characters.set(glyph, char);
			text += glyph.toString(16).padStart(draw.font.subset ? 4 : 2, '0');
		}
		const command = `q ${color(draw.style.color)} rg BT /${use.name} ${n(draw.style.fontSize ?? 12)} Tf ${n(draw.style.characterSpacing ?? 0)} Tc 1 0 0 1 ${n(draw.x)} ${n(height - draw.y)} Tm <${text}> Tj ET Q\n`;
		if (!draw.style.decoration) return command;
		const y =
			height -
			draw.y +
			(draw.style.decoration === 'lineThrough'
				? (draw.style.fontSize ?? 12) * 0.3
				: draw.style.decoration === 'overline'
					? (draw.style.fontSize ?? 12)
					: -1);
		return (
			command +
			`q ${color(draw.style.color)} RG 0.5 w ${n(draw.x)} ${n(y)} m ${n(draw.x + draw.width)} ${n(y)} l S Q\n`
		);
	};
	for (const [source, image] of images)
		imageIds.set(source, { name: `I${imageIds.size + 1}`, id: await embedImage(writer, image) });
	const pageIds: number[] = [];
	for (const page of pages) {
		let commands = '';
		if (document.watermark) {
			const watermark =
				typeof document.watermark === 'string' ? { text: document.watermark } : document.watermark;
			const style: Style = {
				...document.defaultStyle,
				fontSize: watermark.fontSize ?? 60,
				bold: watermark.bold,
				color: watermark.color ?? '#000000'
			};
			const face = font(style),
				textWidth = [...watermark.text].reduce(
					(sum, char) =>
						sum + (face.width(face.glyph(char.codePointAt(0)!)) * style.fontSize!) / 1000,
					0
				);
			const angle =
				((watermark.angle ?? (-Math.atan(height / width) * 180) / Math.PI) * Math.PI) / 180;
			commands += `q /${opacity(watermark.opacity ?? 0.6)} gs ${n(Math.cos(angle))} ${n(-Math.sin(angle))} ${n(Math.sin(angle))} ${n(Math.cos(angle))} ${n(width / 2)} ${n(height / 2)} cm\n`;
			commands +=
				textCommand({
					kind: 'text',
					x: -textWidth / 2,
					y: height,
					text: watermark.text,
					font: face,
					style,
					width: textWidth
				}) + 'Q\n';
		}
		for (const draw of page) {
			if (draw.kind === 'text') commands += textCommand(draw);
			else if (draw.kind === 'line')
				commands += `q ${color(draw.color)} RG ${n(draw.width)} w ${n(draw.x)} ${n(height - draw.y)} m ${n(draw.x2)} ${n(height - draw.y2)} l S Q\n`;
			else if (draw.kind === 'rect')
				commands += `q /${opacity(draw.opacity)} gs ${color(draw.color)} rg ${n(draw.x)} ${n(height - draw.y - draw.height)} ${n(draw.width)} ${n(draw.height)} re f Q\n`;
			else
				commands += `q ${n(draw.width)} 0 0 ${n(draw.height)} ${n(draw.x)} ${n(height - draw.y - draw.height)} cm /${imageIds.get(draw.source)!.name} Do Q\n`;
		}
		const stream = await writer.stream(encode(commands));
		const id = writer.reserve();
		pageIds.push(id);
		writer.set(
			id,
			`<< /Type /Page /Parent ${pageTree} 0 R /MediaBox [0 0 ${n(width)} ${n(height)}] /Contents ${stream} 0 R /Resources ${resources} 0 R >>`
		);
	}
	for (const [face, use] of fontUses) {
		if (!face.subset) {
			writer.set(
				use.id,
				`<< /Type /Font /Subtype /Type1 /BaseFont /${face.name} /Encoding /WinAnsiEncoding >>`
			);
			continue;
		}
		const name = `MINKPD+${face.name.replace(/[^a-z\d-]/gi, '')}`;
		const subset = face.subset(use.characters);
		const file = await writer.stream(subset.bytes, `/Length1 ${subset.bytes.length}`);
		const descriptor = writer.add(
			`<< /Type /FontDescriptor /FontName /${name} /Flags 32 /FontBBox [${face.bbox.map(n).join(' ')}] /ItalicAngle 0 /Ascent ${n(face.ascender)} /Descent ${n(face.descender)} /CapHeight ${n(face.ascender)} /StemV 80 /FontFile2 ${file} 0 R >>`
		);
		const entries = [...use.characters].sort(([a], [b]) => a - b);
		const glyphBytes = new Uint8Array((entries.at(-1)![0] + 1) * 2),
			glyphView = new DataView(glyphBytes.buffer);
		for (const [glyph] of entries) glyphView.setUint16(glyph * 2, subset.glyphMap.get(glyph)!);
		const glyphMapping = await writer.stream(glyphBytes);
		const descendant = writer.add(
			`<< /Type /Font /Subtype /CIDFontType2 /BaseFont /${name} /CIDSystemInfo << /Registry (Adobe) /Ordering (Identity) /Supplement 0 >> /FontDescriptor ${descriptor} 0 R /CIDToGIDMap ${glyphMapping} 0 R /DW 1000 /W [${entries.map(([glyph]) => `${glyph} [${n(face.width(glyph))}]`).join(' ')}] >>`
		);
		let cmap =
			'/CIDInit /ProcSet findresource begin\n12 dict begin\nbegincmap\n/CIDSystemInfo << /Registry (Adobe) /Ordering (UCS) /Supplement 0 >> def\n/CMapName /MinkPDFUnicode def\n/CMapType 2 def\n1 begincodespacerange\n<0000> <FFFF>\nendcodespacerange\n';
		for (let index = 0; index < entries.length; index += 100) {
			const chunk = entries.slice(index, index + 100);
			cmap += `${chunk.length} beginbfchar\n${chunk.map(([glyph, char]) => `<${glyph.toString(16).padStart(4, '0')}> <${unicode(char)}>`).join('\n')}\nendbfchar\n`;
		}
		cmap += 'endcmap\nCMapName currentdict /CMap defineresource pop\nend\nend';
		const mapping = await writer.stream(encode(cmap));
		writer.set(
			use.id,
			`<< /Type /Font /Subtype /Type0 /BaseFont /${name} /Encoding /Identity-H /DescendantFonts [${descendant} 0 R] /ToUnicode ${mapping} 0 R >>`
		);
	}
	writer.set(
		resources,
		`<< /Font << ${[...fontUses.values()].map((use) => `/${use.name} ${use.id} 0 R`).join(' ')} >> /XObject << ${[...imageIds.values()].map((image) => `/${image.name} ${image.id} 0 R`).join(' ')} >> /ExtGState << ${[...opacityIds.values()].map((state) => `/${state.name} ${state.id} 0 R`).join(' ')} >> >>`
	);
	writer.set(
		pageTree,
		`<< /Type /Pages /Count ${pages.length} /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] >>`
	);
	writer.set(root, `<< /Type /Catalog /Pages ${pageTree} 0 R >>`);
	const info = writer.add(
		`<< /Producer (MinkPDF) ${Object.entries(document.info ?? {})
			.map(([key, value]) => `/${key[0].toUpperCase() + key.slice(1)} <FEFF${unicode(value)}>`)
			.join(' ')} >>`
	);
	return writer.finish(root, info);
}
