// Times the same oc workloads on pwsh and on the stock macOS shell. Plan: docs/dev/shellBenchPlan.md.
// bun .scripts/shellbench/shellbench.ts <spawn|agent> [-n 10] [--warmup 2] [--no-pwsh]
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { parseArgs } from "node:util"

// `keep` filters output lines before the parity compare (drops timings that differ on every run).
// `reset` runs untimed before every run; `check` replaces the output with the state to compare.
// `runs` overrides -n for slow cases.
type Case = {
  name: string
  arms: Record<string, string[]>
  cwd?: string
  keep?: RegExp
  reset?: () => void
  check?: (output: string, exit: number) => string
  runs?: number
  warmup?: number
  // Folder put first on PATH (stub executables).
  pathPrefix?: string
}
type Run = { ms: number; exit: number; output: string }

const REPO = path.resolve(import.meta.dir, "../..")
const PWSH = Bun.which("pwsh") ?? "/usr/local/bin/pwsh"
const ZSH = "/bin/zsh"
// The markers ShellTool.shellEnv adds to every agent command (src/packages/opencode/src/tool/shell.ts).
const AGENT_ENV = { AGENT: "1", OPENCODE: "1", AI_AGENT: "opencode" }
// Test 1b model and arms (see modelCommands).
const MODEL = { id: "openai/gpt-6-luna", variant: "medium", runs: 2 }
const MODEL_ARMS = { pwsh: PWSH, zsh: ZSH }

const TESTS: Record<string, () => Case[]> = {
  spawn: spawnCases,
  agent: agentCases,
  bump: bumpCases,
  test: testCases,
  clone: cloneCases,
}
// Temp folders removed after the run.
const cleanup: string[] = []

const args = parseArgs({
  args: Bun.argv.slice(2),
  allowPositionals: true,
  options: {
    n: { type: "string", short: "n", default: "10" },
    warmup: { type: "string", default: "2" },
    "no-pwsh": { type: "boolean", default: false },
    read: { type: "boolean", default: false },
  },
})
const test = args.positionals[0] ?? ""
if (test === "model") {
  console.log(args.values.read ? await readModelRuns() : modelCommands())
  process.exit(0)
}
if (!TESTS[test]) {
  console.error(
    `Usage: bun .scripts/shellbench/shellbench.ts <${Object.keys(TESTS).join("|")}> [-n 10] [--warmup 2] [--no-pwsh]\n` +
      "       bun .scripts/shellbench/shellbench.ts model [--read]",
  )
  process.exit(1)
}
const n = Number(args.values.n)
const warmup = Number(args.values.warmup)
const noPwsh = args.values["no-pwsh"] ? pathWithoutPwsh() : undefined

const results = TESTS[test]().map((item) => {
  console.error(`${test}: ${item.name}`)
  const names = Object.keys(item.arms)
  const runs = Object.fromEntries(names.map((name) => [name, [] as Run[]]))
  // Arms alternate inside each round so drift (thermals, caches) hits every arm alike.
  const skip = item.warmup ?? warmup
  for (let round = 0; round < skip + (item.runs ?? n); round++) {
    for (const name of names) {
      const run = runOnce(item.arms[name], item)
      if (round >= skip) runs[name].push(run)
    }
  }
  return { name: item.name, arms: Object.fromEntries(names.map((name) => [name, summarize(item.arms[name], runs[name])])) }
})
for (const dir of cleanup) fs.rmSync(dir, { recursive: true, force: true })

const info = {
  test,
  date: new Date().toISOString(),
  n,
  warmup,
  noPwsh: Boolean(noPwsh),
  macos: firstLine(["sw_vers", "-productVersion"]),
  cpu: os.cpus()[0]?.model,
  bun: Bun.version,
  pwsh: firstLine([PWSH, "-NoLogo", "-NoProfile", "-Command", "$PSVersionTable.PSVersion.ToString()"]),
  zsh: firstLine([ZSH, "--version"]),
}
const report = render(info, results)
const stem = path.join(import.meta.dir, `shellbench-${test}${noPwsh ? "-nopwsh" : ""}`)
await Bun.write(`${stem}.json`, JSON.stringify({ ...info, results }, null, 2))
await Bun.write(`${stem}.md`, report)
console.log(report)

