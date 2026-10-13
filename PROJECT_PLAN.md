# BrowserAssert project plan

Outcome verification for browser agents.

**Status:** Local 0.2.0 roadmap implementation delivered. See [feature matrix](FEATURE_MATRIX.md), [implementation status](IMPLEMENTATION_STATUS.md), and [actual interfaces](README.md). External pilots, live model quality and npm registry publication remain separate verification/release work. **Planning date:** 13 October 2026. Package names and interfaces below are illustrative and must be checked before npm registry publication.

## Goal and target users

Browser automation and agent developers who need evidence that a UI action actually achieved its goal.

A click can succeed while the intended setting change fails. BrowserAssert separates action execution from verification and returns verified, failed, or unknown with browser evidence.

## Product hypothesis and validation

Reusable postconditions and explicit uncertainty across browser-agent integrations. Compare against native browser-testing assertions before investing in a universal abstraction.

Before expanding the implementation, interview three to five target developers. Ask for a recent concrete failure, current workaround, and a repository or sanitized fixture they can share. A successful pilot means someone other than the author can install the tool, reproduce a useful finding, and explain why it belongs in their workflow. These are validation goals, not established demand.

## First release scope

A Playwright adapter and three contracts on controlled applications: successful form submission, settings persistence after reload, and completed file download. Capture selected DOM observations and artifacts with each verdict.

**Out of scope:** No autonomous browsing planner, arbitrary-site guarantee, visual-only universal assertions, anti-bot bypass, or verification of real purchases in v1.

## Representative workflow

Developer defines a settings postcondition → agent changes the setting → verifier observes the page → reloads only if the contract permits it → checks persisted value → captures evidence → returns a verdict.

## High level design

```text
Agent/automation -> Browser
SDK contract -> Verification coordinator -> Playwright adapter -> Browser observations
Observations -> Deterministic evaluator -> Evidence bundle -> Reporter
```

**Implementation stack:** TypeScript, Playwright adapter, JSON evidence manifests and local artifacts; CLI for saved contracts; React report viewer later.

**Architecture choice:** Direct Playwright assertions are sufficient for many tests. Choose an adapter library only to share evidence and unknown semantics across workflows. A full browser agent would duplicate execution capabilities and dilute the verification focus.

Keep the core as a local library with thin interface adapters. Process boundaries shown above are deliberate; do not split every module into a deployed service. A dashboard is a consumer of the core results, not the owner of domain rules.

## Low level design

| Component | Contract | Responsibility and state |
|---|---|---|
| `ContractValidator` | `validate(contract) -> VerificationPlan` | Checks allowed observations and bounded deadlines. |
| `VerificationCoordinator` | `verify(plan, session) -> VerificationResult` | Controls polling and step order; never plans unrelated actions. |
| `BrowserAdapter` | `observe(query) -> Observation` | Provides typed DOM, navigation, and download observations. |
| `PredicateEvaluator` | `evaluate(predicate, observations) -> Verdict` | Pure comparison and uncertainty rules. |
| `ArtifactStore` | `save(evidence) -> ArtifactRef` | Stores sanitized screenshots and manifests. |

### Data and state ownership

Contract(id, expectedState, observationPlan, timeoutMs); Observation(kind, timestamp, source, value); Result(verdict, reasons, evidenceRefs). Lifecycle: pending → observing → verified | failed | unknown | cancelled. Missing access or unsupported observation is unknown.

### Invariants

Each conclusion cites observations. Reload or navigation requires a declared verification step. Verification must not repeat the original write. Deadlines are finite. A visible success toast alone cannot satisfy a persistence contract.

### Failure and concurrency behavior

Retry observations within a deadline, not mutations. Distinguish stale DOM, detached pages, authentication loss, and failed predicates. Browser closure produces unknown unless decisive evidence already exists. Artifacts must not expose credentials or unrelated page content.

## SOLID decisions

- **Single responsibility:** ContractValidator owns input interpretation; ArtifactStore owns its separate output or integration concern. Domain evaluation does not move into CLI handlers.
- **Open closed:** introduce a new supported adapter behind an existing contract; add new domain behavior explicitly rather than adding hidden project-name switches.
- **Liskov substitution:** adapters must preserve documented result, error, cancellation, and completeness semantics. Run the same contract fixtures against every implementation; unsupported behavior must be explicit.
- **Interface segregation:** separate inspection from mutation and execution from reporting. Consumers receive only the operations they use.
- **Dependency inversion:** domain logic consumes typed contracts; the CLI or composition root wires concrete filesystem, transport, and provider implementations. Pure transformations stay functions instead of gaining unnecessary interfaces.

## LLM system design

No LLM required for v1. Later allow an optional vision evaluator for ambiguous UI evidence, keeping its judgment separate from deterministic predicates. Evaluate false acceptance on cases where UI feedback claims success but persisted state is unchanged.

