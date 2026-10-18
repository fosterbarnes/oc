// @ts-nocheck
// WIP: ported from opencode-claude-code-plugin, which never typechecked its tests; type them as Phase 3 rewrites land.
/**
 * Unit tests for the logger module:
 *   - level threshold (debug < info < notice < warn < error)
 *   - mode policy (silent vs debug) for stderr, and the opencode.log mirror
 *   - env-var precedence over config
 *   - boolean / level parsing edge cases
 *
 * File-write side effects are exercised by pointing `dir` at a temp dir and
 * inspecting the file after each test. `readLog()` flushes the write queue
 * first; `readLog(false)` shows only what already reached the file.
 */
import { test } from "node:test"
import assert from "node:assert/strict"
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import {
  _resetLoggerForTests,
  configureLogger,
  flushLogger,
  getLoggerConfig,
  log,
} from "@/provider/claude-code/logger.js"
import { setOpencodeClient } from "@/provider/claude-code/runtimeStatus.js"
import { createOpencodeClient } from "@opencode-ai/sdk"
import { Global } from "@opencode-ai/core/global"

function captureStderr(): { lines: string[]; restore: () => void } {
  const lines: string[] = []
  const original = console.error
  console.error = (line: string) => {
    lines.push(line)
  }
  return {
    lines,
    restore: () => {
      console.error = original
    },
  }
}

function withTempDir(): { dir: string; cleanup: () => void; readLog: (flush?: boolean) => string } {
  const dir = mkdtempSync(join(tmpdir(), "opencode-cc-logtest-"))
  return {
    dir,
    readLog(flush = true) {
      if (flush) flushLogger()
      const f = join(dir, "plugin.log")
      return existsSync(f) ? readFileSync(f, "utf8") : ""
    },
    cleanup() {
      rmSync(dir, { recursive: true, force: true, maxRetries: 20, retryDelay: 50 })
    },
  }
}

function clearEnv(): void {
  delete process.env.OPENCODE_CLAUDE_CODE_LOG_FILE
  delete process.env.OPENCODE_CLAUDE_CODE_LOG_DIR
  delete process.env.OPENCODE_CLAUDE_CODE_LOG_LEVEL
  delete process.env.DEBUG
}

test("default config: file=false, mode=silent, level=info", () => {
  clearEnv()
  _resetLoggerForTests()
  const c = getLoggerConfig()
  assert.equal(c.file, false)
  assert.equal(c.mode, "silent")
  assert.equal(c.level, "info")
  assert.equal(c.dir, null)
})

test("level threshold: debug dropped at level=info", () => {
  clearEnv()
  const tmp = withTempDir()
  try {
    configureLogger({ file: true, dir: tmp.dir, level: "info", mode: "silent" })
    log.debug("dropped-debug")
    log.info("kept-info")
    const out = tmp.readLog()
    assert.ok(!out.includes("dropped-debug"))
    assert.ok(out.includes("kept-info"))
  } finally {
    tmp.cleanup()
    _resetLoggerForTests()
  }
})

test("debug lines queue and reach the file on the 100 ms flush", async () => {
  clearEnv()
  const tmp = withTempDir()
  try {
    configureLogger({ file: true, dir: tmp.dir, level: "debug", mode: "silent" })
    log.debug("queued-1")
    log.debug("queued-2")
    assert.equal(tmp.readLog(false), "", "debug lines wait for the batch")
    await new Promise((resolve) => setTimeout(resolve, 250))
    const out = tmp.readLog(false)
    assert.ok(out.indexOf("queued-1") !== -1 && out.indexOf("queued-1") < out.indexOf("queued-2"))
  } finally {
    tmp.cleanup()
    _resetLoggerForTests()
  }
})

test("warn flushes at once, with the queued lines before it in order", () => {
  clearEnv()
  const tmp = withTempDir()
  const stderr = captureStderr()
  try {
    configureLogger({ file: true, dir: tmp.dir, level: "debug", mode: "silent" })
    log.debug("before-warn")
    log.warn("the-warn")
    const out = tmp.readLog(false)
    assert.ok(out.indexOf("before-warn") !== -1 && out.indexOf("before-warn") < out.indexOf("the-warn"))
  } finally {
    stderr.restore()
    tmp.cleanup()
    _resetLoggerForTests()
  }
})

test("configureLogger flushes queued lines to the old file", () => {
  clearEnv()
  const first = withTempDir()
  const second = withTempDir()
  try {
    configureLogger({ file: true, dir: first.dir, level: "debug", mode: "silent" })
    log.debug("old-file-line")
    configureLogger({ file: true, dir: second.dir, level: "debug", mode: "silent" })
    log.debug("new-file-line")
    assert.ok(first.readLog(false).includes("old-file-line"))
    assert.ok(!second.readLog().includes("old-file-line"))
    assert.ok(second.readLog().includes("new-file-line"))
  } finally {
    first.cleanup()
    second.cleanup()
    _resetLoggerForTests()
  }
})