function runOnce(argv: string[], item: Case): Run {
  const usesPwsh = path.basename(argv[0]) === "pwsh"
  const PATH = noPwsh && !usesPwsh ? noPwsh.PATH : (process.env.PATH ?? "")
  const env = { ...process.env, ...AGENT_ENV, PATH: item.pathPrefix ? `${item.pathPrefix}:${PATH}` : PATH }
  // closeOut in both script helpers kills the pane when this is set.
  delete env.SCRIPT_OWN_PANE
  item.reset?.()
  const start = performance.now()
  const result = Bun.spawnSync(argv, { cwd: item.cwd ?? REPO, env, stdin: "ignore", stdout: "pipe", stderr: "pipe" })
  const ms = performance.now() - start
  const output = result.stdout.toString() + result.stderr.toString()
  return { ms, exit: result.exitCode, output: item.check ? item.check(output, result.exitCode) : normalize(output, item.keep) }
}

function summarize(argv: string[], runs: Run[]) {
  const ms = runs.map((run) => run.ms).toSorted((a, b) => a - b)
  const mid = Math.floor(ms.length / 2)
  return {
    argv,
    median: round(ms.length % 2 ? ms[mid] : (ms[mid - 1] + ms[mid]) / 2),
    p90: round(ms[Math.ceil(ms.length * 0.9) - 1]),
    min: round(ms[0]),
    exit: runs[0].exit,
    output: runs[0].output,
    // Output or exit code changed between runs of the same arm.
    unstable: runs.some((run) => run.exit !== runs[0].exit || run.output !== runs[0].output),
    runs: runs.map((run) => round(run.ms)),
  }
}

function render(meta: typeof info, rows: typeof results) {
  // Cases may have different arms (Test 3's error cases have no bare-bun arm).
  const arms = [...new Set(rows.flatMap((row) => Object.keys(row.arms)))]
  const lines = [
    `# shellbench ${meta.test}`,
    "",
    `${meta.date} - macOS ${meta.macos}, ${meta.cpu}, Bun ${meta.bun}, pwsh ${meta.pwsh}, ${meta.zsh}`,
    `n=${meta.n}, warmup=${meta.warmup}${meta.noPwsh ? ", non-pwsh arms ran with pwsh removed from PATH" : ""}. ms per call.`,
    "",
    "| case | arm | median | p90 | min | ratio | exit | parity |",
    "| --- | --- | ---: | ---: | ---: | ---: | ---: | --- |",
  ]
  for (const row of rows) {
    const first = Object.values(row.arms)[0]
    for (const [arm, value] of Object.entries(row.arms)) {
      const ratio = first.median ? `${(value.median / first.median).toFixed(2)}x` : "-"
      lines.push(
        `| ${cell(row.name)} | ${arm} | ${value.median} | ${value.p90} | ${value.min} | ${ratio} | ${value.exit} | ${cell(parity(first, value))} |`,
      )
    }
  }
  const total = (arm: string) => round(rows.reduce((sum, row) => sum + (row.arms[arm]?.median ?? 0), 0))
  const cases = (arm: string) => rows.filter((row) => row.arms[arm]).length
  lines.push(
    "",
    `| total | ${arms.join(" | ")} |`,
    `| --- | ${arms.map(() => "---:").join(" | ")} |`,
    `| sum of medians | ${arms.map(total).join(" | ")} |`,
    `| cases | ${arms.map(cases).join(" | ")} |`,
    "",
  )
  return lines.join("\n")
}

