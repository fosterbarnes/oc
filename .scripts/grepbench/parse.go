package main

import (
	"bufio"
	"bytes"
	"encoding/json"
	"strconv"
	"strings"
	"unicode/utf8"
)

const maxRecordBytes = 64 * 1024
const maxPreview = 2000

func normalizePath(p string, cwd string) string {
	p = strings.ReplaceAll(p, "\\", "/")
	cwd = strings.ReplaceAll(cwd, "\\", "/")
	p = strings.TrimPrefix(p, cwd)
	p = strings.TrimPrefix(p, "/")
	p = strings.TrimPrefix(p, "./")
	return p
}

func truncatePreview(s string) string {
	s = strings.TrimSuffix(s, "\r")
	if len(s) <= maxPreview {
		return s
	}
	cut := s[:maxPreview]
	if r, _ := utf8.DecodeLastRuneInString(cut); r == utf8.RuneError {
		cut = strings.TrimRight(cut, string(rune(0xFFFD)))
		if len(cut) > 0 {
			last := cut[len(cut)-1]
			if last >= 0xD8 && last <= 0xDB { // not valid in utf8 bytes this way
			}
		}
		// drop dangling high surrogate at end if present as utf-16 in go string
		rs := []rune(cut)
		if len(rs) > 0 {
			last := rs[len(rs)-1]
			if last >= 0xD800 && last <= 0xDBFF {
				cut = string(rs[:len(rs)-1])
			}
		}
	}
	return cut + "..."
}

type rgLine struct {
	Type string `json:"type"`
	Data struct {
		Path struct {
			Text string `json:"text"`
		} `json:"path"`
		Lines struct {
			Text string `json:"text"`
		} `json:"lines"`
		LineNumber int `json:"line_number"`
	} `json:"data"`
}

func parseRipgrepJSON(stdout []byte, cwd string, limit int) []Match {
	var out []Match
	sc := bufio.NewScanner(bytes.NewReader(stdout))
	buf := make([]byte, 0, 64*1024)
	sc.Buffer(buf, 4*1024*1024)
	for sc.Scan() {
		line := sc.Text()
		if len(line) == 0 {
			continue
		}
		if len(line) > maxRecordBytes {
			continue
		}
		var rec rgLine
		if err := json.Unmarshal([]byte(line), &rec); err != nil {
			continue
		}
		if rec.Type != "match" {
			continue
		}
		out = append(out, Match{
			Path: normalizePath(rec.Data.Path.Text, cwd),
			Line: rec.Data.LineNumber,
			Text: truncatePreview(strings.TrimRight(rec.Data.Lines.Text, "\n")),
		})
		if limit > 0 && len(out) >= limit {
			break
		}
	}
	return out
}

type ugFile struct {
	File    string `json:"file"`
	Matches []struct {
		Line   int    `json:"line"`
		Offset int    `json:"offset"`
		Match  string `json:"match"`
	} `json:"matches"`
}

func parseUgrepJSON(stdout []byte, cwd string, limit int) []Match {
	stdout = bytes.TrimSpace(stdout)
	if len(stdout) == 0 {
		return nil
	}
	var files []ugFile
	if err := json.Unmarshal(stdout, &files); err != nil {
		// sometimes pretty printed already handled; try single object
		var one ugFile
		if err2 := json.Unmarshal(stdout, &one); err2 == nil {
			files = []ugFile{one}
		} else {
			return nil
		}
	}
	var out []Match
	for _, f := range files {
		p := normalizePath(f.File, cwd)
		for _, m := range f.Matches {
			out = append(out, Match{
				Path: p,
				Line: m.Line,
				Text: truncatePreview(strings.TrimRight(m.Match, "\n")),
			})
			if limit > 0 && len(out) >= limit {
				return out
			}
		}
	}
	return out
}

func key(m Match) string {
	return m.Path + "\x00" + strconv.Itoa(m.Line) + "\x00" + m.Text
}
