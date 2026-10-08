import { escape } from './html';
import { pages, type Page } from './content';
import { icon, navigationIcons } from './icons';

const repository = 'https://github.com/accntech/minkpdf';
const npmPackage = 'https://www.npmjs.com/package/minkpdf';
// Official npm square mark: https://github.com/npm/logos/blob/master/npm%20square/n.svg
const npm =
	'<svg viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path fill="#c12127" d="M0,16V0H16V16ZM3,3V13H8V5h3v8h2V3Z"/><path fill="#fff" d="M3,3H13V13H11V5H8v8H3Z"/></svg>';
const github =
	'<svg viewBox="0 0 24 24" aria-hidden="true" fill="currentColor"><path d="M12 2a10 10 0 0 0-3.16 19.49c.5.09.68-.22.68-.48v-1.7c-2.78.6-3.37-1.18-3.37-1.18-.45-1.15-1.11-1.46-1.11-1.46-.91-.62.07-.61.07-.61 1 .07 1.53 1.03 1.53 1.03.89 1.52 2.34 1.08 2.91.83.09-.65.35-1.08.64-1.33-2.22-.25-4.55-1.11-4.55-4.94 0-1.09.39-1.99 1.03-2.69-.1-.25-.45-1.27.1-2.65 0 0 .84-.27 2.75 1.03A9.57 9.57 0 0 1 12 6.99c.85 0 1.71.11 2.51.34 1.91-1.3 2.75-1.03 2.75-1.03.55 1.38.2 2.4.1 2.65.64.7 1.03 1.6 1.03 2.69 0 3.84-2.34 4.69-4.57 4.94.36.31.68.92.68 1.85v2.58c0 .27.18.58.69.48A10 10 0 0 0 12 2Z"/></svg>';