function parity(first: ReturnType<typeof summarize>, value: ReturnType<typeof summarize>) {
  const unstable = value.unstable ? " (unstable)" : ""
  if (first === value) return `reference${unstable}`
  if (first.exit !== value.exit) return `exit ${first.exit} vs ${value.exit}${unstable}`
  if (first.output === value.output) return `same${unstable}`
  const a = first.output.split("\n")
  const b = value.output.split("\n")
  const diff = Array.from({ length: Math.max(a.length, b.length) }, (_, index) => index)
    .filter((index) => a[index] !== b[index])
    .slice(0, 3)
    .map((index) => `L${index + 1} "${clip(a[index])}" vs "${clip(b[index])}"`)
  return `differs: ${diff.join("; ")}${unstable}`
}

// Shadows every PATH folder that holds pwsh with a folder of links to everything else in it,
// so the non-pwsh arms keep their other tools but cannot start pwsh.
function pathWithoutPwsh() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "shellbench-nopwsh-"))
  const PATH = (process.env.PATH ?? "")
    .split(":")
    .map((entry, index) => {
      if (!entry || !fs.existsSync(path.join(entry, "pwsh"))) return entry
      const shadow = path.join(dir, String(index))
      fs.mkdirSync(shadow)
      for (const name of fs.readdirSync(entry).filter((name) => name !== "pwsh")) {
        fs.symlinkSync(path.join(entry, name), path.join(shadow, name))
      }
      return shadow
    })
    .join(":")
  if (Bun.which("pwsh", { PATH })) throw new Error("pwsh still resolves with its PATH folders shadowed")
  cleanup.push(dir)
  return { PATH }
}

function spawnCases(): Case[] {
  return [
    {
      name: "empty command",
      arms: {
        "zsh -c": [ZSH, "-c", "exit"],
        "zsh -l -c": [ZSH, "-l", "-c", "exit"],
        "pwsh -NoProfile": [PWSH, "-NoLogo", "-NoProfile", "-NonInteractive", "-Command", "exit"],
        // The agent shell tool's darwin path: `pwsh -c`, which loads the user profile.
        "pwsh -c": [PWSH, "-c", "exit"],
        "pwsh + scriptHelper": [
          PWSH,
          "-NoLogo",
          "-NoProfile",
          "-NonInteractive",
          "-Command",
          `. '${path.join(REPO, ".scripts", "scriptHelper.ps1")}'`,
        ],
      },
    },
  ]
}

// Test 1: real agent command shapes, pwsh form for A0/A1 and zsh form for B.
function agentCases(): Case[] {
  const file = "src/packages/core/src/shell.ts"
  return [
    agentCase("status", "git status --short"),
    agentCase("log", "git log --oneline -5"),
    agentCase("diff stat", "git diff --stat HEAD~1"),
    agentCase("search", "rg -n launchDetached src/packages/core/src"),
    agentCase("read range", `Get-Content -LiteralPath ${file} | Select-Object -Skip 99 -First 40`, `sed -n 100,139p ${file}`),
    agentCase("list", "Get-ChildItem -Name src/packages", "ls -1 src/packages"),
    agentCase(
      "exists",
      "Test-Path -LiteralPath src/.version/version",
      "[ -e src/.version/version ] && echo True || echo False",
    ),
    agentCase(
      "JSON field",
      "(Get-Content -Raw src/package.json | ConvertFrom-Json).packageManager",
      "jq -r .packageManager src/package.json",
    ),
    agentCase("count", "@(git ls-files | Where-Object { $_ -like '*.ps1' }).Count", "git ls-files | grep -c '\\.ps1$'"),
    // Also the PATH parity check: the profile prepends folders that A1 and B do not get.
    agentCase("which", "(Get-Command bun, brew, git, rg).Source", "command -v bun brew git rg"),
    agentCase(
      "temp work",
      `$d = New-Item -ItemType Directory -Force (Join-Path ([IO.Path]::GetTempPath()) "sb$PID"); Set-Content (Join-Path $d f) hi; Remove-Item -LiteralPath $d -Recurse -Force; 'ok'`,
      `d=$(mktemp -d) && echo hi > "$d/f" && rm -rf "$d" && echo ok`,
    ),
    agentCase(
      "failure check",
      "git rev-parse --verify nope 2>$null; if ($LASTEXITCODE) { 'missing' }",
      "git rev-parse --verify nope 2>/dev/null || echo missing",
    ),
    agentCase("env", "$env:HOME", `echo "$HOME"`),
    agentCase("one test", "bun test test/event.test.ts", "bun test test/event.test.ts", {
      cwd: path.join(REPO, "src", "packages", "schema"),
      keep: /^\s*\d+ (pass|fail)$/,
    }),
  ]
}

