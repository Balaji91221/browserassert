# BrowserAssert implementation status

Local version 0.2.0. See [feature matrix](FEATURE_MATRIX.md) for every in-scope plan phase and its tests.

Local first-release code is implemented and real-browser workflows are verified with installed Chrome. Cross-site universality, remote file content semantics, autonomous planning, hosting, and visual-only model judgments are outside the release scope. User pilots and public package publication are not performed.

## Verification

On Node 26.5.0/macOS, `npm run typecheck`, `npm run build`, and `npm test` passed,
including **20 tests**. Run these commands after `npm ci`; the browser integration
test also needs `npx playwright install chromium` or `BROWSERASSERT_EXECUTABLE`
pointing to an installed browser. Local verification used installed Chrome.
Local tarball installation and the controlled browser workflow were also verified.
Public GitHub source distribution does not publish an npm package; the package
remains unpublished in the npm registry.