test("rotation: tracked size past 5 MB moves the file to plugin.log.1", () => {
  clearEnv()
  const tmp = withTempDir()
  try {
    // Just under the limit: the first flush reads the size and stays in this file.
    writeFileSync(join(tmp.dir, "plugin.log"), "x".repeat(5 * 1024 * 1024 - 10))
    configureLogger({ file: true, dir: tmp.dir, level: "debug", mode: "silent" })
    log.debug("crosses-limit")
    assert.ok(tmp.readLog().endsWith("crosses-limit\n"))
    // The tracked size is now past the limit, so the next flush rotates first.
    log.debug("after-rotate")
    assert.ok(tmp.readLog().includes("after-rotate"))
    assert.ok(!tmp.readLog().includes("crosses-limit"))
    assert.ok(readFileSync(join(tmp.dir, "plugin.log.1"), "utf8").endsWith("crosses-limit\n"))
  } finally {
    tmp.cleanup()
    _resetLoggerForTests()
  }
})

test("level=error drops warn entirely", () => {
  clearEnv()
  const tmp = withTempDir()
  try {
    configureLogger({ file: true, dir: tmp.dir, level: "error", mode: "silent" })
    log.warn("dropped-warn")
    log.error("kept-error")
    const out = tmp.readLog()
    assert.ok(!out.includes("dropped-warn"), "warn should not reach file")
    assert.ok(out.includes("kept-error"), "error should reach file")
  } finally {
    tmp.cleanup()
    _resetLoggerForTests()
  }
})

// In the TUI the server worker's stderr is the terminal: a raw line paints over the frame.
test("mode=silent: nothing reaches stderr", () => {
  clearEnv()
  const tmp = withTempDir()
  const stderr = captureStderr()
  try {
    configureLogger({ file: true, dir: tmp.dir, level: "debug", mode: "silent" })
    log.info("silent-info")
    log.notice("silent-notice")
    log.warn("silent-warn")
    log.error("silent-error")
    assert.deepEqual(stderr.lines, [])
  } finally {
    stderr.restore()
    tmp.cleanup()
    _resetLoggerForTests()
  }
})

test("mode=debug: all emitted levels reach TUI", () => {
  clearEnv()
  const tmp = withTempDir()
  const stderr = captureStderr()
  try {
    configureLogger({ file: true, dir: tmp.dir, level: "debug", mode: "debug" })
    log.debug("loud-debug")
    log.info("loud-info")
    log.notice("loud-notice")
    log.warn("loud-warn")
    log.error("loud-error")
    const tui = stderr.lines.join("\n")
    assert.ok(tui.includes("loud-debug"))
    assert.ok(tui.includes("loud-info"))
    assert.ok(tui.includes("loud-notice"))
    assert.ok(tui.includes("loud-warn"))
    assert.ok(tui.includes("loud-error"))
  } finally {
    stderr.restore()
    tmp.cleanup()
    _resetLoggerForTests()
  }
})

test("file=false: no plugin.log is written", () => {
  clearEnv()
  _resetLoggerForTests()
  const tmp = withTempDir()
  try {
    configureLogger({ file: false, dir: tmp.dir, level: "debug", mode: "silent" })
    log.info("no-file-info")
    log.warn("no-file-warn")
    assert.equal(tmp.readLog(), "", "no file should be written")
  } finally {
    tmp.cleanup()
    _resetLoggerForTests()
  }
})

// Internal warnings are log records, never toasts, whatever the provider.
// The real SDK client, as the plugin receives it: its `showToast` reads `this`.
test("mode=silent with a TUI client: warn/error never toast", async () => {
  clearEnv()
  _resetLoggerForTests()
  const requests: Request[] = []
  setOpencodeClient(
    createOpencodeClient({
      baseUrl: "http://toast.invalid",
      fetch: async (request) => {
        requests.push(request)
        return Response.json(true)
      },
    }),
  )
  try {
    configureLogger({ file: false, level: "info", mode: "silent" })
    log.warn("quiet-warn")
    log.error("quiet-error")
    await new Promise((resolve) => setTimeout(resolve, 50))
    assert.deepEqual(requests, [])
  } finally {
    setOpencodeClient({})
    _resetLoggerForTests()
  }
})