export function template(page: Page, version: string): string {
	const index = pages.indexOf(page);
	const previous = pages[index - 1],
		next = pages[index + 1];
	return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="description" content="${escape(page.description)}">
  <meta name="theme-color" content="#d94248">
  <meta property="og:title" content="${escape(page.title)} · MinkPDF">
  <meta property="og:description" content="${escape(page.description)}">
  <meta property="og:type" content="website">
  <title>${escape(page.title)} · MinkPDF documentation</title>
  <script>document.documentElement.classList.add('js-enabled');let savedTheme;try{savedTheme=localStorage.getItem('minkpdf-theme')}catch{}document.documentElement.dataset.theme=savedTheme==='light'||savedTheme==='dark'?savedTheme:matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';</script>
  <link rel="icon" href="assets/icon.png" type="image/png">
  <link rel="stylesheet" href="assets/site.css">
  <link rel="alternate" type="text/plain" href="llms.txt" title="Documentation index for LLMs">
  <link rel="alternate" type="text/plain" href="llms-full.txt" title="Full documentation for LLMs">
  <script src="assets/site.js" type="module"></script>
</head>
<body class="page-${page.slug}">
<a class="skip-link" href="#main">Skip to content</a>
<aside class="sidebar" id="navigation">
  <button id="menu-close" type="button" aria-label="Close navigation">${icon('close-circle-linear')}</button>
  <a class="brand" href="index.html"><img src="assets/icon.png" width="38" height="38" alt=""><span>Mink<span class="brand-pdf">PDF</span><small>Documentation</small></span></a>
  <div class="version"><span class="version-dot" aria-hidden="true"></span><span>v${escape(version)}</span></div>
  <button class="search-trigger sidebar-search" type="button" aria-haspopup="dialog" aria-controls="search-dialog">${icon('magnifier-linear')}<span>Search docs</span><kbd class="search-shortcut">⌘ K</kbd></button>
  <nav aria-label="Documentation">${['Introduction', 'Guides', 'Reference']
		.map(
			(group) =>
				`<div class="nav-group"><span class="nav-label">${group}</span>${pages
					.filter((item) => item.group === group)
					.map(
						(item) =>
							`<a href="${item.slug}.html" ${item.slug === page.slug ? 'aria-current="page"' : ''}>${icon(navigationIcons[item.slug])}<span>${item.slug === 'index' ? 'Why MinkPDF?' : item.slug === 'getting-started' ? 'Getting started' : item.slug === 'benchmarks' ? 'Benchmarks' : escape(item.title)}</span>${item.slug === 'benchmarks' ? '<span class="nav-live" aria-hidden="true"></span>' : ''}</a>`
					)
					.join('')}</div>`
		)
		.join('')}</nav>
  <div class="sidebar-bottom">
    <div class="sidebar-resources">
      <a href="${npmPackage}" aria-label="View MinkPDF on npm">${npm}<span>npm package</span>${icon('arrow-right-up-linear').replace('class="solar-icon"', 'class="solar-icon resource-arrow"')}</a>
      <a href="llms.txt" aria-label="LLM index (llms.txt)" title="llms.txt">${icon('document-text-linear')}<span>LLM index</span></a>
      <a href="llms-full.txt" aria-label="Full LLM docs (llms-full.txt)" title="llms-full.txt">${icon('documents-linear')}<span>Full LLM docs</span></a>
    </div>
    <a class="sidebar-license" href="${repository}/blob/main/LICENSE">MIT licensed</a>
  </div>
</aside>
<dialog id="navigation-sheet" aria-label="Documentation navigation" data-state="closed"><div class="sheet-overlay" aria-hidden="true"></div></dialog>
<div class="site-shell">
  <header class="topbar"><div class="breadcrumb"><a href="index.html">Docs</a><span aria-hidden="true">/</span><span>${page.slug === 'index' ? 'Introduction' : escape(page.title)}</span></div><div class="topbar-actions"><button class="search-trigger mobile-search" type="button" aria-label="Search documentation" aria-haspopup="dialog" aria-controls="search-dialog">${icon('magnifier-linear')}</button><a href="${repository}" aria-label="View MinkPDF on GitHub" title="View MinkPDF on GitHub">${github}</a><button id="theme-toggle" type="button" aria-label="Switch to dark theme" aria-pressed="false" title="Switch to dark theme">${icon('moon-linear')}${icon('sun-2-linear')}</button><button id="menu-toggle" type="button" aria-label="Toggle navigation" aria-haspopup="dialog" aria-controls="navigation-sheet" aria-expanded="false">${icon('hamburger-menu-linear')}<span>Menu</span></button></div></header>
  <div class="content-layout">
    <main id="main">
      <div class="page-heading"><div class="eyebrow"><span class="eyebrow-line" aria-hidden="true"></span>${page.slug === 'index' ? 'THE MINKPDF HANDBOOK' : escape(page.group).toUpperCase()}</div><h1>${escape(page.title)}</h1><p class="lead">${escape(page.description)}</p></div>
      <article>${page.body}</article>
      <nav class="page-pagination" aria-label="Previous and next pages">${previous ? `<a href="${previous.slug}.html"><span>← Previous</span><strong>${previous.title}</strong></a>` : '<span></span>'}${next ? `<a href="${next.slug}.html"><span>Next →</span><strong>${next.slug === 'getting-started' ? 'Getting started' : next.title}</strong></a>` : '<span></span>'}</nav>
      <footer class="page-footer"><span>MinkPDF · Built for the documents you need.</span><span><a href="${repository}/blob/main/LICENSE">MIT license ↗</a> · <a href="https://github.com/480-Design/Solar-Icon-Set">Solar icons by 480 Design</a></span></footer>
    </main>
    <aside class="toc" aria-label="On this page"><span class="toc-label">ON THIS PAGE</span><nav>${page.sections.map(([id, label]) => `<a href="#${id}">${label}</a>`).join('')}</nav><a class="source-link" href="${repository}/blob/main/docs/site/${page.slug === 'benchmarks' ? 'charts' : 'content'}.ts">View page source ↗</a></aside>
  </div>
</div>
<div class="copy-status sr-only" aria-live="polite" role="status"></div>
<div class="navigation-status sr-only" aria-live="polite" role="status"></div>
<dialog id="search-dialog" aria-label="Search documentation" data-state="closed">
  <div class="search-input-row">${icon('magnifier-linear')}<label for="docs-search" class="sr-only">Search documentation</label><input id="docs-search" type="search" placeholder="Search documentation…" autocomplete="off" spellcheck="false" maxlength="160" aria-controls="search-results" autofocus><button id="search-close" type="button" aria-label="Close search">${icon('close-circle-linear')}</button></div>
  <p id="search-status" class="search-status" role="status" aria-live="polite">Search pages, examples, and API methods.</p>
  <ol id="search-results" class="search-results" aria-label="Search results"></ol>
  <div class="search-footer"><span><kbd>↑</kbd><kbd>↓</kbd> navigate <kbd>↵</kbd> open</span><span><kbd>Esc</kbd> close</span></div>
</dialog>
<template id="search-result-template"><li><a class="search-result"><div><small></small><strong></strong><p></p></div>${icon('arrow-right-linear')}</a></li></template>
</body>
</html>`;
}
