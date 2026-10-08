export const zeros = (length = 0): Uint8Array => new Uint8Array(length);
export const dataView = (bytes: Uint8Array): DataView =>
	new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
export const encode = (text: string) => new TextEncoder().encode(text);
export function concat(parts: Uint8Array[]): Uint8Array {
	const output = zeros(parts.reduce((size, part) => size + part.length, 0));
	let offset = 0;
	for (const part of parts) {
		output.set(part, offset);
		offset += part.length;
	}
	return output;
}
export function fromBase64(value: string): Uint8Array {
	return Uint8Array.from(atob(value), (char) => char.charCodeAt(0));
}
export function toBase64(bytes: Uint8Array): string {
	let text = '';
	for (let offset = 0; offset < bytes.length; offset += 32768)
		text += String.fromCharCode(...bytes.subarray(offset, offset + 32768));
	return btoa(text);
}
async function transform(
	bytes: Uint8Array,
	stream: CompressionStream | DecompressionStream
): Promise<Uint8Array> {
	const output = new Blob([new Uint8Array(bytes)]).stream().pipeThrough(stream);
	return new Uint8Array(await new Response(output).arrayBuffer());
}
function deflate(bytes: Uint8Array): Promise<Uint8Array> {
	return transform(bytes, new CompressionStream('deflate'));
}
export function inflate(bytes: Uint8Array): Promise<Uint8Array> {
	return transform(bytes, new DecompressionStream('deflate'));
}
export const number = (value: number) => {
	if (!Number.isFinite(value)) throw new Error('PDF coordinates must be finite');
	return String(Math.round(value * 1000) / 1000);
};
export function unicode(value: string): string {
	let output = '';
	for (let index = 0; index < value.length; index++)
		output += value.charCodeAt(index).toString(16).padStart(4, '0');
	return output;
}

export class PdfWriter {
	#objects: Uint8Array[] = [];
	reserve(): number {
		return this.#objects.push(zeros());
	}
	set(id: number, value: string | Uint8Array): void {
		this.#objects[id - 1] = typeof value === 'string' ? encode(value) : value;
	}
	add(value: string | Uint8Array): number {
		const id = this.reserve();
		this.set(id, value);
		return id;
	}
	async stream(bytes: Uint8Array, dictionary = '', compress = true): Promise<number> {
		const data = compress ? await deflate(bytes) : bytes;
		return this.add(
			concat([
				encode(
					`<< ${dictionary} /Length ${data.length} ${compress ? '/Filter /FlateDecode' : ''} >>\nstream\n`
				),
				data,
				encode('\nendstream')
			])
		);
	}
	finish(root: number, info: number): Uint8Array {
		const parts: Uint8Array[] = [
			encode('%PDF-1.7\n%'),
			new Uint8Array([0xe2, 0xe3, 0xcf, 0xd3, 10])
		];
		let offset = parts.reduce((sum, bytes) => sum + bytes.length, 0);
		const offsets = [0];
		for (const [index, bytes] of this.#objects.entries()) {
			if (!bytes.length) throw new Error(`Unresolved PDF object ${index + 1}`);
			offsets.push(offset);
			const object = concat([encode(`${index + 1} 0 obj\n`), bytes, encode('\nendobj\n')]);
			parts.push(object);
			offset += object.length;
		}
		parts.push(
			encode(
				`xref\n0 ${offsets.length}\n0000000000 65535 f \n${offsets
					.slice(1)
					.map((value) => `${String(value).padStart(10, '0')} 00000 n \n`)
					.join(
						''
					)}trailer\n<< /Size ${offsets.length} /Root ${root} 0 R /Info ${info} 0 R >>\nstartxref\n${offset}\n%%EOF\n`
			)
		);
		return concat(parts);
	}
}
