package main

import "time"

type Match struct {
	Path string
	Line int
	Text string
}

type Query struct {
	ID       string
	Pattern  string
	Include  string
	RelPath  string // relative to corpus root; empty means root
	File     string // single-file search relative path
	Limit    int
	Corpus   string // "A" synthetic, "B" repo
	TimeOnly bool
	Allow    string // known-diff note
}

type Engine struct {
	Name     string
	Kind     string // rg, ugrep, tgrep
	Bin      string
	Indexed  bool
	Serve    bool
	NoConfig bool
}

type RunRow struct {
	Engine     string   `json:"engine"`
	Query      string   `json:"query"`
	Corpus     string   `json:"corpus"`
	MatchCount int      `json:"matchCount"`
	GoldCount  int      `json:"goldCount"`
	Status     string   `json:"status"`
	Extra      int      `json:"extra"`
	Missing    int      `json:"missing"`
	Samples    []string `json:"samples,omitempty"`
	MedianMS   float64  `json:"medianMs"`
	MinMS      float64  `json:"minMs"`
	P95MS      float64  `json:"p95Ms"`
	TTFMMS     float64  `json:"ttfmMs,omitempty"`
	Exit       int      `json:"exit"`
	Err        string   `json:"err,omitempty"`
	Allow      string   `json:"allow,omitempty"`
	StdoutB    int      `json:"stdoutBytes"`
}

type IndexRow struct {
	Engine   string        `json:"engine"`
	Corpus   string        `json:"corpus"`
	BuildMS  float64       `json:"buildMs"`
	SizeB    int64         `json:"sizeBytes"`
	IncrMS   float64       `json:"incrementalMs,omitempty"`
	Duration time.Duration `json:"-"`
	Err      string        `json:"err,omitempty"`
}

type Report struct {
	Versions []string   `json:"versions"`
	Queries  []Query    `json:"-"`
	Rows     []RunRow   `json:"rows"`
	Indexes  []IndexRow `json:"indexes"`
	Notes    []string   `json:"notes"`
}
