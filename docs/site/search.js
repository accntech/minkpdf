const normalize = (text) => text.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase();

export function searchDocuments(index, query, limit = 10) {
	const phrase = normalize(query.trim());
	const terms = [...new Set(phrase.match(/[\p{L}\p{N}_]+/gu) ?? [])];
	if (!terms.length) return [];
	return index
		.map((row, order) => {
			const title = normalize(row.section);
			const page = normalize(row.page);
			const body = normalize(row.text);
			const keywords = normalize(row.keywords ?? '');
			const combined = `${title} ${page} ${body} ${keywords}`;
			if (!terms.every((term) => combined.includes(term))) return null;
			const score =
				terms.reduce(
					(sum, term) =>
						sum +
						(title.includes(term) ? 12 : 0) +
						(page.includes(term) ? 3 : 0) +
						(body.includes(term) ? 1 : 0) +
						(keywords.includes(term) ? (row.url.startsWith('api/#') ? 15 : 10) : 0),
					0
				) + (title.includes(phrase) ? 20 : 0);
			return { ...row, score, order };
		})
		.filter(Boolean)
		.sort((a, b) => b.score - a.score || a.order - b.order)
		.slice(0, limit);
}

export function searchSnippet(text, query, length = 160) {
	const words = normalize(query).match(/[\p{L}\p{N}_]+/gu) ?? [];
	const normalized = normalize(text);
	const positions = words
		.map((word) => normalized.indexOf(word))
		.filter((position) => position >= 0);
	const position = positions.length ? Math.min(...positions) : 0;
	const start = Math.max(0, position - 45);
	return `${start ? '…' : ''}${text.slice(start, start + length).trim()}${text.length > start + length ? '…' : ''}`;
}
