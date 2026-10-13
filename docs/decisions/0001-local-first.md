# Local first implementation

The initial BrowserAssert implementation keeps its domain behavior in a typed library and composes CLI/adapters around it. Tests use controlled fixtures. A hosted UI and model-assisted features are deferred until the core contracts are demonstrated.

Implemented: typed adapter contract, bounded observation polling, explicit reload permission, deterministic scalar predicates, Playwright page adapter, download verifier, recording CLI and evidence results. Verified with installed Chrome: persisted/unsaved settings, form output and completed download. Generic adapter and timeout tests also pass. Not yet implemented: screenshot artifacts, richer declarative contracts, authentication awareness, remote download content inspection, or a visual report UI. The wrapper bounds result latency; an adapter that ignores AbortSignal may continue its own operation. The Playwright reload additionally has a five-second operation timeout.
