import { describe, expect, test } from "bun:test"
import fs from "fs/promises"
import os from "os"
import path from "path"
import { detachedCommand, launchDetached, windowsArguments } from "@opencode-ai/core/util/launchDetached"

describe("detachedCommand ps1", () => {
  test("keeps caller text off the cmd command line", () => {
    const file = "C:\\tools\\revive test.ps1"
    const args = ['a" & echo hi & "b', "100%PATH%", "trailing\\"]
    const command = detachedCommand(file, args)
    expect(command.file).toBe("cmd.exe")
    expect(command.args).toEqual(["/d", "/v:on", "/c", 'start "revive test" pwsh -NoProfile -File !OC_LAUNCH_ARGV!'])
    expect(command.options.env.OC_LAUNCH_ARGV).toBe(windowsArguments([file, ...args]))
  })

  test("drops cmd-active characters from the console title", () => {
    expect(detachedCommand('C:\\tools\\a%b!c^d"e.ps1').args[3]).toStartWith('start "abcde" ')
  })

  test.skipIf(process.platform !== "win32")(
    "passes run_after_turn arguments to the script exactly without running injected commands",
    async () => {
      const directory = await fs.mkdtemp(path.join(os.tmpdir(), "oc-launch-"))
      try {
        const script = path.join(directory, "echo args.ps1")
        const output = path.join(directory, "args.json")
        const injected = path.join(directory, "injected")
        await fs.writeFile(
          script,
          `[IO.File]::WriteAllText('${output}.tmp', (ConvertTo-Json -InputObject @($args) -Compress))\n` +
            `Move-Item -LiteralPath '${output}.tmp' -Destination '${output}'\n`,
        )
        // Unquoted redirect target: the old `\"` quoting ran this as `type nul > <path>`.
        const args = [`a" & type nul > ${injected} & "b`, "100%USERNAME%", "bang!USERNAME!", "C:\\dir\\", "-Flag"]
        launchDetached(script, args)
        const deadline = Date.now() + 15_000
        while (!(await Bun.file(output).exists())) {
          if (Date.now() > deadline) throw new Error("script did not write its arguments")
          await Bun.sleep(100)
        }
        expect(JSON.parse(await fs.readFile(output, "utf8"))).toEqual(args)
        expect(await Bun.file(injected).exists()).toBe(false)
      } finally {
        await fs.rm(directory, { recursive: true, force: true })
      }
    },
    30_000,
  )
})
