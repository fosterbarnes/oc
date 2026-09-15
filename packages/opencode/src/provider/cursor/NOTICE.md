# Cursor Provider Notices

The Cursor provider and protocol implementation in this directory are derived
from `oakimov/cursor-opencode-provider` version `0.6.7`.

The original MIT license and interoperability disclaimer are preserved in
`LICENSE` and `DISCLAIMER.md`. Protocol serialization uses the separately
licensed `protobufjs` package declared by the owning OpenCode package.

Retained local adaptations for the monorepo:

- Native model cache and discovery APIs (`readCache`, `writeCache`,
  `fetchModels`, `refreshModelCache`, `discoverModels`, `isCacheFresh`,
  `cacheFilePath`, and `MODEL_CACHE_*` constants) are preserved; upstream
  standalone cache/release infrastructure was not copied.
- Pricing coverage helper (`checkCursorPricingCoverage` / `hasCursorFastPricing`
  / `wireModelIdForPricing`) is adapted to the monorepo without adding a
  runtime dependency or copying standalone release scripts.
- No standalone `plugin/opencode2` code, new runtime dependencies, or
  release-infrastructure files were introduced; only applicable catalog and
  pricing behavior (Fast variant splitting, current model contexts/costs) was
  ported.
