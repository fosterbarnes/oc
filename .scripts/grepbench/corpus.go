package main

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
)

func buildSynthetic(root string) error {
	must := func(err error) error { return err }
	dirs := []string{
		filepath.Join(root, "src"),
		filepath.Join(root, "node_modules", "pkg"),
		filepath.Join(root, ".opencode"),
		filepath.Join(root, "limit"),
		filepath.Join(root, "single"),
	}
	for _, d := range dirs {
		if err := os.MkdirAll(d, 0755); err != nil {
			return err
		}
	}
	writes := map[string]string{
		filepath.Join(root, ".gitignore"):                      "node_modules/\n",
		filepath.Join(root, "src", "index.ts"):                 "export function needle()\n",
		filepath.Join(root, "src", "notes.txt"):                "needle in notes\n",
		filepath.Join(root, "node_modules", "pkg", "index.js"): "ignored needle\n",
		filepath.Join(root, ".opencode", "config"):             "needle\n",
		filepath.Join(root, "single", "a.txt"):                 "line1\nline2 needle\n",
		filepath.Join(root, "single", "b.txt"):                 "sibling needle\n",
		filepath.Join(root, "unicode.txt"):                     "needle" + strings.Repeat("x", 1993) + "😀\n",
		filepath.Join(root, "mixed.txt"):                       "needle-huge " + strings.Repeat("x", 70*1024) + "\nneedle-small\n",
	}
	for p, c := range writes {
		if err := os.WriteFile(p, []byte(c), 0644); err != nil {
			return must(err)
		}
	}
	for i := 0; i < 101; i++ {
		p := filepath.Join(root, "limit", fmt.Sprintf("f%03d.txt", i))
		if err := os.WriteFile(p, []byte(fmt.Sprintf("needle file %d\n", i)), 0644); err != nil {
			return err
		}
	}
	git := exec.Command("git", "init", "-q", root)
	git.Env = append(os.Environ(), "GIT_CONFIG_NOSYSTEM=1")
	if out, err := git.CombinedOutput(); err != nil {
		return fmt.Errorf("git init: %v: %s", err, out)
	}
	gitDir := filepath.Join(root, ".git")
	if err := os.MkdirAll(gitDir, 0755); err != nil {
		return err
	}
	return os.WriteFile(filepath.Join(gitDir, "config"), []byte("needle from git\n"), 0644)
}

func queryPack() []Query {
	return []Query{
		{ID: "q_lit", Pattern: "needle", Include: "*.txt", Corpus: "A", Limit: 1000},
		{ID: "q_hidden", Pattern: "needle", Corpus: "A", Limit: 1000, Allow: "must include .opencode, exclude .git"},
		{ID: "q_ignore", Pattern: "ignored", Corpus: "A", Limit: 1000},
		{ID: "q_file", Pattern: "line2", File: filepath.Join("single", "a.txt"), Corpus: "A", Limit: 10},
		{ID: "q_limit", Pattern: "needle", Include: "*.txt", RelPath: "limit", Corpus: "A", Limit: 100},
		{ID: "q_none", Pattern: "xyznonexistentpatternxyz123", Corpus: "A", Limit: 10},
		{ID: "q_unicode", Pattern: "needle", Include: "unicode.txt", Corpus: "A", Limit: 10, Allow: "preview truncation"},
		{ID: "q_huge", Pattern: "needle", Include: "mixed.txt", Corpus: "A", Limit: 10, Allow: "64KiB JSON skip is OC/rg specific"},
		{ID: "q_glob", Pattern: "export", Include: "*.ts", RelPath: "src", Corpus: "B", Limit: 1000},
		{ID: "q_regex", Pattern: `Ripgrep\.(grep|Service)`, Include: "*.ts", Corpus: "B", Limit: 1000, Allow: "ugrep default ERE vs rust regex"},
		{ID: "q_alt", Pattern: `TODO|FIXME`, Include: "*.ts", Corpus: "B", Limit: 1000},
		{ID: "q_none_repo", Pattern: "xyznonexistentpatternxyz123", Corpus: "B", Limit: 10},
		{ID: "q_wide", Pattern: "Ripgrep", Include: "*.ts", Corpus: "B", Limit: 100, TimeOnly: true, Allow: "count/time only"},
	}
}