// The preload points XDG_DATA_HOME at a temp dir, so this is the test's own opencode.log.
test("warn/error reach opencode.log on the claude-code channel; info does not", async () => {
  clearEnv()
  _resetLoggerForTests()
  const file = join(Global.Path.log, "opencode.log")
  const marker = `main-log-${Date.now()}`
  configureLogger({ file: false, level: "info", mode: "silent" })
  log.info(`${marker}-info`)
  log.warn(`${marker}-warn`, { detail: 1 })
  log.error(`${marker}-error`)
  const read = () => (existsSync(file) ? readFileSync(file, "utf8") : "")
  // The file sink writes in batches; wait for both lines rather than a fixed delay.
  for (let waited = 0; waited < 5000 && !read().includes(`${marker}-error`); waited += 50) {
    await new Promise((resolve) => setTimeout(resolve, 50))
  }
  const lines = read()
    .split("\n")
    .filter((line) => line.includes(marker))
  assert.equal(lines.length, 2, lines.join("\n"))
  assert.match(lines[0]!, /level=WARN .*channel=claude-code/)
  assert.match(lines[1]!, /level=ERROR .*channel=claude-code/)
  _resetLoggerForTests()
})

test("env var OPENCODE_CLAUDE_CODE_LOG_FILE overrides config", () => {
  clearEnv()
  process.env.OPENCODE_CLAUDE_CODE_LOG_FILE = "0"
  const tmp = withTempDir()
  try {
    configureLogger({ file: true, dir: tmp.dir, level: "info" })
    log.info("attempted")
    assert.equal(tmp.readLog(), "", "env explicit-off should win over config:true")
  } finally {
    delete process.env.OPENCODE_CLAUDE_CODE_LOG_FILE
    tmp.cleanup()
    _resetLoggerForTests()
  }
})

test("env var OPENCODE_CLAUDE_CODE_LOG_LEVEL overrides config", () => {
  clearEnv()
  process.env.OPENCODE_CLAUDE_CODE_LOG_LEVEL = "warn"
  const tmp = withTempDir()
  try {
    configureLogger({ file: true, dir: tmp.dir, level: "info" })
    log.info("dropped-by-env")
    log.warn("kept-by-env")
    const out = tmp.readLog()
    assert.ok(!out.includes("dropped-by-env"))
    assert.ok(out.includes("kept-by-env"))
  } finally {
    delete process.env.OPENCODE_CLAUDE_CODE_LOG_LEVEL
    tmp.cleanup()
    _resetLoggerForTests()
  }
})

test("env var DEBUG=opencode-claude-code sets mode=debug", () => {
  clearEnv()
  process.env.DEBUG = "opencode-claude-code"
  const stderr = captureStderr()
  const tmp = withTempDir()
  try {
    configureLogger({ file: true, dir: tmp.dir, level: "debug", mode: "silent" })
    log.info("piped-to-tui")
    const tui = stderr.lines.join("\n")
    assert.ok(tui.includes("piped-to-tui"), "DEBUG env should promote mode to debug")
  } finally {
    stderr.restore()
    delete process.env.DEBUG
    tmp.cleanup()
    _resetLoggerForTests()
  }
})

test("env var OPENCODE_CLAUDE_CODE_LOG_DIR overrides config dir", () => {
  clearEnv()
  const tmpEnv = withTempDir()
  const tmpCfg = withTempDir()
  process.env.OPENCODE_CLAUDE_CODE_LOG_DIR = tmpEnv.dir
  try {
    configureLogger({ file: true, dir: tmpCfg.dir, level: "info" })
    log.info("env-wins")
    assert.ok(tmpEnv.readLog().includes("env-wins"), "env dir should receive the log")
    assert.equal(tmpCfg.readLog(), "", "config dir should be ignored")
  } finally {
    delete process.env.OPENCODE_CLAUDE_CODE_LOG_DIR
    tmpEnv.cleanup()
    tmpCfg.cleanup()
    _resetLoggerForTests()
  }
})

test("boolean env parsing: 1/true/on/yes → on; 0/false/no/off → off; '' → unset", () => {
  clearEnv()
  const cases: Array<[string, boolean]> = [
    ["1", true],
    ["true", true],
    ["on", true],
    ["yes", true],
    ["0", false],
    ["false", false],
    ["no", false],
    ["off", false],
  ]
  for (const [v, expected] of cases) {
    process.env.OPENCODE_CLAUDE_CODE_LOG_FILE = v
    _resetLoggerForTests()
    const c = getLoggerConfig()
    assert.equal(c.file, expected, `value "${v}" should produce file=${expected}`)
  }
  // empty string: unset → fall through to default
  process.env.OPENCODE_CLAUDE_CODE_LOG_FILE = ""
  _resetLoggerForTests()
  assert.equal(getLoggerConfig().file, false, "empty string should be treated as unset")
  delete process.env.OPENCODE_CLAUDE_CODE_LOG_FILE
})

test("invalid OPENCODE_CLAUDE_CODE_LOG_LEVEL is ignored, config wins", () => {
  clearEnv()
  process.env.OPENCODE_CLAUDE_CODE_LOG_LEVEL = "lolnope"
  try {
    configureLogger({ file: false, level: "warn" })
    assert.equal(getLoggerConfig().level, "warn", "invalid env should fall through")
  } finally {
    delete process.env.OPENCODE_CLAUDE_CODE_LOG_LEVEL
    _resetLoggerForTests()
  }
})