function agentCase(name: string, ps: string, sh = ps, extra: Pick<Case, "cwd" | "keep"> = {}): Case {
  return {
    name,
    ...extra,
    arms: {
      // cmd() in tool/shell.ts on darwin: ChildProcess.make(command, [], { shell }); Node spawns [shell, "-c", command].
      A0: [PWSH, "-c", ps],
      // What cmd() already passes to pwsh on Windows.
      A1: [PWSH, "-NoLogo", "-NoProfile", "-NonInteractive", "-Command", ps],
      B: [ZSH, "-c", sh],
    },
  }
}

// Test 2: bumpVersion.ps1 vs posix/bumpVersion.sh, each run in throwaway repo copies.
function bumpCases(): Case[] {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "shellbench-bump-")))
  cleanup.push(root)
  const words = path.join(REPO, ".res", "yapBot.json")
  const copy = (name: string, withWords: boolean) => {
    const dir = path.join(root, name)
    for (const file of [
      ".scripts/bumpVersion.ps1",
      ".scripts/scriptHelper.ps1",
      ".scripts/posix/bumpVersion.sh",
      ".scripts/posix/scriptHelper.sh",
    ]) {
      fs.mkdirSync(path.dirname(path.join(dir, file)), { recursive: true })
      fs.copyFileSync(path.join(REPO, file), path.join(dir, file))
    }
    if (withWords) {
      fs.mkdirSync(path.join(dir, ".res"))
      fs.copyFileSync(words, path.join(dir, ".res", "yapBot.json"))
    }
    return dir
  }
  const ok = copy("ok", true)
  const noWords = copy("noWords", false)
  const scripts = (dir: string, flag: { ps: string; sh: string } | undefined) => ({
    A: [PWSH, "-NoLogo", "-NoProfile", "-NonInteractive", "-File", path.join(dir, ".scripts", "bumpVersion.ps1"), ...(flag ? [flag.ps] : [])],
    B: ["/bin/sh", path.join(dir, ".scripts", "posix", "bumpVersion.sh"), ...(flag ? [flag.sh] : [])],
  })
  const bumpCase = (name: string, dir: string, start: string, error?: string, flag?: { ps: string; sh: string }): Case => ({
    name,
    arms: scripts(dir, flag),
    reset: () => {
      fs.mkdirSync(path.join(dir, "src", ".version"), { recursive: true })
      fs.writeFileSync(path.join(dir, "src", ".version", "version"), start)
      fs.writeFileSync(path.join(dir, "src", ".version", "versionTag"), "loopholeDrive\n")
    },
    check: (output, exit) => {
      const tag = fs.readFileSync(path.join(dir, "src", ".version", "versionTag"))
      const text = tag.toString()
      const fresh = text !== "loopholeDrive\n" && /^[a-z]+[A-Z][a-z]*\n$/.test(text) && tag[0] !== 0xef
      const message = plain(output)
      return [
        `exit ${exit ? "nonzero" : 0}`,
        `version ${JSON.stringify(fs.readFileSync(path.join(dir, "src", ".version", "version"), "utf8"))}`,
        `tag ${text === "loopholeDrive\n" ? "unchanged" : fresh ? "new camelCase tag, LF, no BOM" : JSON.stringify(text)}`,
        error
          ? `error ${message.includes(error) ? "message matches" : JSON.stringify(message)}`
          : `stdout ${fresh ? message.replaceAll(text.trim(), "<tag>") : message}`,
      ].join("\n")
    },
  })
  return [
    {
      name: "word filter",
      arms: {
        A: [PWSH, "-NoLogo", "-NoProfile", "-NonInteractive", "-Command", `@((Get-Content -Raw '${words}' | ConvertFrom-Json) | Where-Object { $_ -match '^[A-Za-z]+$' }).Count`],
        B: ["/bin/sh", "-c", `jq -r '.[] | select(type == "string" and test("^[A-Za-z]+$"))' '${words}' | wc -l | tr -d ' '`],
      },
    },
    bumpCase("bump", ok, "0.2.361\n"),
    bumpCase("reroll tag", ok, "0.2.361\n", undefined, { ps: "-RerollTag", sh: "--reroll-tag" }),
    bumpCase(
      "missing word list",
      noWords,
      "0.2.361\n",
      `Missing word list ${path.join(noWords, ".res", "yapBot.json")}. It is private and not in the public repo, so version tags can only be generated by the maintainer.`,
    ),
    bumpCase(
      "bad version",
      ok,
      "abc\n",
      `Invalid ${path.join(ok, "src", ".version", "version")}: expected one version in X.Y.Z format`,
    ),
    bumpCase("version with spaces", ok, "  0.2.361 \n\n", undefined),
    bumpCase(
      "two-line version",
      ok,
      "0.2.361\nfoo\n",
      `Invalid ${path.join(ok, "src", ".version", "version")}: expected one version in X.Y.Z format`,
    ),
  ]
}

