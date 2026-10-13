# grepbench

Standalone Go harness comparing OpenCode's ripgrep grep argv against `ug`, `ugrep`, `ugrep-indexer`, and `tgrep`.

```
go run . -repo <path-to-oc-checkout> -n 1
```

- Tools are found on PATH: `ugrep`, `ug`, `tgrep`, `ugrep-indexer`. Override one with `GREPBENCH_UGREP`, `GREPBENCH_UG`, `GREPBENCH_TGREP`, or `GREPBENCH_UGREP_INDEXER` (full path to the exe).

- Gold engine: `rg` on PATH (same flags as `packages/core/src/ripgrep.ts`).
- Corpus A: synthetic git repo (hidden, gitignore, `.git` skip, limit 100, huge line).
- Corpus B: `-broot` default `packages/core` (not the full monorepo).
- `GREPBENCH_INDEX=1` enables `tgrep index` / `tgrep serve` (a full-repo index has hung before; prefer the default `-broot`).
- Reports: `grepbench.json`, `grepbench-report.md` (gitignored).
