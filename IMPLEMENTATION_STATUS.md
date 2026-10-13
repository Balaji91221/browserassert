# BrowserAssert implementation status

Version 0.2.1. See [feature matrix](FEATURE_MATRIX.md) for every in-scope plan phase and its tests.

Local first-release code is implemented and real-browser workflows are verified with installed Chrome. Cross-site universality, remote file content semantics, autonomous planning, hosting, and visual-only model judgments are outside the release scope. Independent user pilots have not been performed.

## Verification

On Node 26.5.0/macOS, `npm run typecheck`, `npm run build`, and `npm test` passed,
including **20 tests**. Run these commands after `npm ci`; the browser integration
test also needs `npx playwright install chromium` or `BROWSERASSERT_EXECUTABLE`
pointing to an installed browser. Local verification used installed Chrome.
Local tarball installation and the controlled browser workflow were also verified.
The npm release uses compiled JavaScript and TypeScript declarations. Check the
[registry entry](https://www.npmjs.com/package/@kelavathbalajinaik/browserassert) for available versions.

## Public distribution

Install the compiled npm package with `npm install @kelavathbalajinaik/browserassert@0.2.1`. It includes the SDK, CLI, and TypeScript declarations. Version 0.2.1 updates packaging and install documentation; runtime behavior is unchanged from 0.2.0. The existing [v0.2.0 GitHub release](https://github.com/Balaji91221/browserassert/releases/tag/v0.2.0) remains unchanged with its original unscoped package metadata. Use the scoped npm package and imports for 0.2.1.