// Test 3: test.ps1 vs posix/test.sh on one package, with bare `bun test` as the floor (arm C).
function testCases(): Case[] {
  const schema = path.join(REPO, "src", "packages", "schema")
  const core = path.join(REPO, "src", "packages", "core")
  const ps1 = (...args: string[]) => [PWSH, "-NoLogo", "-NoProfile", "-NonInteractive", "-File", path.join(REPO, ".scripts", "test.ps1"), ...args]
  const sh = (...args: string[]) => ["/bin/sh", path.join(REPO, ".scripts", "posix", "test.sh"), ...args]
  // What both wrappers run, minus the wrapper: the env vars they set, from the package folder.
  const bare = (file: string) => [
    "/usr/bin/env",
    "GITHUB_ACTIONS=false",
    "OPENCODE_EXPERIMENTAL_DISABLE_FILEWATCHER=false",
    Bun.which("bun") ?? "bun",
    "test",
    "--timeout",
    "30000",
    "--only-failures",
    file,
  ]
  const counts = /^\s*\d+ (pass|fail)$/
  const error = (name: string, args: string[], phrase: string): Case => ({
    name,
    arms: { A: ps1(...args), B: sh(...args) },
    check: (output, exit) =>
      `exit ${exit ? "nonzero" : 0}\nerror ${plain(output).includes(phrase) ? "message matches" : JSON.stringify(plain(output))}`,
  })
  return [
    {
      name: "fast file (schema event.test.ts)",
      cwd: schema,
      keep: counts,
      arms: { A: ps1("-Package", "schema", "-File", "test/event.test.ts"), B: sh("-Package", "schema", "-File", "test/event.test.ts"), C: bare("./test/event.test.ts") },
    },
    {
      name: "slower file (core git.test.ts)",
      cwd: core,
      keep: counts,
      runs: 3,
      arms: { A: ps1("-Package", "core", "-File", "test/git.test.ts"), B: sh("-Package", "core", "-File", "test/git.test.ts"), C: bare("./test/git.test.ts") },
    },
    {
      name: "name filter, wrapper lines",
      keep: /^(Running |Passed |\s*\d+ (pass|fail)$)/,
      arms: {
        A: ps1("-Package", "schema", "-File", "test/event.test.ts", "-Name", "definition is pure"),
        B: sh("-Package", "schema", "-File", "test/event.test.ts", "-Name", "definition is pure"),
      },
    },
    {
      name: "dry run",
      arms: {
        // -DryRun returns check objects; print them as the one line test.sh prints.
        A: [
          PWSH,
          "-NoLogo",
          "-NoProfile",
          "-NonInteractive",
          "-Command",
          `(& '${path.join(REPO, ".scripts", "test.ps1")}' -Package schema -File test/event.test.ts -DryRun) | ForEach-Object { "cd $($_.Directory) && $($_.Command) $($_.Arguments -join ' ')" }`,
        ],
        B: sh("-Package", "schema", "-File", "test/event.test.ts", "-DryRun"),
      },
    },
    error("failing run", ["-Package", "schema", "-File", "test/event.test.ts", "-Name", "zzNoSuchTest"], "schema failed (exit 1)."),
    error("file outside package", ["-Package", "schema", "-File", "../core/package.json"], "-File must be inside the selected package."),
    error(
      "missing file",
      ["-Package", "schema", "-File", "test/nope.test.ts"],
      `Test file does not exist: ${path.join(schema, "test", "nope.test.ts")}`,
    ),
    error("unknown package", ["-Package", "nope"], "Unknown package: nope."),
  ]
}