When optional model calls are introduced, version prompts and output schemas, validate every response, bound tokens/time/cost, and store source references. Treat retrieved files and tool output as data. Keep model output out of authorization and deterministic pass/fail decisions. Document which content leaves the machine.

## Installation and integration design

The following command names are proposed interfaces for this future project; they are not claims that published packages exist. Reserve a package name, select a license, and publish only after the clean-install gate passes.

```text
browserassert run contracts/settings-persistence.json
browserassert report ./artifacts/latest
```

**Public SDK contract:**

```text
verify({ contract, browserAdapter, deadlineMs }): Promise<VerificationResult>
```

Provide one end-to-end example with pinned supported dependencies. Keep the CLI a wrapper over the public SDK. Document configuration discovery, schema version, error categories, supported platforms, and exit codes. For check-oriented commands, distinguish success, failed checks, and incomplete/infrastructure failure. MCP integrations should expose narrow tools and validate configured roots; a plugin packages instructions and connection configuration rather than duplicating the engine.

## Repository structure

```text
src/
  core/             # Domain types, state, and evaluation
  adapters/         # External protocols, analyzers, runners, or storage
  cli/              # User commands and composition
tests/
  unit/
  integration/
  fixtures/
examples/
docs/
  decisions/
  api/
```

Add a report UI or server directory only when that milestone begins. Keep runtime artifacts and any credential files out of version control. Do not create a shared framework spanning these seven independent projects.

## Implementation roadmap

| Phase | Working deliverable | Verification gate |
|---|---|---|
| 1. Build fixture app | Create settings, form, and download workflows with selectable failure modes. | Every outcome can be reproduced without an LLM. |
| 2. Define contracts | Specify observations, predicates, and verdict semantics. | Invalid contracts are rejected before browser access. |
| 3. Implement adapter | Read DOM state, observe downloads, perform declared reloads. | Controlled browser tests pass. |
| 4. Capture evidence | Add manifests, bounded polling, redaction, cancellation. | Failures have reproducible supporting evidence. |
| 5. Integrate browser agent | Wrap one existing automation workflow. | Verification does not depend on the agent framework. |
| 6. Publish developer package | Add CLI, examples, report output, contract documentation. | New user verifies three sample workflows. |

Proceed in order. Each phase should finish with a runnable example and its verification evidence. Size the next phase after measuring the current one; no fixed delivery date is assumed.

## Testing and evaluation

Controlled application cases: successful save, save failure with misleading toast, delayed persistence, stale read, reload failure, download interruption, and session expiration. Confirm the verifier never repeats a write.

Primary metric: false verification rate on seeded failure cases. Release gate: each controlled success/failure case has the expected verdict; missing evidence yields unknown. Report verification latency and artifact size.

Use unit tests for pure rules and integration tests at external boundaries. Maintain a held-out set for model-dependent behavior. Record run counts, versions, and incomplete cases. Do not call a system production-ready based only on seeded fixtures.

## Operations and release

- Start local-first. Log structured event IDs, durations, completeness, and errors without secrets; make detailed source capture explicit.
- Version configuration and stored artifact schemas. Validate compatibility before loading older artifacts; migrate a copy and retain the original.
- Pin supported integration versions in examples and test the documented minimum/current range before releases.
- Build distributable artifacts in CI and test installation in a clean environment. Publish release notes, a changelog, contribution instructions, and a security-reporting route.
- Roll back by pinning the previous package version. Keep baseline artifacts readable; do not overwrite them during a failed upgrade.
- A future hosted dashboard requires authentication, tenant isolation, retention/deletion controls, job quotas, and tested backups. Those are a separate release, not implicit MVP features.

## Learning outcomes

Build the deterministic core to practice data modeling and LLD. Trace the process and storage boundaries to practice HLD. Package the CLI/SDK to learn API stability and developer experience. Add model evaluation only where the product needs it. Use the optional report UI to learn full-stack integration around meaningful domain results.

## Open decisions and risks

Site-specific selectors and authentication limit portability. Browser reload can have side effects, so verification plans must make permitted actions explicit. Do not advertise a proof of backend persistence when only UI evidence is available.

Before implementation: confirm the first supported platform and dependency versions, choose a license compatible with reused code, check naming conflicts, and find pilot users. These are implementation inputs rather than reasons to expand the initial scope.

## Delivery checklist

- [ ] Product hypothesis tested with target developers
- [x] First vertical slice implemented
- [x] Local domain and integration verification gates passed
- [ ] Model-dependent behavior evaluated, if present
- [x] Clean-install example verified
- [x] Documentation and local package artifacts reviewed
- [ ] Release published
- [ ] Independent pilot completed

## Reference projects

These references are starting points for implementation-time review, not proof that the proposed differentiator is novel.

- [Browser Use reference](https://github.com/browser-use/browser-use)
