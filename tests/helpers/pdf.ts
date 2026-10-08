import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export async function withPdf<T>(
	bytes: Uint8Array,
	read: (path: string) => Promise<T>
): Promise<T> {
	const directory = mkdtempSync(join(tmpdir(), 'minkpdf-test-'));
	try {
		const path = join(directory, 'document.pdf');
		await Bun.write(path, bytes);
		return await read(path);
	} finally {
		rmSync(directory, { recursive: true, force: true });
	}
}
export async function command(args: string[]): Promise<string> {
	const process = Bun.spawn(args, { stdout: 'pipe', stderr: 'pipe' });
	const [stdout, stderr, status] = await Promise.all([
		new Response(process.stdout).text(),
		new Response(process.stderr).text(),
		process.exited
	]);
	if (status !== 0 || stderr.trim()) throw new Error(stderr || args[0] + ' failed');
	return stdout;
}
const decodeXml = (text: string) =>
	text.replace(
		/&(?:amp|lt|gt|quot|apos|#\d+);/g,
		(entity) =>
			({
				'&amp;': '&',
				'&lt;': '<',
				'&gt;': '>',
				'&quot;': '"',
				'&apos;': "'"
			})[entity] ?? String.fromCodePoint(Number(entity.slice(2, -1)))
	);
export async function readPdf(bytes: Uint8Array) {
	return withPdf(bytes, async (path) => {
		const [xml, info] = await Promise.all([
			command(['pdftotext', '-bbox', path, '-']),
			command(['pdfinfo', path])
		]);
		const pages = [
			...xml.matchAll(/<page width="([^"]+)" height="([^"]+)">([\s\S]*?)<\/page>/g)
		].map((page) => {
			const height = Number(page[2]);
			const items = [
				...page[3].matchAll(
					/<word xMin="([^"]+)" yMin="([^"]+)" xMax="([^"]+)" yMax="([^"]+)">([\s\S]*?)<\/word>/g
				)
			].map((word) => ({
				str: decodeXml(word[5]),
				right: Number(word[3]),
				transform: [1, 0, 0, 1, Number(word[1]), height - Number(word[4])]
			}));
			return {
				width: Number(page[1]),
				height,
				items,
				text: items.map((item) => item.str).join(' ')
			};
		});
		return {
			pages,
			metadata: {
				info: Object.fromEntries(
					info
						.split('\n')
						.filter((line) => line.includes(':'))
						.map((line) => {
							const colon = line.indexOf(':');
							return [line.slice(0, colon), line.slice(colon + 1).trim()];
						})
				)
			}
		};
	});
}