// Backlog 2: the /clone scripts (global config, outside this repo), cloneProject.ps1 vs
// posix/cloneProject.sh on scratch repos, and openCloneTab against a stub opencode.
function cloneCases(): Case[] {
  const scripts = path.join(os.homedir(), ".config", "opencode", "scripts")
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "shellbench-clone-")))
  cleanup.push(root)
  const fixture = Bun.spawnSync(
    [
      "/bin/sh",
      "-ec",
      `git init -q --bare origin.git
      git init -q -b main src && cd src
      printf 'node_modules/\\n*.log\\n' > .gitignore && echo a > a.txt && mkdir sub node_modules
      echo b > sub/b.txt && echo j > node_modules/j && echo l > debug.log
      git add -A && git commit -qm init && git remote add origin "$(cd .. && pwd)/origin.git" && git push -q -u origin main
      echo c > c.txt && git add c.txt && git commit -qm unpushed
      echo changed >> a.txt && echo new > untracked.txt && ln -s a.txt link.txt && cd ..
      mkdir plain && echo p > plain/p.txt && ln -s p.txt plain/link.txt
      git init -q -b main detached && cd detached && echo d > d.txt && git add -A && git commit -qm d && git checkout -q --detach && cd ..
      git init -q -b main noremote && cd noremote && echo n > n.txt && git add -A && git commit -qm n
      mkdir stub && printf '#!/bin/sh\\n[ "$1 $2" = "session bootstrap" ] && echo "{\\\\"sessionID\\\\":\\\\"ses_shellbench\\\\"}"\\nexit 0\\n' > stub/opencode
      chmod +x stub/opencode`,
    ],
    {
      cwd: root,
      stdout: "pipe",
      stderr: "pipe",
      env: {
        ...process.env,
        GIT_CONFIG_GLOBAL: "/dev/null",
        GIT_AUTHOR_NAME: "shellbench",
        GIT_AUTHOR_EMAIL: "shellbench@localhost",
        GIT_COMMITTER_NAME: "shellbench",
        GIT_COMMITTER_EMAIL: "shellbench@localhost",
      },
    },
  )
  if (fixture.exitCode) throw new Error(`clone fixtures failed: ${fixture.stderr}`)
  const arms = (mode: string, dir: string) => ({
    A: [PWSH, "-NoLogo", "-NoProfile", "-NonInteractive", "-File", path.join(scripts, "cloneProject.ps1"), "-Mode", mode, "-Directory", path.join(root, dir)],
    B: ["/bin/sh", path.join(scripts, "posix", "cloneProject.sh"), "-Mode", mode, "-Directory", path.join(root, dir)],
  })
  // Every run starts with no <name>CLONE folders, so both arms get the same clone path.
  const reset = () => {
    for (const name of fs.readdirSync(root).filter((name) => name.includes("CLONE"))) {
      fs.rmSync(path.join(root, name), { recursive: true, force: true })
    }
  }
  const git = (dir: string, ...args: string[]) =>
    Bun.spawnSync(["git", "-C", dir, ...args], { stdout: "pipe", stderr: "pipe" }).stdout.toString().trim()
  // The clone as files (type, path, content hash or link target) plus its git baseline state.
  const state = (output: string, exit: number) => {
    if (exit) return `exit ${exit}: ${plain(output)}`
    const result = JSON.parse(output.trim().split("\n").at(-1) ?? "{}")
    const clone: string = result.clone
    delete result.seconds
    const files = (fs.readdirSync(clone, { recursive: true }) as string[])
      .filter((name) => name !== ".git" && !name.startsWith(".git/"))
      .toSorted()
      .map((name) => {
        const full = path.join(clone, name)
        const stat = fs.lstatSync(full)
        if (stat.isSymbolicLink()) return `l ${name} -> ${fs.readlinkSync(full)}`
        if (stat.isDirectory()) return `d ${name}`
        return `f ${name} ${Bun.hash(fs.readFileSync(full)).toString(16)}`
      })
    const gitState = result.git
      ? [
          `branch ${git(clone, "branch", "--show-current")}`,
          `status ${JSON.stringify(git(clone, "status", "--porcelain"))}`,
          `base tree ${git(clone, "rev-parse", "refs/ocClone/base^{tree}")}`,
          `head tree ${git(clone, "rev-parse", "HEAD^{tree}")}`,
          `source ${git(clone, "config", "ocClone.source")}`,
          `pushurl ${git(clone, "config", "remote.origin.pushurl")}`,
        ]
      : []
    return [JSON.stringify(result), ...files, ...gitState].join("\n")
  }
  const error = (name: string, mode: string, dir: string, phrase: string): Case => ({
    name,
    arms: arms(mode, dir),
    reset,
    check: (output, exit) =>
      `exit ${exit ? "nonzero" : 0}\nerror ${plain(output).includes(phrase) ? "message matches" : JSON.stringify(plain(output))}`,
  })
  return [
    { name: "Local, git repo", arms: arms("Local", "src"), reset, check: state },
    { name: "Local, plain folder", arms: arms("Local", "plain"), reset, check: state },
    { name: "Remote", arms: arms("Remote", "src"), reset, check: state },
    error("Remote, not git", "Remote", "plain", `Not a git repository: ${path.join(root, "plain")}. Use /cloneLocal.`),
    error("Remote, detached HEAD", "Remote", "detached", "Detached HEAD: no branch to clone. Use /cloneLocal."),
    error("Remote, no remote", "Remote", "noremote", "No 'origin' remote. Use /cloneLocal."),
    {
      // Opens one real WezTerm tab per run (the stub exits at once), so one run per arm.
      name: "openCloneTab (stub opencode)",
      runs: 1,
      warmup: 0,
      pathPrefix: path.join(root, "stub"),
      arms: {
        A: [PWSH, "-NoLogo", "-NoProfile", "-NonInteractive", "-File", path.join(scripts, "openCloneTab.ps1"), "-Directory", path.join(root, "plain")],
        B: ["/bin/sh", path.join(scripts, "posix", "openCloneTab.sh"), "-Directory", path.join(root, "plain")],
      },
    },
  ]
}

