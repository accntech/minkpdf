# Documentation site

The documentation is a static, six-page site built with Bun and no package dependencies. It covers
the project’s rationale, getting started, installation, API reference, comparison with pdfmake,
and recorded benchmarks. Every page and graph is rendered into HTML at build time; JavaScript
enhances page navigation, documentation search, the mobile menu, copy buttons, and benchmark metric selector. Without JavaScript, the
navigation, examples, and every chart remain available.

The enhanced layout is initialized before the first paint. Internal links replace the page content
while preserving the sidebar and header; browser history and section links remain available. If
loading a page fails, navigation falls back to its ordinary static URL.

Use **Search docs**, **Cmd+K** (Mac), **Ctrl+K** (other platforms), or **/** to search all pages,
API examples, and sections. Results link directly to the matching heading. Arrow keys move through
results, Enter opens a result, and Escape closes search. The search index is generated from the
documentation during the build and served locally; there is no external search service.

`llms.txt` at the site root provides a concise documentation index for LLM tools, linking to
all six pages and `llms-full.txt`. The full file preserves examples, API tables, benchmark
results, and source links. Both files are regenerated from the same page content on every
build and linked from the sidebar and each page's metadata.

## Preview locally

Use Bun 1.4.2, matching the repository’s `packageManager`:

```sh
bun run docs:dev
```

Open `http://127.0.0.1:4173`. Set `PORT=4174` to choose another port. The command builds once;
after changing content, run `bun run docs:build` again and refresh the page. Stop the server with
Ctrl+C.

```sh
bun run docs:build
bun run docs:test
```

The output is `.site/`, ignored by Git. It can be served by any static host. Links and assets use
relative paths, so the same output works at the domain root or under `/minkpdf/`. The build does
not require the engine’s `dist/` directory, Poppler, npm, or a registry connection.

## Publish on GitHub Pages

1. In `accntech/minkpdf`, open **Settings → Pages**.
2. Set **Build and deployment → Source** to **GitHub Actions**.
3. Commit and push the documentation changes to `main`, or run **Documentation site** from
   the Actions tab after the workflow exists on `main`.
4. The workflow builds, checks links and chart data, uploads `.site/`, and deploys it to Pages.

The expected project URL is **https://accntech.github.io/minkpdf/**. The workflow’s deployment
environment links to the actual URL. Pull requests run build checks without deploying. A manual
run on another branch also builds without deploying. Publishing uses GitHub’s Pages artifact
workflow; it does not write a `gh-pages` branch or publish an npm release.

The GitHub Pages setup follows [GitHub’s custom workflow documentation](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages).

## Maintain the content

- `docs/site/content.ts`: navigation metadata and the five prose/reference pages.
- `docs/site/charts.ts`: benchmark page, graph generation, and report imports.
- `docs/site/template.ts`: shared sidebar, metadata, page navigation, and table of contents.
- `docs/site/site.css`: responsive visual design, focus styles, reduced motion, and printing.
- `docs/site/site.js`: page navigation, search dialog, mobile menu, copy buttons, and chart selection.
- `docs/site/search-index.ts`: section text and inline API names used to build the search index.
- `docs/site/llm.ts`: documentation index and full Markdown export for `llms.txt` and `llms-full.txt`.
- `docs/site/search.js`: query matching, ranking, and snippets shared with the tests.
- `docs/site/navigation.js`: restrict enhanced links to static pages in the same project directory.
- `docs/site/icons.ts` and `docs/site/solar-icons.json`: locally stored Solar SVGs and attribution.
- `scripts/build-docs.ts`: HTML, SVG, assets, and raw-data export.
- `scripts/serve-docs.ts`: local preview server.
- `tests/docs.unit.test.ts`: static page checks, local links/fragments, and graph/report consistency.

The benchmark graphs are generated from `docs/benchmarks/2026-10-08.json` and
`docs/benchmarks/2026-10-08-tree-shaking.json`. Downloadable SVG graphs and JSON reports ship
alongside the pages. For a new measurement, save a new report and update its imports and export
filenames. Keep the original render comparison separate from the later optional-feature
measurement: their tool versions and engine implementations differ.

After API changes, update the reference and migration examples against `src/engine.ts` and
`src/interfaces.ts`. The docs workflow deliberately triggers on documentation changes; an engine
change should include its corresponding docs changes when applicable.

## Icon attribution

The site uses [Solar icons by 480 Design](https://github.com/480-Design/Solar-Icon-Set),
distributed through [Iconify's Solar catalogue](https://github.com/iconify/icon-sets/blob/master/json/solar.json)
under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). Original SVG paths are preserved;
size and color inherit from the site's styles. Attribution appears in the page footer. The
GitHub brand mark is retained for repository links.
