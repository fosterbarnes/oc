import { describe, expect, test } from "bun:test"
import { getRevertDiffFiles } from "../../src/util/revert-diff"

describe("revert diff", () => {
  test.each([
    ["carriage return", "\r"],
    ["line separator", " "],
    ["paragraph separator", " "],
  ])(
    "parses adversarial patch headers containing a %s",
    (_, separator) => {
      // GHSA-73rr-hh4g-fpgx: isolate synchronous hangs and memory growth from the test runner.
      const name = `a${separator}b.ts`
      const padding = " ".repeat(10_000)
      const patches = [
        `--- ${name}\t\n+++ b.ts\t\n`,
        `--- a.ts\t\n+++ ${name}\t\n`,
        `--- ${padding}${name}\t\n+++ b.ts\t\n`,
        `--- a.ts\t\n+++ ${padding}${name}\t\n`,
        `Index: ${padding}${name}\n--- a.ts\t\n+++ b.ts\t\n`,
        `diff -r abc -r def ${padding}${name}\n--- a.ts\t\n+++ b.ts\t\n`,
      ].map((header) => `${header}@@ -1 +1 @@\n-old\n+new\n`)
      const result = Bun.spawnSync({
        cmd: [
          process.execPath,
          "--eval",
          `import { getRevertDiffFiles } from "./revert-diff.ts"
         console.log(JSON.stringify((await Bun.stdin.json()).map((patch) =>
           getRevertDiffFiles(patch).map((file) => [file.additions, file.deletions]))))`,
        ],
        cwd: `${import.meta.dir}/../../src/util`,
        stdin: Buffer.from(JSON.stringify(patches)),
        timeout: 5_000,
        killSignal: "SIGKILL",
      })

      expect(result.exitCode, result.stderr.toString()).toBe(0)
      expect(JSON.parse(result.stdout.toString())).toEqual(patches.map(() => [[1, 1]]))
    },
    10_000,
  )

  test("prefers the actual file path over /dev/null for added and deleted files", () => {
    const files = getRevertDiffFiles(`diff --git a/new.txt b/new.txt
new file mode 100644
index 0000000..3b18e51
--- /dev/null
+++ b/new.txt
@@ -0,0 +1 @@
+new content
diff --git a/old.txt b/old.txt
deleted file mode 100644
index 3b18e51..0000000
--- a/old.txt
+++ /dev/null
@@ -1 +0,0 @@
-old content
`)

    expect(files).toEqual([
      {
        filename: "new.txt",
        additions: 1,
        deletions: 0,
      },
      {
        filename: "old.txt",
        additions: 0,
        deletions: 1,
      },
    ])
  })
})
