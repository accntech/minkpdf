import type { Page } from './content';

function plainText(html: string): string {
	return html
		.replace(/<h2\b[\s\S]*?<\/h2>/gi, ' ')
		.replace(/<div class="code-label">[\s\S]*?<\/div>/gi, ' ')
		.replace(/<svg\b[\s\S]*?<\/svg>/gi, ' ')
		.replace(/<button\b[\s\S]*?<\/button>/gi, ' ')
		.replace(/<[^>]*>/g, ' ')
		.replace(/&#(\d+);/g, (_, value) => String.fromCodePoint(Number(value)))
		.replace(/&#x([a-f\d]+);/gi, (_, value) => String.fromCodePoint(parseInt(value, 16)))
		.replace(
			/&(amp|lt|gt|quot|apos|nbsp);/g,
			(_, value) => ({ amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' })[value]!
		)
		.replace(/\s+/g, ' ')
		.trim();
}

export function buildSearchIndex(pages: Page[]) {
	return pages.flatMap((page) => {
		const sections = [...page.body.matchAll(/<h2 id="([^"]+)"/g)];
		return [
			{
				page: page.title,
				section: page.title,
				url: `${page.slug}.html`,
				text: page.description,
				keywords: page.slug.replaceAll('-', ' '),
				overview: true
			},
			...sections.map((match, index) => ({
				page: page.title,
				section: page.sections.find(([id]) => id === match[1])?.[1] ?? page.title,
				url: `${page.slug}.html#${match[1]}`,
				text: plainText(
					page.body.slice(match.index, sections[index + 1]?.index ?? page.body.length)
				),
				keywords: [
					...page.body
						.slice(match.index, sections[index + 1]?.index ?? page.body.length)
						.matchAll(/<code>([\s\S]*?)<\/code>/g)
				]
					.map((code) => plainText(code[1]))
					.filter((text) => text.length <= 60)
					.join(' ')
			}))
		];
	});
}
