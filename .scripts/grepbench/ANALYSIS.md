# OpenCode grep alternatives - what actually won

Gold standard is **OpenCode's current grep**: `rg --no-config --json --hidden --no-messages --glob=!**/.git/**`, then stream-cap matches (v1 tool = 100). This run compared that to ugrep 7.8.4, `ug` with/without `--no-config`, ugrep `--index` (synthetic only), and **tgrep 1.0.8 unindexed**. Indexed tgrep/`serve` was **not** run (full-tree `tgrep index` hung the first session; set `GREPBENCH_INDEX=1` and `-broot packages/core` to try it).

Corpus **A** = tiny synthetic git repo (hidden `.opencode`, gitignored `node_modules`, `.git` needle, 101 limit files, 70KiB line). Corpus **B** = `packages/core` only, not the whole monorepo. Times are median after one warmup, **n=1** timed sample - treat as ranking, not a microbenchmark.

## Short ranking

| Job | Winner | Why |
| --- | --- | --- |
| Replace OpenCode `Ripgrep.Service.grep` with least adapter work | **tgrep** | Same `--json` NDJSON as rg; hidden + gitignore + huge-line skip matched gold |
| Fastest unindexed scan on this tiny/medium tree | **ugrep / `ug --no-config`** | ~15-27ms vs rg ~20-37ms vs tgrep ~23-49ms |
| OpenCode policy (hidden in, `.git` out, gitignore) | **tgrep = rg**; ugrep close | tgrep equal on q_hidden / q_ignore; ugrep equal on gitignore |
| Huge-line / 64KiB JSON skip (OC contract) | **rg and tgrep** | ugrep **keeps** the 70KiB line (extra match) |
| First-N truncation (limit 100 / 1000) | **none match each other** | Different walk order; set-compare of prefixes is misleading |
| Indexed search this session | **ugrep `--index` on A only** | 86ms build, 8ms incremental, ~42KB; **not faster than ugrep scan** on this tiny corpus |
| `ug` vs `ugrep` | **Tie if `--no-config`** | `ug-config` same results here (no hostile `.ugrep`); still unsafe as default |

**Do not swap rg for speed on `packages/core`.** Everything is tens of milliseconds. The interesting tgrep story is **indexed** search on a large tree, which this run did not measure.

## Contract / correctness (vs OpenCode rg)

### tgrep (unindexed) - best behavioral clone

Equal to gold on: literal `*.txt`, hidden `.opencode` vs `.git`, gitignore, single-file path, no-match, unicode preview, **and** the mixed.txt huge-line skip (rg/OC drop records >64KiB JSON).

Mismatches:

- **q_limit**: 100 vs 100 but different files (`extra f100`, `missing f000`). OpenCode takes the **first 100 stream events**, not "100 named files". tgrep walks in another order. Same class of false "mismatch" as ugrep.
- **q_glob** (`export` in `*.ts`, limit 1000): 1000 vs 1000, 484 extra/missing. Prefix of a huge result set, not proof of different engines.

Regex `Ripgrep.(grep|Service)` and `TODO|FIXME`: **equal (9 and 40)**. `--json` is the OpenCode parser's format.

### ugrep / ug - fast, not drop-in

Equal where it matters for **policy**: gitignore (`q_ignore` = 0), no-match, single-file, unicode, `q_regex`, `q_alt`.

Systematic extras:

- **Huge line**: always **+1** `mixed.txt:1`. OpenCode's 64KiB JSON skip is **rg-output-size** logic; ugrep JSON is a compact array, so the line survives. A swap would change grep tool output on giant lines unless you reimplement the skip.
- **q_lit / q_hidden supersets** are that same huge line leaking into `needle` searches.
- JSON is **not** ripgrep NDJSON. You would rewrite `Ripgrep.grep` parse (no `type: match` events, weaker submatch/offset story).
- Default dialect is **ERE**. This pack's regex happened to agree; `-P` is required for lookaround and **breaks `--index`**.

`ug` **without** `--no-config` matched `ug --no-config` on this machine. That only proves there was no interfering `.ugrep`. OpenCode should never call `ug.exe` without `--no-config` (or should call `ugrep.exe`).

### ugrep `--index`

Same match sets as unindexed ugrep on corpus A (same huge-line extra). **Skipped on corpus B** so we never write `._UG#_Store` into the live tree. Incremental rebuild after touching one file: **8ms**. On a corpus this small, indexed search was **not** faster than scan (~13-17ms both).

## Speed by scenario

All numbers median ms, one timed repeat. Lower is better. Gold times are process spawn + search of a tiny tree, so they are mostly **startup**.

### Synthetic (corpus A)

| Query | What it tests | rg | ugrep | ug --no-config | ugrep --index | tgrep scan |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| q_file | one file | **8** | 17 | 14 | 17 | 9 |
| q_none | no hits | 20 | **14** | 13 | 13 | 23 |
| q_ignore | gitignore | 19 | **15** | 14 | 14 | 24 |
| q_lit | 106 txt hits | 20 | **16** | 26 | 15 | 24 |
| q_hidden | hidden + not .git | 20 | **17** | 26 | 17 | 27 |
| q_limit | first 100 | 17 | 17 | 17 | **16** | 24 |
| q_unicode | long preview | 18 | 14 | **13** | 14 | 18 |
| q_huge | 70KiB line | 26 | 16 | 13 | 13 | 23 |

**Winners:** ugrep family on almost every multi-file scan. **tgrep ~= rg** on single-file (9 vs 8). ugrep-index does **not** beat ugrep scan here.

### `packages/core` (corpus B)

| Query | rg | ugrep | ug --no-config | tgrep scan |
| --- | ---: | ---: | ---: | ---: |
| q_regex (9 hits) | 28 | **21** | 26 | 46 |
| q_alt TODO\|FIXME (40) | 24 | **22** | 23 | 48 |
| q_none_repo | 22 | 22 | 23 | 47 |
| q_wide Ripgrep (32) | 24 | 33 | **22** | 46 |
| q_glob export limit 1000 | 37 | **22** | 21 | 49 |

**Winners:** ugrep/`ug` by a small margin (often 5-15ms). **tgrep unindexed is consistently slowest** (~2* rg): it is paying trigram-engine overhead **without** an index. That is expected; tgrep's pitch is `index`/`serve`, not `--no-index`.

## What "better" means for OpenCode

1. **Correctness for the grep tool** (hidden, gitignore, `.git` glob, JSON parse, huge-line skip, global limit): **tgrep** is the only alternative that already speaks rg JSON and matched the huge-line skip. Limit/order differences are harness artifacts unless you sort or compare unbounded sets.
2. **Latency on current repo-sized searches**: **ugrep** slightly beats rg; **unindexed tgrep loses**. Agents already cap at 100 matches; TTFM was not separately instrumented, but all engines finish the whole `packages/core` query in &lt;50ms.
3. **Index economics**: ugrep indexer is cheap on toy trees and **does not help** until the corpus is large enough that scan &gt; index probe. tgrep index is the one to measure next (`GREPBENCH_INDEX=1`), on `packages/core` first, never the full dirty worktree in the inner loop.

## Do not over-read

- n=1 timed sample; Windows spawn noise is several ms.
- `q_glob` / `q_limit` set-diff is **walk order + cap**, not recall.
- ugrep "faster" includes dumping a different JSON shape and keeping giant lines.
- PATH `rg` is **15.2.0**; OpenCode downloads **15.1.0** if PATH is empty - close enough for this comparison.
