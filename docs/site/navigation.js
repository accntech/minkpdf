export function canNavigateDocument(href, current, filenames) {
	try {
		const url = new URL(href, current);
		const base = new URL('./', current);
		return (
			url.origin === base.origin &&
			filenames.some((file) => url.pathname === new URL(file, base).pathname)
		);
	} catch {
		return false;
	}
}
