# BrowserAssert

Evidence-backed browser postcondition verification. Local development release 0.2.0; not published to npm.

## Quick start and usage

```bash
git clone https://github.com/Balaji91221/browserassert.git
cd browserassert
npm ci
npm run build
npx playwright install chromium
npm test
npm run demo  # exits 1: the demo intentionally detects a non-persistent edit
```

If you already have Chrome, avoid a browser download by setting `BROWSERASSERT_EXECUTABLE` for the integration test:

```bash
BROWSERASSERT_EXECUTABLE='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' npm test
```

The verifier returns `verified`, `failed`, or `unknown`. CLI exit codes are respectively 0, 1, and 2. A missing browser executable is an integration setup failure, not a passing test. Unit tests alone can be run with `node --test test/core.test.mjs`.

### Attach to an existing Playwright page

```ts
import { PlaywrightAdapter, verify } from '@ai-opensource-local/browserassert';
const result = await verify(
  { selector: '#display-name', expected: 'Alice', reload: true, timeoutMs: 3000 },
  new PlaywrightAdapter(page),
);
console.log(result.verdict, result.evidence);
```

The caller owns the page and any action that changed it. The verifier never clicks Save. `reload: true` explicitly permits one reload; omit it for observation-only checks. Supported expected values are scalar strings, numbers, booleans, or null; DOM values are usually strings. Selectors must match exactly one element. Adapter observations must identify that exact selector in `source`; unrelated evidence returns unknown. The adapter reads an element's `value`, or its `textContent` otherwise.

```ts
import { verifyDownload } from '@ai-opensource-local/browserassert';
const pending = page.waitForEvent('download');
await page.getByText('Download').click(); // caller's action
const result = await verifyDownload(await pending, {
  expectedFilename: 'report.txt', minBytes: 1,
});
```

`verifyDownload` checks an already-started download, its completion error, filename, and local artifact size. This does not verify semantic file content.

### Recorded observations

```bash
node dist/cli.js check-recording contract.json observations.json
```

A contract is `{ "selector": "#status", "expected": "Saved" }`. Observations are an array of `{ "source": "#status", "value": "Saved" }`. This evaluates recorded evidence only; it rejects reload contracts and cannot prove current browser state.

## Local installation in another project

Build and package this source folder, then install the resulting tarball in your consuming project:

```bash
npm run build
npm pack
# In the consuming project:
npm install /absolute/path/to/generated-package.tgz
```

The package exports compiled JavaScript and TypeScript declarations. Node.js 22.18 or newer is required. `npm ci` uses the committed dependency lockfile. `npm run typecheck` checks the source; `npm run build` creates `dist/`. The package is marked private to prevent accidental publication. Original code is MIT licensed. Selecting an available public name and publishing remain explicit release tasks; dependencies retain their own licenses.

## Design and current scope

See [FEATURE_MATRIX.md](FEATURE_MATRIX.md) for the implemented plan phases and [IMPLEMENTATION_STATUS.md](IMPLEMENTATION_STATUS.md) for verification boundaries.

## Verification plans and evidence bundles

```ts
import { PlaywrightAdapter, runPlan, saveBundle } from '@ai-opensource-local/browserassert';
const plan = {
  schemaVersion: 1, id: 'settings', timeoutMs: 5000,
  authenticated: { selector: '#identity', expected: 'Signed in' },
  checks: [{ id: 'persisted-name', selector: '#name', expected: 'Alice', reload: true }],
};
const result = await runPlan(plan, new PlaywrightAdapter(page), { signal });
await saveBundle('/tmp/new-evidence', plan, result, {
  redactSelectors: ['#secret'], redactValues: ['secret-value'],
  screenshotPage: page, maskSelectors: ['#private-panel'],
});
```

The screenshot is opt-in and masks both `maskSelectors` and `redactSelectors`. Only configured selectors/values are redacted; choose them for your application. Never assume automatic secret discovery. The fresh bundle directory contains plan/result JSON, an interactive HTML evidence report, optional screenshot, and a hash manifest. Existing output directories are never overwritten. No page HTML or browser storage is captured.

Contracts support `equals` (default), string `contains`, and numeric `at_least`/`at_most`. All plan contracts are validated before browser operations. Checks share one overall deadline. A failed authentication observation yields unknown and prevents protected checks; it is an application-declared signal, not a universal authentication detector. AbortSignal cancellation yields unknown. Adapters should honor the signal; the wrapper cannot forcibly stop arbitrary caller code.

### Run the full controlled workflow

```bash
npm run build
BROWSERASSERT_EXECUTABLE='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' \
  node examples/workflow.mjs /tmp/browser-evidence-001
```

The example launches a controlled localhost app, performs a settings save, form submission, and download through Playwright, verifies each outcome, and saves redacted evidence. `startFixture` supports `normal`, `save-fails`, and `expired` modes through its URL query. The verification library attaches to an existing page and does not own the agent's actions.

```bash
node dist/cli.js run plan.json observations.json /tmp/recording-evidence-001
node dist/cli.js report result.json report.html
```

The recording CLI refuses authentication and reload contracts because recorded observations cannot establish live page state. Use the SDK for live browser plans.

Configuration shape: [JSON Schema](schemas/plan.schema.json). Runtime validation additionally enforces cross-field deadlines, duplicate IDs and supported operations. Generated `dist/index.d.ts` exposes the current SDK.

A deadline during a pending observation is `unknown`, even when earlier polls mismatched. A completed mismatching observation followed by expiration while waiting to poll is `failed`. Results returned after the absolute deadline cannot verify the contract. Custom adapters must honor cancellation to stop their own work.
