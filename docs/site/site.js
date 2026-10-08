import { searchDocuments, searchSnippet } from './search.js';
import { canNavigateDocument } from './navigation.js';
import { numericParts } from './numbers.js';

// The sidebar, header, and search stay mounted while real static pages supply the content.
document.body.classList.add('js-enabled');
const themeButton = document.querySelector('#theme-toggle');
const systemTheme = window.matchMedia('(prefers-color-scheme: dark)');
let themePreference;
try {
	themePreference = localStorage.getItem('minkpdf-theme');
} catch {}
function applyTheme(theme) {
	document.documentElement.dataset.theme = theme;
	const dark = theme === 'dark';
	const label = `Switch to ${dark ? 'light' : 'dark'} theme`;
	themeButton.setAttribute('aria-pressed', String(dark));
	themeButton.setAttribute('aria-label', label);
	themeButton.title = label;
}
function syncTheme() {
	applyTheme(
		themePreference === 'light' || themePreference === 'dark'
			? themePreference
			: systemTheme.matches
				? 'dark'
				: 'light'
	);
}
syncTheme();
themeButton.addEventListener('click', () => {
	themePreference = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
	try {
		localStorage.setItem('minkpdf-theme', themePreference);
	} catch {}
	applyTheme(themePreference);
});
systemTheme.addEventListener('change', syncTheme);
window.addEventListener('storage', (event) => {
	if (event.key === 'minkpdf-theme' || event.key === null) {
		themePreference = event.newValue;
		syncTheme();
	}
});
const menuButton = document.querySelector('#menu-toggle');
const navigation = document.querySelector('#navigation');
const mobile = window.matchMedia('(max-width: 760px)');
const sheet = document.querySelector('#navigation-sheet');
const navigationHome = document.createComment('Desktop sidebar');
navigation.before(navigationHome);
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
let menuClosing;
let finishMenuClose;
let menuCloseTimer;
let restoreMenuFocus = true;
const files = [...navigation.querySelectorAll('nav a')].map((link) =>
	new URL(link.href).pathname.split('/').pop()
);
const canonicalPath = (url) =>
	url.pathname.endsWith('/') ? url.pathname + 'index.html' : url.pathname;
let loadedUrl = new URL(location.href);
let navigationSequence = 0;
let restoringScroll = false;
let scrollFrame;
const pageCache = new Map();
const navigationStatus = document.querySelector('.navigation-status');
const searchDialog = document.querySelector('#search-dialog');
const searchInput = document.querySelector('#docs-search');
const searchResults = document.querySelector('#search-results');
const searchStatus = document.querySelector('#search-status');
const resultTemplate = document.querySelector('#search-result-template');
let searchIndex;
let searchSequence = 0;
let searchOpener;
let restoreSearchFocus = true;
let searchClosing = false;
let searchCloseTimer;
const indexUrl = new URL('search-index.json', import.meta.url);

function finishClosingMenu() {
	clearTimeout(menuCloseTimer);
	if (sheet.open) sheet.close();
	document.body.classList.remove('menu-open');
	finishMenuClose?.();
	finishMenuClose = undefined;
	menuClosing = undefined;
}
function closeMenu({ immediate = false, restoreFocus = true } = {}) {
	if (!sheet.open) return Promise.resolve();
	if (!restoreFocus) restoreMenuFocus = false;
	if (menuClosing) {
		if (immediate) finishClosingMenu();
		return menuClosing ?? Promise.resolve();
	}
	sheet.dataset.state = 'closed';
	menuButton.setAttribute('aria-expanded', 'false');
	menuClosing = new Promise((resolve) => {
		finishMenuClose = resolve;
	});
	const closing = menuClosing;
	if (immediate || reducedMotion.matches) finishClosingMenu();
	else menuCloseTimer = setTimeout(finishClosingMenu, 350);
	return closing;
}
function syncMenuLayout() {
	closeMenu({ immediate: true });
	document.body.classList.remove('menu-open');
	menuButton.setAttribute('aria-expanded', 'false');
	if (mobile.matches) sheet.append(navigation);
	else navigationHome.after(navigation);
}
syncMenuLayout();
mobile.addEventListener('change', syncMenuLayout);
menuButton.addEventListener('click', () => {
	if (!mobile.matches || sheet.open) return;
	restoreMenuFocus = true;
	document.body.classList.add('menu-open');
	sheet.showModal();
	// Establish the offscreen position before transitioning, without mounting new content.
	navigation.getBoundingClientRect();
	sheet.dataset.state = 'open';
	menuButton.setAttribute('aria-expanded', 'true');
	navigation.querySelector('a[aria-current="page"]')?.focus({ preventScroll: true });
});
navigation.addEventListener('transitionend', (event) => {
	if (event.target === navigation && event.propertyName === 'transform' && menuClosing)
		finishClosingMenu();
});
sheet.addEventListener('cancel', (event) => {
	event.preventDefault();
	closeMenu();
});
sheet.addEventListener('close', () => {
	if (restoreMenuFocus && mobile.matches) menuButton.focus({ preventScroll: true });
});
sheet.addEventListener('click', (event) => {
	if (event.target === sheet || event.target.closest('.sheet-overlay')) closeMenu();
});
document.querySelector('#menu-close').addEventListener('click', () => closeMenu());
reducedMotion.addEventListener('change', () => {
	if (menuClosing) finishClosingMenu();
});

