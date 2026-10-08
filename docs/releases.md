# Publishing releases

The `Stage npm release` GitHub Actions workflow runs when a GitHub release is published. It checks out the release tag, sets the npm package version from that tag, runs the PDF tests with Poppler, builds the package, and stages it on npm with provenance for your approval. Use version tags such as `v0.1.0` or `v0.2.0-beta.1`; no separate version commit is required. Stable releases use npm's `latest` tag. GitHub prereleases and versions containing a prerelease suffix use `next`.

Use a granular npm access token with **Read and write (stage only)** package permission and access to `minkpdf` (or **All packages** for its first staging), saved in this repository's Actions secrets as `NPM_TOKEN`. Staging does not require 2FA bypass or organization management permissions. No token is stored in the repository. The npm package name is `minkpdf`.

After a successful workflow run, open **Staged Packages** in your npm account, review the `minkpdf` version, and click **Approve**. npm requires your interactive 2FA verification before publishing the staged version. The workflow does not approve or publish it for you. For a new package, npm creates a public `0.0.0-stage` placeholder; the release's contents remain staged until you approve them. See [npm staged publishing](https://docs.npmjs.com/staged-publishing/).

To stage an existing release, open GitHub Actions → **Stage npm release** → **Run workflow**, select `main`, and enter its release tag. Each staged or published version must be unique; staging the same version again fails. Draft releases and tag pushes alone do not stage a package. The workflow uses npm 11.15.0, which supports staged publishing.

After the package exists, you can optionally configure [npm trusted publishing](https://docs.npmjs.com/trusted-publishers/) with GitHub organization `accntech`, repository `minkpdf`, and workflow filename `publish.yml`, allowing `npm stage publish`. Leave the environment name empty. Once trusted staging works, remove the `NPM_TOKEN` secret; subsequent releases use GitHub's OIDC token and still require your npm approval.


[Back to the README](../README.md).
