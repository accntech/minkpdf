# Contributing to MinkPDF

Contributions are welcome: bug reports, documentation improvements, regression tests, and focused
code changes. Please follow our [Code of Conduct](./CODE_OF_CONDUCT.md) in all project interactions.

## Before you start

Read the [README](./README.md), especially the supported API and compatibility limitations. MinkPDF
implements a subset of pdfmake's document-definition API and keeps the engine free of runtime package
dependencies. For a new feature, dependency, or public API change, open an issue to discuss the scope
before investing in a large implementation.

Search [existing issues](https://github.com/accntech/minkpdf/issues) before opening a new one.

## Report a bug or suggest a feature

For a bug report, include:

- The MinkPDF version and runtime, including the browser, Node.js, or Bun version.
- A minimal document definition and the code needed to reproduce the problem.
- What you expected and what actually happened, including any error message.
- Relevant font or image details, and a sample PDF or screenshot when it helps explain a layout issue.

Use synthetic data and share only assets you have permission to distribute. Remove personal data,
credentials, and confidential document content from examples and attachments.

For a feature request, describe the use case, an example document definition, and the result you need.
If the request concerns pdfmake compatibility, identify the behavior you want to support.

## Set up your checkout

Fork the repository on GitHub, clone your fork, and create a branch for your change:

```sh
git clone https://github.com/YOUR_USERNAME/minkpdf.git
cd minkpdf
git switch -c your-change
```

Use Bun **1.4.2**, matching `packageManager` in `package.json`. The engine package has no runtime or
development package dependencies, so there are no package dependencies to install before building.
The full test suite also needs Node.js, npm, registry access, and Poppler's `pdfinfo`, `pdftotext`, and
`pdfimages` tools.

Install Poppler using your platform's package manager:

```sh
# macOS with Homebrew
brew install poppler
# Debian / Ubuntu
sudo apt-get install poppler-utils
```

Build the package and run the tests:

```sh
bun run build
bun test
```

Package and tree-shaking tests install pinned tooling in temporary consumer directories and clean up
those dependencies afterward. For details, see the README's [Development](./README.md#development)
section.

## Make and verify your change

- Keep each pull request focused on one problem. Follow the surrounding TypeScript style and
  `.prettierrc`: tabs, single quotes, no trailing commas, and a 100-character print width.
- Add a regression test for bug fixes and meaningful coverage for new behavior. Tests use Bun's
  built-in runner in `tests/`; PDF checks use Poppler to read generated output independently.
- Update the README or relevant files in `docs/` when changing supported behavior, limitations, or
  public APIs.
- Keep optional features separate from the core so consumers can remove unused modules. See
  [Optional features and tree-shaking](./docs/tree-shaking.md).
- Preserve licenses for font fixtures and any other third-party assets.

During development, you can run a focused test file, for example:

```sh
bun test tests/engine.unit.test.ts
```

Before submitting code changes, run `bun run build` and `bun test`. If the change affects imports,
optional features, or bundle size, also run the bundle budget check used by the release workflow:

```sh
bun benchmarks/tree-shaking.ts --compare-baseline=benchmarks/tree-shaking-baseline.json
```

For performance changes, run `bun run benchmark` and include the relevant measurements and runtime
details in your pull request. See the README's [benchmark instructions](./README.md#run-the-benchmark)
for prerequisites and options. Generated `dist/` output is ignored; commit source changes instead.
Documentation-only changes need a check of their links and instructions; engine tests are unnecessary
unless the documented behavior changes too.

## Commit messages and signatures

Follow the repository's commit convention: `type: short summary`. Use a lowercase type that describes
the change, such as `feat`, `fix`, `docs`, `test`, `refactor`, `perf`, `ci`, or `chore`. Keep each commit
focused on one logical change and write the summary as an action:

```text
docs: add contributing guide and code of conduct
fix: preserve table headers across page breaks
test: cover missing font variants
```

All commits submitted in a pull request must be signed and show **Verified** on GitHub. Recent
repository commits use GPG signing. You can use a GPG or SSH signing key registered with your GitHub
account; follow GitHub's [commit signature verification guide](https://docs.github.com/en/authentication/managing-commit-signature-verification)
to configure your key and identity.

Once signing is configured, sign each commit explicitly or enable signing by default for this checkout:

```sh
git commit -S -m "docs: improve contribution instructions"
# Or enable signing for subsequent commits in this repository:
git config commit.gpgsign true
```

Check the signature locally with `git verify-commit HEAD`, then check that GitHub displays **Verified**
after pushing your branch. Local signature verification alone does not establish GitHub's verification
status. A `Signed-off-by` trailer is not a cryptographic signature and does not satisfy this requirement.

## Submit a pull request

Open a pull request against `main` with:

- A clear description of the problem and the resulting behavior.
- A link to the relevant issue, if one exists.
- The checks you ran and their results, including any checks you could not run.
- Commits that follow the message convention above and show **Verified** on GitHub.
- Sample output or screenshots for visible PDF changes, and benchmark results for performance claims.

Small pull requests are easier to review. Respond to review feedback and keep the description current
if the scope changes. Publishing is handled by maintainers through the
[release workflow](./docs/releases.md).

Contributions to the engine are provided under the repository's [MIT License](./LICENSE). Font
fixtures retain their separate SIL Open Font licenses.