let observer;
function selectMetric(metric) {
	for (const button of document.querySelectorAll('[data-metric]'))
		button.setAttribute('aria-pressed', String(button.dataset.metric === metric));
	for (const panel of document.querySelectorAll('[data-chart]')) {
		panel.hidden = panel.dataset.chart !== metric;
		panel.toggleAttribute('data-active', !panel.hidden);
	}
}
function initializeContent() {
	observer?.disconnect();
	if (document.querySelector('[data-chart]')) selectMetric('medianMs');
	if (!('IntersectionObserver' in window)) return;
	observer = new IntersectionObserver(
		(entries) => {
			for (const entry of entries) {
				if (!entry.isIntersecting) continue;
				for (const link of document.querySelectorAll('.toc nav a')) {
					if (link.hash === '#' + entry.target.id) link.setAttribute('aria-current', 'location');
					else link.removeAttribute('aria-current');
				}
			}
		},
		{ rootMargin: '-70px 0px -55% 0px' }
	);
	document.querySelectorAll('article h2[id]').forEach((heading) => observer.observe(heading));
}
initializeContent();

if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
function saveScroll() {
	history.replaceState({ ...history.state, docsScroll: [scrollX, scrollY] }, '', location.href);
}
saveScroll();
window.addEventListener(
	'scroll',
	() => {
		if (restoringScroll) return;
		cancelAnimationFrame(scrollFrame);
		scrollFrame = requestAnimationFrame(saveScroll);
	},
	{ passive: true }
);

function moveToLocation(url, savedScroll) {
	let anchor;
	try {
		anchor = url.hash ? document.getElementById(decodeURIComponent(url.hash.slice(1))) : null;
	} catch {
		anchor = null;
	}
	if (savedScroll)
		window.scrollTo({ left: savedScroll[0], top: savedScroll[1], behavior: 'instant' });
	else if (anchor) anchor.scrollIntoView({ block: 'start', behavior: 'instant' });
	else window.scrollTo({ left: 0, top: 0, behavior: 'instant' });
	const target = anchor ?? document.querySelector('h1');
	target?.setAttribute('tabindex', '-1');
	target?.focus({ preventScroll: true });
}

async function navigateDocument(url, { push = true, savedScroll } = {}) {
	const sequence = ++navigationSequence;
	try {
		let incoming;
		if (canonicalPath(url) !== canonicalPath(loadedUrl)) {
			navigationStatus.textContent = 'Loading documentation…';
			const key = url.pathname + url.search;
			let source = pageCache.get(key);
			if (!source) {
				const response = await fetch(key, { headers: { Accept: 'text/html' } });
				if (!response.ok) throw new Error('Documentation unavailable');
				source = await response.text();
				pageCache.set(key, source);
			}
			incoming = new DOMParser().parseFromString(source, 'text/html');
			if (!incoming.querySelector('.content-layout') || !incoming.querySelector('.breadcrumb'))
				throw new Error('Invalid documentation page');
		}
		if (sequence !== navigationSequence) return;
		cancelAnimationFrame(scrollFrame);
		if (push) {
			saveScroll();
			history.pushState({ docsScroll: [0, 0] }, '', url.href);
		}
		restoringScroll = true;
		await closeMenu({ restoreFocus: false });
		if (sequence !== navigationSequence) return;
		closeSearch({ immediate: true, restoreFocus: false });
		if (incoming) {
			document
				.querySelector('.content-layout')
				.replaceWith(incoming.querySelector('.content-layout'));
			document
				.querySelector('.breadcrumb')
				.replaceChildren(...incoming.querySelector('.breadcrumb').childNodes);
			for (const name of [...document.body.classList])
				if (name.startsWith('page-')) document.body.classList.remove(name);
			for (const name of incoming.body.classList)
				if (name.startsWith('page-')) document.body.classList.add(name);
			document.title = incoming.title;
			for (const selector of [
				'meta[name="description"]',
				'meta[property="og:title"]',
				'meta[property="og:description"]'
			])
				document.querySelector(selector).content = incoming.querySelector(selector).content;
			for (const link of navigation.querySelectorAll('nav a')) {
				if (new URL(link.href).pathname === canonicalPath(url))
					link.setAttribute('aria-current', 'page');
				else link.removeAttribute('aria-current');
			}
			initializeContent();
		}
		loadedUrl = url;
		moveToLocation(url, savedScroll);
		navigationStatus.textContent = `${document.querySelector('h1').textContent} loaded.`;
		requestAnimationFrame(() => {
			restoringScroll = false;
			saveScroll();
		});
	} catch {
		if (sequence === navigationSequence) location.assign(url.href);
	}
}
window.addEventListener('popstate', (event) => {
	cancelAnimationFrame(scrollFrame);
	restoringScroll = true;
	navigateDocument(new URL(location.href), { push: false, savedScroll: event.state?.docsScroll });
});

