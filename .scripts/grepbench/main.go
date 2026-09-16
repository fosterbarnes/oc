package main

import (
	"context"
	"encoding/json"
	"flag"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"
)

func main() {
	repo := flag.String("repo", "", "OpenCode repo root")
	broot := flag.String("broot", "packages/core", "corpus B search root relative to repo")
	outDir := flag.String("out", "", "output directory")
	repeats := flag.Int("n", 3, "timed repeats after one warmup")
	strict := flag.Bool("strict", false, "exit 1 on synthetic mismatches vs rg")
	flag.Parse()

	if *repo == "" {
		wd, _ := os.Getwd()
		*repo = filepath.Clean(filepath.Join(wd, "..", ".."))
	}
	if *outDir == "" {
		*outDir = filepath.Join(*repo, ".scripts", "grepbench")
	}

	rg, _ := exec.LookPath("rg")
	engines := []Engine{}
	if rg != "" {
		engines = append(engines, Engine{Name: "rg-oc", Kind: "rg", Bin: rg})
	} else {
		fmt.Fprintln(os.Stderr, "rg not on PATH; cannot build gold")
		os.Exit(2)
	}
	addIf := func(name, kind, bin string, indexed, serve, noconfig bool) {
		if st, err := os.Stat(bin); err == nil && !st.IsDir() {
			engines = append(engines, Engine{Name: name, Kind: kind, Bin: bin, Indexed: indexed, Serve: serve, NoConfig: noconfig})
		}
	}
	addIf("ugrep", "ugrep", `C:\Users\user\Apps\ugrep.exe`, false, false, true)
	addIf("ug-noconfig", "ug", `C:\Users\user\Apps\ug.exe`, false, false, true)
	addIf("ug-config", "ug", `C:\Users\user\Apps\ug.exe`, false, false, false)
	addIf("ugrep-index", "ugrep", `C:\Users\user\Apps\ugrep.exe`, true, false, true)
	addIf("tgrep-noindex", "tgrep", `C:\Users\user\Apps\tgrep.exe`, false, false, true)
	// Indexed tgrep/serve are opt-in: full-tree index hung the first session.
	if os.Getenv("GREPBENCH_INDEX") == "1" {
		addIf("tgrep-index", "tgrep", `C:\Users\user\Apps\tgrep.exe`, true, false, true)
		addIf("tgrep-serve", "tgrep", `C:\Users\user\Apps\tgrep.exe`, true, true, true)
	}

	rep := Report{Notes: []string{
		"Gold is OpenCode ripgrep argv: --no-config --json --hidden --no-messages --glob=!**/.git/**",
		"Match set is (normalized path, line, text). Order ignored.",
		"ugrep JSON is array-of-files; tgrep --json is ripgrep NDJSON.",
		"Do not run ugrep-indexer on the live git worktree; synthetic A only.",
		"Corpus B is packages/core by default so tgrep index/serve finish in this session.",
	}}

	for _, e := range engines {
		ver := ""
		switch e.Kind {
		case "rg":
			ver, _ = probe(e.Bin, "--version")
		case "tgrep":
			ver, _ = probe(e.Bin, "--version")
		default:
			ver, _ = probe(e.Bin, "--version")
		}
		rep.Versions = append(rep.Versions, e.Name+": "+ver+" ("+e.Bin+")")
	}

	work, err := os.MkdirTemp("", "grepbench-*")
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
	defer os.RemoveAll(work)
	synth := filepath.Join(work, "A")
	if err := os.MkdirAll(synth, 0755); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
	if err := buildSynthetic(synth); err != nil {
		fmt.Fprintln(os.Stderr, "synthetic:", err)
		os.Exit(1)
	}

	indexer := `C:\Users\user\Apps\ugrep-indexer.exe`
	ugIndexBuilt := false
	if _, err := os.Stat(indexer); err == nil {
		t0 := time.Now()
		cmd := exec.Command(indexer, "-I", "-X", "-.", synth)
		cmd.Dir = synth
		out, err := cmd.CombinedOutput()
		row := IndexRow{Engine: "ugrep-index", Corpus: "A", BuildMS: float64(time.Since(t0).Microseconds()) / 1000, SizeB: ugrepIndexSize(synth)}
		if err != nil {
			row.Err = err.Error() + " " + strings.TrimSpace(string(out))
		} else {
			ugIndexBuilt = true
			touch := filepath.Join(synth, "src", "index.ts")
			os.WriteFile(touch, []byte("export function needle()\nexport const extra = 1\n"), 0644)
			t1 := time.Now()
			cmd = exec.Command(indexer, "-I", "-X", "-.", synth)
			cmd.Dir = synth
			cmd.Run()
			row.IncrMS = float64(time.Since(t1).Microseconds()) / 1000
		}
		rep.Indexes = append(rep.Indexes, row)
		defer exec.Command(indexer, "-d", synth).Run()
	}

	wantTgrepIndex := false
	for _, e := range engines {
		if e.Name == "tgrep-index" || e.Name == "tgrep-serve" {
			wantTgrepIndex = true
		}
	}

	tgrepIdx := filepath.Join(work, "tgrep-A")
	tgrepRepoIdx := filepath.Join(work, "tgrep-B")
	corpusB := filepath.Join(*repo, filepath.FromSlash(*broot))
	if st, err := os.Stat(corpusB); err != nil || !st.IsDir() {
		fmt.Fprintln(os.Stderr, "corpus B missing:", corpusB)
		os.Exit(1)
	}
	fmt.Fprintln(os.Stderr, "corpus B:", corpusB)

	if wantTgrepIndex {
		os.MkdirAll(tgrepIdx, 0755)
		t0 := time.Now()
		fmt.Fprintln(os.Stderr, "tgrep index corpus A...")
		ctxA, cancelA := context.WithTimeout(context.Background(), 60*time.Second)
		cmd := exec.CommandContext(ctxA, `C:\Users\user\Apps\tgrep.exe`, "index", synth, "--index-path", tgrepIdx, "--hidden", "--no-max-filesize")
		out, err := cmd.CombinedOutput()
		cancelA()
		row := IndexRow{Engine: "tgrep-index", Corpus: "A", BuildMS: float64(time.Since(t0).Microseconds()) / 1000, SizeB: dirSize(tgrepIdx)}
		if err != nil {
			row.Err = err.Error() + " " + strings.TrimSpace(string(out))
		}
		rep.Indexes = append(rep.Indexes, row)

		os.MkdirAll(tgrepRepoIdx, 0755)
		t0 = time.Now()
		fmt.Fprintln(os.Stderr, "tgrep index corpus B...")
		ctxB, cancelB := context.WithTimeout(context.Background(), 120*time.Second)
		cmd = exec.CommandContext(ctxB, `C:\Users\user\Apps\tgrep.exe`, "index", corpusB, "--index-path", tgrepRepoIdx, "--hidden", "--no-max-filesize")
		out, err = cmd.CombinedOutput()
		cancelB()
		row = IndexRow{Engine: "tgrep-index", Corpus: "B", BuildMS: float64(time.Since(t0).Microseconds()) / 1000, SizeB: dirSize(tgrepRepoIdx)}
		if err != nil {
			row.Err = err.Error() + " " + strings.TrimSpace(string(out))
		}
		rep.Indexes = append(rep.Indexes, row)
	} else {
		rep.Notes = append(rep.Notes, "tgrep index/serve skipped (set GREPBENCH_INDEX=1 to enable)")
	}

	var serveCmd *exec.Cmd
	if wantTgrepIndex {
		for _, e := range engines {
			if e.Name == "tgrep-serve" {
				fmt.Fprintln(os.Stderr, "starting tgrep serve on corpus B")
				serveCmd = exec.Command(e.Bin, "serve", corpusB, "--index-path", tgrepRepoIdx, "--no-watch", "--hidden", "--no-max-filesize")
				serveCmd.Stdout = nil
				serveCmd.Stderr = nil
				if err := serveCmd.Start(); err != nil {
					rep.Notes = append(rep.Notes, "tgrep serve failed: "+err.Error())
					serveCmd = nil
				} else {
					time.Sleep(1500 * time.Millisecond)
					defer func() {
						if serveCmd != nil && serveCmd.Process != nil {
							serveCmd.Process.Kill()
						}
					}()
				}
				break
			}
		}
	}

	queries := queryPack()
	gold := map[string][]Match{}
	goldEngine := engines[0]

	resolve := func(q Query) (cwd, search string, index string) {
		root := synth
		if q.Corpus == "B" {
			root = corpusB
		}
		cwd = root
		search = "."
		if q.RelPath != "" {
			search = q.RelPath
		}
		if q.File != "" {
			search = q.File
		}
		if q.Corpus == "A" {
			index = tgrepIdx
		} else {
			index = tgrepRepoIdx
		}
		return
	}

	runOne := func(e Engine, q Query) (matches []Match, po procOut) {
		cwd, search, idx := resolve(q)
		if e.Name == "ugrep-index" && q.Corpus == "B" {
			po.code = -2
			return nil, po
		}
		if e.Name == "ugrep-index" && !ugIndexBuilt {
			po.code = -2
			return nil, po
		}
		indexPath := ""
		if e.Kind == "tgrep" && (e.Indexed || e.Serve) {
			indexPath = idx
		}
		if e.Name == "tgrep-serve" && q.Corpus != "B" {
			po.code = -2
			return nil, po
		}
		po = runSearch(e, q, cwd, search, indexPath)
		limit := q.Limit
		if limit <= 0 {
			limit = 100000
		}
		matches = parseMatches(e, po.stdout, cwd, limit)
		return
	}

	for _, q := range queries {
		m, _ := runOne(goldEngine, q)
		gold[q.ID+"/"+q.Corpus] = m
	}

	for _, e := range engines {
		fmt.Fprintln(os.Stderr, "engine", e.Name)
		for _, q := range queries {
			n := *repeats
			if q.Corpus == "A" {
				n = *repeats + 2
			}
			var durs []time.Duration
			var last []Match
			var lastPo procOut
			for i := 0; i < n+1; i++ {
				m, po := runOne(e, q)
				if po.code == -2 {
					lastPo = po
					break
				}
				if i == 0 {
					last, lastPo = m, po
					continue
				}
				last, lastPo = m, po
				durs = append(durs, po.dur)
			}
			row := RunRow{
				Engine: e.Name, Query: q.ID, Corpus: q.Corpus,
				MatchCount: len(last), Exit: lastPo.code,
				StdoutB: len(lastPo.stdout), Allow: q.Allow,
				MedianMS: median(durs), MinMS: minDur(durs), P95MS: p95(durs),
			}
			if lastPo.code == -2 {
				row.Status = "skip"
				rep.Rows = append(rep.Rows, row)
				continue
			}
			if len(lastPo.stderr) > 0 && lastPo.code > 1 {
				row.Err = strings.TrimSpace(string(lastPo.stderr))
				if len(row.Err) > 240 {
					row.Err = row.Err[:240]
				}
			}
			g := gold[q.ID+"/"+q.Corpus]
			row.GoldCount = len(g)
			if q.TimeOnly || e.Name == goldEngine.Name {
				row.Status = "gold"
				if e.Name != goldEngine.Name {
					row.Status = "time"
				}
			} else {
				st, ex, miss, samples := compareSets(last, g)
				row.Status, row.Extra, row.Missing, row.Samples = st, ex, miss, samples
			}
			rep.Rows = append(rep.Rows, row)
		}
	}

	os.MkdirAll(*outDir, 0755)
	jb, _ := json.MarshalIndent(rep, "", "  ")
	jsonPath := filepath.Join(*outDir, "grepbench.json")
	mdPath := filepath.Join(*outDir, "grepbench-report.md")
	os.WriteFile(jsonPath, jb, 0644)
	os.WriteFile(mdPath, []byte(markdown(rep)), 0644)
	fmt.Println("wrote", jsonPath)
	fmt.Println("wrote", mdPath)

	if *strict {
		for _, r := range rep.Rows {
			if r.Corpus == "A" && r.Engine != "rg-oc" && r.Status == "mismatch" && r.Allow == "" {
				os.Exit(1)
			}
		}
	}
}

