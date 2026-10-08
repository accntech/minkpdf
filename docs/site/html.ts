import { icon } from './icons';

export function escape(value: unknown): string {
	return String(value)
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;')
		.replaceAll('"', '&quot;')
		.replaceAll("'", '&#39;');
}

export function code(source: string, label = 'TypeScript'): string {
	const tokens =
		/(\/\/[^\n]*|#[^\n]*$|'[^'\n]*'|"[^"\n]*"|`[^`]*`|\b(?:import|from|const|let|await|async|function|return|export|type|new|if|try|finally|catch|throw)\b|\b\d+(?:\.\d+)?\b)/gm;
	let highlighted = '',
		previous = 0;
	for (const match of source.matchAll(tokens)) {
		highlighted += escape(source.slice(previous, match.index));
		const token = match[0];
		const kind =
			token.startsWith('//') || token.startsWith('#')
				? 'comment'
				: /^["'`]/.test(token)
					? 'string'
					: /^\d/.test(token)
						? 'number'
						: 'keyword';
		highlighted += `<span class="token-${kind}">${escape(token)}</span>`;
		previous = match.index! + token.length;
	}
	highlighted += escape(source.slice(previous));
	return `<div class="code-block"><div class="code-label"><span>${escape(label)}</span><button class="copy-button" type="button" aria-label="Copy ${escape(label)} code">${icon('copy-linear')}<span>Copy</span></button></div><pre><code>${highlighted}</code></pre></div>`;
}

export function table(headers: string[], rows: string[][], caption?: string): string {
	return `<div class="table-scroll" role="region" aria-label="${escape(caption ?? headers.join(', '))}" tabindex="0"><table>${caption ? `<caption>${escape(caption)}</caption>` : ''}<thead><tr>${headers.map((header) => `<th scope="col">${header}</th>`).join('')}</tr></thead><tbody>${rows.map((row) => `<tr>${row.map((cell, index) => (index === 0 ? `<th scope="row">${cell}</th>` : `<td>${cell}</td>`)).join('')}</tr>`).join('')}</tbody></table></div>`;
}

export const heading = (id: string, title: string) =>
	`<h2 id="${id}">${title}<a class="heading-link" href="#${id}" aria-label="Link to ${escape(title)}">#</a></h2>`;
export const note = (title: string, body: string) =>
	`<aside class="note"><strong>${title}</strong><p>${body}</p></aside>`;
