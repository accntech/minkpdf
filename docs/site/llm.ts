import type { Page } from './content';
import { pagePath } from './routes';

function decode(text: string): string {
	return text
		.replace(/&#(\d+);/g, (_, value) => String.fromCodePoint(Number(value)))
		.replace(/&#x([a-f\d]+);/gi, (_, value) => String.fromCodePoint(parseInt(value, 16)))
		.replace(
			/&(amp|lt|gt|quot|apos|nbsp);/g,
			(_, value) => ({ amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' })[value]!
		);
}

// Convert the site's own generated markup. Preserve code before removing HTML tags,
// so TypeScript generics and literal markup in examples survive unchanged.
function markdown(page: Page): string {
	const protectedText: string[] = [];
	const keep = (text: string) => `\u0000${protectedText.push(text) - 1}\u0000`;
	const plain = (html: string) => decode(html.replace(/<[^>]*>/g, ''));
	const prose = (html: string) =>
		plain(html.replace(/<\/?(?:small|strong|b|p|div|br)\b[^>]*>/g, ' '));
	const restore = (text: string) =>
		text.replace(/\u0000(\d+)\u0000/g, (_, index) => protectedText[Number(index)]);
	let body = page.slug === 'index' ? page.body.slice(page.body.indexOf('<h2')) : page.body;
	body = body.replace(
		/<div class="code-block"><div class="code-label">([\s\S]*?)<\/div><pre><code>([\s\S]*?)<\/code><\/pre><\/div>/g,
		(_, label, source) => {
			const code = plain(source);
			const fence = '`'.repeat(
				Math.max(3, ...[...code.matchAll(/`+/g)].map((match) => match[0].length + 1))
			);
			const language =
				(
					{
						TypeScript: 'typescript',
						Terminal: 'sh',
						HTML: 'html',
						JavaScript: 'javascript',
						'JavaScript · browser': 'javascript'
					} as Record<string, string>
				)[plain(label.replace(/<button\b[\s\S]*?<\/button>/g, '')).trim()] ?? '';
			return keep(`\n\n${fence}${language}\n${code}\n${fence}\n\n`);
		}
	);
	body = body
		.replace(/<svg\b[\s\S]*?<\/svg>/g, '')
		.replace(/<button\b[\s\S]*?<\/button>/g, '')
		.replace(/<a class="heading-link"[\s\S]*?<\/a>/g, '')
		.replace(/<code>([\s\S]*?)<\/code>/g, (_, code) => keep('`' + plain(code) + '`'))
		.replace(
			/<a\b[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g,
			(_, url, label) =>
				`[${prose(label).replace(/\s+/g, ' ').trim()}](${decode(url.startsWith('#') ? `${pagePath(page.slug)}${url}` : url)})`
		)
		.replace(/<table>([\s\S]*?)<\/table>/g, (_, table) => {
			const rows = [...table.matchAll(/<tr>([\s\S]*?)<\/tr>/g)].map(
				(row) =>
					'| ' +
					[...row[1].matchAll(/<t[hd]\b[^>]*>([\s\S]*?)<\/t[hd]>/g)]
						.map((cell) =>
							restore(prose(cell[1])).replace(/\s+/g, ' ').trim().replaceAll('|', '\\|')
						)
						.join(' | ') +
					' |'
			);
			if (!rows.length) return '';
			const separator =
				'| ' + Array.from(table.matchAll(/<th scope="col"/g), () => '---').join(' | ') + ' |';
			return keep('\n\n' + [rows[0], separator, ...rows.slice(1)].join('\n') + '\n\n');
		})
		.replace(
			/<h([23])\b[^>]*>([\s\S]*?)<\/h\1>/g,
			(_, level, text) => `\n\n${'#'.repeat(Number(level) + 1)} ${plain(text)}\n\n`
		)
		.replace(/<li\b[^>]*>/g, '\n- ')
		.replace(/<p\b[^>]*>/g, '\n\n')
		.replace(/<\/(?:b|strong|small)>/g, ' ')
		.replace(/<\/(?:p|aside|ul|ol|figure|div)>/g, '\n\n')
		.replace(/<br\s*\/?\s*>/g, '\n')
		.replace(/<[^>]*>/g, '');
	body = decode(body)
		.replace(/[ \t]+\n/g, '\n')
		.replace(/\n{3,}/g, '\n\n')
		.trim();
	return restore(body);
}

export function buildLlmIndex(pages: Page[], version: string): string {
	return `# MinkPDF\n\n> A compact TypeScript PDF engine with zero runtime package dependencies, familiar document definitions, and optional feature modules.\n\nVersion: ${version}. MinkPDF implements a subset of pdfmake's API; layouts and pagination can differ.\n\n## Documentation\n\n${pages.map((page) => `- [${page.title}](${pagePath(page.slug)}): ${page.description}`).join('\n')}\n- [Full documentation](llms-full.txt): Complete text of all six pages, including code examples, API tables, compatibility limits, and recorded benchmarks.\n\n## Project\n\n- [npm package](https://www.npmjs.com/package/minkpdf): Install with npm install minkpdf.\n- [Source repository](https://github.com/accntech/minkpdf): TypeScript implementation, tests, benchmark scripts, and MIT license.\n`;
}

export function buildLlmDocumentation(pages: Page[], version: string): string {
	return `# MinkPDF documentation\n\n> A compact TypeScript PDF engine with zero runtime package dependencies.\n\nVersion: ${version}\nPackage: [minkpdf on npm](https://www.npmjs.com/package/minkpdf)\nSource: [accntech/minkpdf](https://github.com/accntech/minkpdf)\n\nThis text is generated from the same content as the documentation site. Code examples, API tables, compatibility limits, and recorded benchmark results are included below. Relative links resolve from this file's location, including on GitHub Pages project sites.\n\n## Documentation pages\n\n${pages.map((page) => `- [${page.title}](${pagePath(page.slug)}): ${page.description}`).join('\n')}\n\n${pages.map((page) => `## ${page.title}\n\nPage: [${page.title}](${pagePath(page.slug)})\n\n${page.description}\n\n${markdown(page)}`).join('\n\n---\n\n')}\n`;
}