// pwsh error records: strip colors and the "     | " gutter so only the message text is left.
function plain(output: string) {
  return output
    .replace(/\x1b\[[0-9;]*m/g, "")
    .replace(/\s*\n\s*\|\s*/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

// Test 1b: the same read-only task for a non-Claude model with oc's shell tool on pwsh vs zsh.
// It spends model usage and agents must not start `opencode run`, so this only prints the commands;
// `--read` summarizes the JSON event logs they write.
function modelCommands() {
  const task = (shell: string) =>
    `Your shell tool runs ${shell} in this session; write every command for it. ` +
    "Find where detachedCommand is defined in this repository, run its unit test file with bun from the package that owns it, " +
    "and report the file:line of the definition and the pass and fail counts. Do not edit any file."
  const lines = Object.entries(MODEL_ARMS).flatMap(([arm, shell]) =>
    Array.from({ length: MODEL.runs }, (_, index) =>
      [
        `OPENCODE_CONFIG_CONTENT='${JSON.stringify({ shell })}'`,
        "opencode run",
        `--dir '${REPO}'`,
        `--model ${MODEL.id} --variant ${MODEL.variant}`,
        "--format json",
        `'${task(path.basename(shell))}'`,
        // opencode run reads extra prompt text from a non-TTY stdin until EOF (run.ts).
        "< /dev/null",
        `> '${path.join(import.meta.dir, `shellbench-model-${arm}-${index + 1}.jsonl`)}'`,
      ].join(" "),
    ),
  )
  return [
    `# Test 1b: ${MODEL.runs} runs per arm of ${MODEL.id} (${MODEL.variant}). Uses model credits.`,
    "# Run from zsh (each line sets the shell for that run only), then:",
    "#   bun .scripts/shellbench/shellbench.ts model --read",
    ...lines,
  ].join("\n")
}

async function readModelRuns() {
  const files = fs
    .readdirSync(import.meta.dir)
    .filter((name) => /^shellbench-model-.+\.jsonl$/.test(name))
    .toSorted()
  if (!files.length) return "No shellbench-model-*.jsonl logs yet. Run `bun .scripts/shellbench/shellbench.ts model` first."
  // Failures that mean the model wrote syntax for the wrong shell.
  const syntax = /ParserError|is not recognized as a name of a cmdlet|Unexpected token|parse error|command not found|bad pattern|no matches found/i
  const rows = await Promise.all(
    files.map(async (name) => {
      const events = (await Bun.file(path.join(import.meta.dir, name)).text())
        .split("\n")
        .filter(Boolean)
        .map((line) => JSON.parse(line))
      const shell = events.filter((event) => event.type === "tool_use" && event.part?.tool === "bash")
      const failed = shell.filter((event) => event.part.state.status === "error" || event.part.state.metadata?.exit)
      const steps = events.filter((event) => event.type === "step_finish")
      const tokens = steps.reduce(
        (sum, event) => sum + (event.part.tokens?.input ?? 0) + (event.part.tokens?.output ?? 0) + (event.part.tokens?.reasoning ?? 0),
        0,
      )
      const answer = events.findLast((event) => event.type === "text")?.part?.text ?? ""
      const seconds = events.length ? (events.at(-1).timestamp - events[0].timestamp) / 1000 : 0
      return [
        name.replace(/^shellbench-model-|\.jsonl$/g, ""),
        seconds.toFixed(1),
        shell.length,
        failed.length,
        failed.filter((event) => syntax.test(`${event.part.state.output ?? ""}${event.part.state.error ?? ""}`)).length,
        tokens,
        events.some((event) => event.type === "error") ? "error" : "ok",
        cell(clip(answer.replace(/\s+/g, " "))),
      ]
    }),
  )
  return [
    "| run | seconds | shell calls | failed | syntax failures | tokens | status | answer |",
    "| --- | ---: | ---: | ---: | ---: | ---: | --- | --- |",
    ...rows.map((row) => `| ${row.join(" | ")} |`),
  ].join("\n")
}

function normalize(text: string, keep?: RegExp) {
  const lines = text
    .replaceAll("\r\n", "\n")
    .split("\n")
    .map((line) => line.trimEnd())
  return (keep ? lines.filter((line) => keep.test(line)) : lines).join("\n").trim()
}

function firstLine(argv: string[]) {
  return Bun.spawnSync(argv, { stdout: "pipe", stderr: "pipe" }).stdout.toString().split("\n")[0].trim()
}

function round(value: number) {
  return Math.round(value * 10) / 10
}

function clip(text = "") {
  return text.length > 60 ? `${text.slice(0, 57)}...` : text
}

function cell(text: string) {
  return text.replaceAll("|", "\\|")
}
