package main

import (
	"bytes"
	"context"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"sort"
	"strings"
	"time"
)

func probe(bin string, args ...string) (string, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 8*time.Second)
	defer cancel()
	cmd := exec.CommandContext(ctx, bin, args...)
	out, err := cmd.CombinedOutput()
	s := strings.TrimSpace(string(out))
	if s == "" && err != nil {
		return "", err
	}
	if i := strings.IndexByte(s, '\n'); i > 0 {
		s = s[:i]
	}
	return s, nil
}

func searchArgs(e Engine, q Query, cwd, searchPath, indexPath string) []string {
	switch e.Kind {
	case "rg":
		args := []string{"--no-config", "--json", "--hidden", "--no-messages"}
		if q.Include != "" {
			args = append(args, "--glob="+q.Include)
		}
		args = append(args, "--glob=!**/.git/**", "--", q.Pattern, searchPath)
		return args
	case "ugrep":
		args := []string{"--no-config", "-r", "--json", "-n", "-H", "-b", "--hidden", "--ignore-files", "-g", "^**/.git/**"}
		if q.Include != "" {
			args = append(args, "-g", q.Include)
		}
		if e.Indexed {
			args = append(args, "--index")
		}
		args = append(args, "-e", q.Pattern, searchPath)
		return args
	case "ug":
		args := []string{"-r", "--json", "-n", "-H", "-b", "--hidden", "--ignore-files", "-g", "^**/.git/**"}
		if e.NoConfig {
			args = append([]string{"--no-config"}, args...)
		}
		if q.Include != "" {
			args = append(args, "-g", q.Include)
		}
		args = append(args, "-e", q.Pattern, searchPath)
		return args
	case "tgrep":
		args := []string{"--json", "--hidden", "--no-messages", "--no-max-filesize", "--color", "never"}
		if q.Include != "" {
			args = append(args, "--glob", q.Include)
		}
		args = append(args, "--glob", "!**/.git/**")
		if !e.Indexed && !e.Serve {
			args = append(args, "--no-index")
		}
		if indexPath != "" {
			args = append(args, "--index-path", indexPath)
		}
		args = append(args, "--", q.Pattern, searchPath)
		return args
	default:
		return nil
	}
}

type procOut struct {
	stdout []byte
	stderr []byte
	code   int
	dur    time.Duration
	ttfm   time.Duration
}

func runSearch(e Engine, q Query, cwd, searchPath, indexPath string) procOut {
	args := searchArgs(e, q, cwd, searchPath, indexPath)
	ctx, cancel := context.WithTimeout(context.Background(), 90*time.Second)
	defer cancel()
	cmd := exec.CommandContext(ctx, e.Bin, args...)
	cmd.Dir = cwd
	var stdout, stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr
	start := time.Now()
	err := cmd.Run()
	dur := time.Since(start)
	code := 0
	if err != nil {
		if ee, ok := err.(*exec.ExitError); ok {
			code = ee.ExitCode()
		} else {
			code = -1
		}
	}
	return procOut{stdout: stdout.Bytes(), stderr: stderr.Bytes(), code: code, dur: dur}
}

func parseMatches(e Engine, stdout []byte, cwd string, limit int) []Match {
	switch e.Kind {
	case "rg", "tgrep":
		return parseRipgrepJSON(stdout, cwd, limit)
	case "ugrep", "ug":
		return parseUgrepJSON(stdout, cwd, limit)
	default:
		return nil
	}
}

func compareSets(got, gold []Match) (status string, extra, missing int, samples []string) {
	gm := map[string]Match{}
	om := map[string]Match{}
	for _, m := range gold {
		om[key(m)] = m
	}
	for _, m := range got {
		gm[key(m)] = m
	}
	for k, m := range gm {
		if _, ok := om[k]; !ok {
			extra++
			if len(samples) < 3 {
				samples = append(samples, "extra "+m.Path+":"+fmt.Sprint(m.Line))
			}
		}
	}
	for k, m := range om {
		if _, ok := gm[k]; !ok {
			missing++
			if len(samples) < 6 {
				samples = append(samples, "missing "+m.Path+":"+fmt.Sprint(m.Line))
			}
		}
	}
	switch {
	case extra == 0 && missing == 0:
		status = "equal"
	case extra == 0 && missing > 0:
		status = "subset"
	case extra > 0 && missing == 0:
		status = "superset"
	default:
		status = "mismatch"
	}
	return
}

func median(ds []time.Duration) float64 {
	if len(ds) == 0 {
		return 0
	}
	c := append([]time.Duration(nil), ds...)
	sort.Slice(c, func(i, j int) bool { return c[i] < c[j] })
	n := len(c)
	if n%2 == 1 {
		return float64(c[n/2].Microseconds()) / 1000
	}
	return float64((c[n/2-1] + c[n/2]).Microseconds()) / 2000
}

func minDur(ds []time.Duration) float64 {
	if len(ds) == 0 {
		return 0
	}
	m := ds[0]
	for _, d := range ds[1:] {
		if d < m {
			m = d
		}
	}
	return float64(m.Microseconds()) / 1000
}

func p95(ds []time.Duration) float64 {
	if len(ds) == 0 {
		return 0
	}
	c := append([]time.Duration(nil), ds...)
	sort.Slice(c, func(i, j int) bool { return c[i] < c[j] })
	i := int(float64(len(c)-1) * 0.95)
	return float64(c[i].Microseconds()) / 1000
}

func dirSize(root string) int64 {
	var n int64
	filepath.Walk(root, func(path string, info os.FileInfo, err error) error {
		if err == nil && !info.IsDir() {
			n += info.Size()
		}
		return nil
	})
	return n
}

func ugrepIndexSize(root string) int64 {
	var n int64
	filepath.Walk(root, func(path string, info os.FileInfo, err error) error {
		if err == nil && strings.Contains(info.Name(), "._UG") {
			n += info.Size()
		}
		return nil
	})
	return n
}

func copyDir(src, dst string) error {
	return filepath.Walk(src, func(path string, info os.FileInfo, err error) error {
		if err != nil {
			return err
		}
		rel, err := filepath.Rel(src, path)
		if err != nil {
			return err
		}
		if rel == ".git" || strings.HasPrefix(rel, ".git"+string(os.PathSeparator)) {
			if info.IsDir() {
				return filepath.SkipDir
			}
			return nil
		}
		if rel == "node_modules" || strings.HasPrefix(rel, "node_modules"+string(os.PathSeparator)) {
			if info.IsDir() {
				return filepath.SkipDir
			}
			return nil
		}
		if rel == "UPSTREAM" || strings.HasPrefix(rel, "UPSTREAM"+string(os.PathSeparator)) {
			if info.IsDir() {
				return filepath.SkipDir
			}
			return nil
		}
		target := filepath.Join(dst, rel)
		if info.IsDir() {
			return os.MkdirAll(target, 0755)
		}
		if !info.Mode().IsRegular() {
			return nil
		}
		if err := os.MkdirAll(filepath.Dir(target), 0755); err != nil {
			return err
		}
		in, err := os.Open(path)
		if err != nil {
			return err
		}
		defer in.Close()
		out, err := os.Create(target)
		if err != nil {
			return err
		}
		defer out.Close()
		_, err = io.Copy(out, in)
		return err
	})
}