document.addEventListener('click', async (event) => {
	const copy = event.target.closest('.copy-button');
	if (copy) {
		const code = copy.closest('.code-block').querySelector('code');
		const label = copy.querySelector('span') ?? copy;
		const status = document.querySelector('.copy-status');
		try {
			await navigator.clipboard.writeText(code.textContent);
			label.textContent = 'Copied';
			status.textContent = 'Code copied to clipboard.';
		} catch {
			label.textContent = 'Select code';
			status.textContent = 'Select the highlighted code and copy it manually.';
			const range = document.createRange();
			range.selectNodeContents(code);
			const selection = window.getSelection();
			selection.removeAllRanges();
			selection.addRange(range);
		}
		setTimeout(() => {
			label.textContent = 'Copy';
		}, 2000);
		return;
	}
	const metric = event.target.closest('[data-metric]');
	if (metric) {
		selectMetric(metric.dataset.metric);
		return;
	}
	const link = event.target.closest('a[href]');
	if (
		!link ||
		event.defaultPrevented ||
		event.button !== 0 ||
		event.metaKey ||
		event.ctrlKey ||
		event.shiftKey ||
		event.altKey ||
		link.hasAttribute('download') ||
		(link.target && link.target !== '_self')
	)
		return;
	if (!canNavigateDocument(link.href, location.href, files)) return;
	const url = new URL(link.href);
	if (canonicalPath(url) === canonicalPath(loadedUrl) && url.hash && !searchDialog.open) return;
	event.preventDefault();
	navigateDocument(url);
});

