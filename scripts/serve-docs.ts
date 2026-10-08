import { resolve, sep } from 'node:path';
import { statSync } from 'node:fs';

const root = resolve(new URL('../.site/', import.meta.url).pathname);
const port = Number(process.env.PORT ?? 4173);
const server = Bun.serve({
	hostname: '127.0.0.1',
	port,
	async fetch(request) {
		let pathname: string;
		try {
			pathname = decodeURIComponent(new URL(request.url).pathname);
		} catch {
			return new Response('Invalid URL', { status: 400 });
		}
		let file = resolve(root, `.${pathname}`);
		if (file !== root && !file.startsWith(root + sep))
			return new Response('Not found', { status: 404 });
		try {
			if (statSync(file).isDirectory()) file = resolve(file, 'index.html');
		} catch {
			return new Response('Not found. Run bun run docs:build first.', { status: 404 });
		}
		const source = Bun.file(file);
		if (!(await source.exists())) return new Response('Not found', { status: 404 });
		return new Response(source);
	}
});
console.log(`MinkPDF docs: ${server.url}`);
