export function pagePath(slug: string): string {
	return slug === 'index' ? './' : `${slug}/`;
}
