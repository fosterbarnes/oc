# grepbench

Standalone Go harness comparing OpenCode's ripgrep grep argv against `ug`, `ugrep`, `ugrep-indexer`, and `tgrep`.

```
go run . -repo C:\Users\user\Documents\GitHub\oc -n 1
```

- Gold engine: `rg` on PATH (same flags as `packages/core/src/ripgrep.ts`).
- Corpus A: synthetic git repo (hidden, gitignore, `.git` skip, limit 100, huge line).
- Corpus B: `-broot` default `packages/core` (not the full monorepo).
- `GREPBENCH_INDEX=1` enables `tgrep index` / `tgrep serve` (a full-repo index has hung before; prefer the default `-broot`).
- Reports: `grepbench.json`, `grepbench-report.md` (gitignored).
