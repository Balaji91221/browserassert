# BrowserAssert feature completion matrix

| Plan feature | Implementation | Evidence |
|---|---|---|
| Controlled application | Normal, misleading save, expired session, form and download | `src/fixture.ts; examples/workflow.mjs` |
| Validated contracts and states | Predicates, authentication gate, shared deadlines, cancellation | `test/plan.test.mjs` |
| Browser adapter | Playwright observations and explicitly permitted reload | `test/browser.integration.test.mjs` |
| Download verification | Completion, artifact size and filename, failure/unknown outcomes | `test/plan.test.mjs` |
| Evidence and redaction | Exclusive bundles, hashes, masked screenshots, HTML report | `test/plan.test.mjs; examples/workflow.mjs` |
| Workflow integration and packaging | Reusable SDK, CLI, three-workflow example and CI | `README.md; package.json` |

## Release boundary

Local first-release code is implemented and real-browser workflows are verified with installed Chrome. Cross-site universality, remote file content semantics, autonomous planning, hosting, and visual-only model judgments are outside the release scope. User pilots and public package publication are not performed.

CI definitions, contribution/security guidance, and package-build instructions are included. A checked-in workflow is not evidence of a remote CI run.
