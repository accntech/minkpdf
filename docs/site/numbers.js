// Match numeric values, versions and ordinals without splitting identifiers such as A4.
const numericToken =
	/(?<![\p{L}\p{N}_#.,])[-+−]?\d+(?:,\d{3})*(?:\.\d+)*(?:%|st|nd|rd|th)?(?![\p{L}\p{N}_]|[.,]\d)/gu;

export function numericParts(text) {
	const parts = [];
	let previous = 0;
	for (const match of text.matchAll(numericToken)) {
		if (match.index > previous)
			parts.push({ text: text.slice(previous, match.index), numeric: false });
		parts.push({ text: match[0], numeric: true });
		previous = match.index + match[0].length;
	}
	if (previous < text.length) parts.push({ text: text.slice(previous), numeric: false });
	return parts;
}

// Process the site's generated HTML text only. Preserve tags, attributes and already-mono code/SVG.
export function monospaceNumbers(html) {
	const protectedTags = new Set([
		'head',
		'script',
		'style',
		'svg',
		'pre',
		'code',
		'kbd',
		'textarea'
	]);
	let protectedTag;
	return html.replace(/<!--[\s\S]*?-->|<(?:[^"'<>]|"[^"]*"|'[^']*')*>|[^<]+|</g, (token) => {
		if (token.startsWith('<')) {
			const tag = token.match(/^<\s*(\/?)\s*([a-z][\w:-]*)/i);
			if (tag) {
				const name = tag[2].toLowerCase();
				if (tag[1] && name === protectedTag) protectedTag = undefined;
				else if (!protectedTag && !tag[1] && protectedTags.has(name)) protectedTag = name;
			}
			return token;
		}
		if (protectedTag) return token;
		return numericParts(token)
			.map((part) => (part.numeric ? `<span class="number-value">${part.text}</span>` : part.text))
			.join('');
	});
}
