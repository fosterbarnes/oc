// Pane entry for P1/P2: the CLI `--preload` flag emitted nothing under `bun run`, so the memory
// preload is imported explicitly before the unchanged source CLI.
import "./memoryPreload"
await import("../../src/index")