function setNumberText(element, text) {
	element.replaceChildren(
		...numericParts(text).map((part) => {
			if (!part.numeric) return document.createTextNode(part.text);
			const value = document.createElement('span');
			value.className = 'number-value';
			value.textContent = part.text;
			return value;
		})
	);
}
async function renderSearch() {
	const query = searchInput.value;
	const sequence = ++searchSequence;
	searchStatus.textContent = 'Searching documentation…';
	try {
		searchIndex ??= fetch(indexUrl)
			.then((response) => {
				if (!response.ok) throw new Error('Search index unavailable');
				return response.json();
			})
			.catch((error) => {
				searchIndex = undefined;
				throw error;
			});
		const index = await searchIndex;
		if (sequence !== searchSequence || !searchDialog.open) return;
		const matches = query.trim()
			? searchDocuments(index, query)
			: index.filter((row) => row.overview);
		const items = matches.map((row) => {
			const item = resultTemplate.content.firstElementChild.cloneNode(true);
			item.querySelector('a').href = new URL(row.url, location.href).href;
			setNumberText(item.querySelector('small'), row.overview ? 'Documentation' : row.page);
			setNumberText(item.querySelector('strong'), row.section);
			setNumberText(item.querySelector('p'), searchSnippet(row.text, query));
			return item;
		});
		searchResults.replaceChildren(...items);
		searchResults.scrollTop = 0;
		setNumberText(
			searchStatus,
			query.trim()
				? matches.length
					? `${matches.length} result${matches.length === 1 ? '' : 's'} for “${query}”`
					: `No results for “${query}”. Try a method or topic, such as fonts or getBuffer.`
				: 'Jump to a page, or search by topic or API method.'
		);
	} catch {
		if (sequence !== searchSequence) return;
		searchResults.replaceChildren();
		searchStatus.textContent = 'Could not load documentation search. Type again to retry.';
	}
}
function finishClosingSearch() {
	clearTimeout(searchCloseTimer);
	searchClosing = false;
	searchDialog.close();
	document.body.classList.remove('search-open');
}
function closeSearch({ immediate = false, restoreFocus = true } = {}) {
	if (!searchDialog.open) return;
	if (!restoreFocus) restoreSearchFocus = false;
	searchSequence++;
	searchDialog.dataset.state = 'closed';
	if (immediate || reducedMotion.matches || searchDialog.dataset.motion === 'instant') {
		searchDialog.dataset.motion = 'instant';
		finishClosingSearch();
	} else if (!searchClosing) {
		searchClosing = true;
		searchCloseTimer = setTimeout(finishClosingSearch, 150);
	}
}
async function openSearch(opener, { animate = true } = {}) {
	restoreSearchFocus = true;
	searchOpener =
		mobile.matches && navigation.contains(opener)
			? document.querySelector('.mobile-search')
			: opener;
	await closeMenu({ restoreFocus: false });
	clearTimeout(searchCloseTimer);
	searchClosing = false;
	searchDialog.dataset.motion = animate && !reducedMotion.matches ? 'fade' : 'instant';
	if (!searchDialog.open) {
		document.body.classList.add('search-open');
		searchDialog.showModal();
		// Paint at its final size and position; only opacity changes when opened by a click.
		searchDialog.getBoundingClientRect();
	}
	searchDialog.dataset.state = 'open';
	searchInput.focus();
	searchInput.select();
	renderSearch();
}
document
	.querySelectorAll('.search-trigger')
	.forEach((button) =>
		button.addEventListener('click', (event) => openSearch(button, { animate: event.detail > 0 }))
	);
document
	.querySelector('#search-close')
	.addEventListener('click', (event) => closeSearch({ immediate: event.detail === 0 }));
searchInput.addEventListener('input', renderSearch);
searchDialog.addEventListener('transitionend', (event) => {
	if (event.target === searchDialog && event.propertyName === 'opacity' && searchClosing)
		finishClosingSearch();
});
searchDialog.addEventListener('cancel', (event) => {
	event.preventDefault();
	closeSearch({ immediate: true });
});
reducedMotion.addEventListener('change', () => {
	if (searchClosing) closeSearch({ immediate: true });
});
searchDialog.addEventListener('close', () => {
	searchSequence++;
	if (restoreSearchFocus) searchOpener?.focus({ preventScroll: true });
});
searchDialog.addEventListener('click', (event) => {
	if (event.target !== searchDialog) return;
	const bounds = searchDialog.getBoundingClientRect();
	if (
		event.clientX < bounds.left ||
		event.clientX > bounds.right ||
		event.clientY < bounds.top ||
		event.clientY > bounds.bottom
	)
		closeSearch();
});
searchDialog.addEventListener('keydown', (event) => {
	if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp' && event.key !== 'Enter') return;
	const links = [...searchResults.querySelectorAll('a')];
	if (!links.length) return;
	if (event.key === 'Enter') {
		if (event.target === searchInput || links.includes(document.activeElement)) {
			event.preventDefault();
			(links.includes(document.activeElement) ? document.activeElement : links[0]).click();
		}
		return;
	}
	event.preventDefault();
	const current = links.indexOf(document.activeElement);
	const next =
		event.key === 'ArrowDown'
			? (current + 1) % links.length
			: current <= 0
				? links.length - 1
				: current - 1;
	links[next].focus();
});
document.querySelectorAll('.search-shortcut').forEach((label) => {
	label.textContent = /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘ K' : 'Ctrl K';
});
document.addEventListener('keydown', (event) => {
	if (event.key === 'Escape' && searchDialog.open) {
		event.preventDefault();
		closeSearch({ immediate: true });
		return;
	}
	const editing = event.target.closest('input, textarea, [contenteditable="true"]');
	if (
		((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') ||
		(event.key === '/' && !editing && !event.metaKey && !event.ctrlKey && !event.altKey)
	) {
		event.preventDefault();
		openSearch(document.activeElement, { animate: false });
	} else if (
		event.key === 'Escape' &&
		!searchDialog.open &&
		menuButton.getAttribute('aria-expanded') === 'true'
	) {
		event.preventDefault();
		closeMenu();
	}
});