func markdown(rep Report) string {
	var b strings.Builder
	b.WriteString("# grepbench\n\n")
	b.WriteString("## Versions\n\n")
	for _, v := range rep.Versions {
		b.WriteString("- " + v + "\n")
	}
	b.WriteString("\n## Notes\n\n")
	for _, n := range rep.Notes {
		b.WriteString("- " + n + "\n")
	}
	b.WriteString("\n## Indexes\n\n| engine | corpus | build ms | size | incr ms | err |\n|---|---|---:|---:|---:|---|\n")
	for _, i := range rep.Indexes {
		fmt.Fprintf(&b, "| %s | %s | %.1f | %d | %.1f | %s |\n", i.Engine, i.Corpus, i.BuildMS, i.SizeB, i.IncrMS, truncateErr(i.Err))
	}
	b.WriteString("\n## Runs\n\n| engine | query | corpus | status | matches | gold | extra | missing | median ms | min ms |\n|---|---|---|---|---:|---:|---:|---:|---:|---:|\n")
	for _, r := range rep.Rows {
		fmt.Fprintf(&b, "| %s | %s | %s | %s | %d | %d | %d | %d | %.1f | %.1f |\n",
			r.Engine, r.Query, r.Corpus, r.Status, r.MatchCount, r.GoldCount, r.Extra, r.Missing, r.MedianMS, r.MinMS)
	}
	b.WriteString("\n## Diff samples\n\n")
	for _, r := range rep.Rows {
		if len(r.Samples) == 0 {
			continue
		}
		fmt.Fprintf(&b, "- **%s %s**: %s\n", r.Engine, r.Query, strings.Join(r.Samples, "; "))
		if r.Err != "" {
			fmt.Fprintf(&b, "  - err: %s\n", r.Err)
		}
	}
	return b.String()
}

func truncateErr(s string) string {
	s = strings.ReplaceAll(s, "\n", " ")
	if len(s) > 80 {
		return s[:80]
	}
	return s
}
