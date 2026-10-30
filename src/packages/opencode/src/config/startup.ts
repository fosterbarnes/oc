export * as Startup from "./startup"

import fs from "fs/promises"
import path from "path"
import os from "os"
import { createHash } from "crypto"
import { Global } from "@opencode-ai/core/global"

export type Registry = {
  read: (name: string) => Promise<string | undefined>
  write: (name: string, value: string | undefined) => Promise<void>
}

export function context() {
  return {
    platform: process.platform,
    executable: Global.resolveExecutablePath(),
    entrypoint: /^bun(?:\.exe)?$/i.test(path.basename(process.execPath)) ? process.argv[1] : undefined,
    powershell: Bun.which("pwsh"),
    app: Global.Path.app,
    state: Global.Path.state,
    config: Global.Path.config,
    data: Global.Path.data,
    cache: Global.Path.cache,
    cwd: os.homedir(),
    home: os.homedir(),
    env: process.env,
  }
}

export function plan(input: ReturnType<typeof context>) {
  if (input.platform !== "win32")
    throw new Error("Sign-in startup is supported only on Windows. Use your operating system's user service manager.")
  if (!input.powershell) throw new Error("Install PowerShell 7 (pwsh) before enabling Windows sign-in startup.")
  if (input.env.OPENCODE_CONFIG_CONTENT)
    throw new Error("Save inline OPENCODE_CONFIG_CONTENT to a file and use OPENCODE_CONFIG before enabling startup.")
  const env = {
    ...movedXdgDirs(input),
    ...Object.fromEntries(
      ["OPENCODE_CONFIG", "OPENCODE_CONFIG_DIR"].flatMap((key) =>
        input.env[key] ? [[key, path.resolve(input.env[key]!)]] : [],
      ),
    ),
    ...(input.env.OPENCODE_DB ? { OPENCODE_DB: input.env.OPENCODE_DB } : {}),
  }
  const script =
    [
      "$ErrorActionPreference = 'Stop'",
      // Sign-in must not inherit another build's inline config or resident credentials.
      "Remove-Item Env:OPENCODE_CONFIG_CONTENT, Env:OPENCODE_CONFIG, Env:OPENCODE_CONFIG_DIR, Env:OPENCODE_DB, Env:OPENCODE_SERVER_PASSWORD, Env:OPENCODE_SERVER_USERNAME, Env:OC_RESIDENT, Env:OC_FLAVOR -ErrorAction SilentlyContinue",
      ...Object.entries(env).map(([key, value]) => `$env:${key} = ${literal(value)}`),
      `Set-Location -LiteralPath ${literal(input.cwd)}`,
      `& ${literal(input.executable)} ${[...(input.entrypoint ? [path.resolve(input.entrypoint)] : []), "oc", "server", "start"].map(literal).join(" ")} | Out-Null`,
      "if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }",
    ].join("\r\n") + "\r\n"
  const identity = createHash("sha256").update(`${input.config}\0${input.state}`).digest("hex").slice(0, 16)
  const name = `oc-${input.app}-${identity}`
  // Immutable launchers let registration/config rollback restore the exact previous command.
  const digest = createHash("sha256").update(script).digest("hex").slice(0, 16)
  const file = path.join(input.state, "startup", `${name}-${digest}.ps1`)
  const command = `"${input.powershell}" -NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File "${file}"`
  if (command.length > 260)
    throw new Error(
      "Windows Run commands cannot exceed 260 characters. Move the instance's XDG_STATE_HOME to a shorter path.",
    )
  return { name, file, command, script }
}

// Only XDG dirs moved off xdg-basedir's defaults: every process the server starts inherits them,
// and Windows tools such as gh then read ~/.config instead of %APPDATA% (gh "not logged in").
function movedXdgDirs(input: ReturnType<typeof context>) {
  return Object.fromEntries(
    Object.entries({
      XDG_CONFIG_HOME: [path.dirname(input.config), ".config"],
      XDG_STATE_HOME: [path.dirname(input.state), ".local/state"],
      XDG_DATA_HOME: [path.dirname(input.data), ".local/share"],
      XDG_CACHE_HOME: [path.dirname(input.cache), ".cache"],
    }).flatMap(([key, [dir, fallback]]) =>
      path.resolve(dir).toLowerCase() === path.resolve(input.home, fallback).toLowerCase() ? [] : [[key, dir]],
    ),
  )
}

function literal(value: string) {
  return `'${value.replace(/['\u2018\u2019\u201a\u201b]/g, "$&$&")}'`
}

async function registryCommand(name: string, value?: string, write = false) {
  const script = [
    "$ErrorActionPreference = 'Stop'",
    "$key = [Microsoft.Win32.Registry]::CurrentUser.CreateSubKey('Software\\Microsoft\\Windows\\CurrentVersion\\Run')",
    "try {",
    write
      ? value === undefined
        ? "$key.DeleteValue($env:OC_STARTUP_NAME, $false)"
        : "$key.SetValue($env:OC_STARTUP_NAME, $env:OC_STARTUP_VALUE, [Microsoft.Win32.RegistryValueKind]::String)"
      : "$value = $key.GetValue($env:OC_STARTUP_NAME, $null, [Microsoft.Win32.RegistryValueOptions]::DoNotExpandEnvironmentNames); if ($null -ne $value -and $value -isnot [string]) { throw 'Startup registration is not a string' }; ConvertTo-Json -InputObject $value -Compress",
    "} finally { $key.Dispose() }",
  ].join("; ")
  const child = Bun.spawn(["pwsh", "-NoProfile", "-NonInteractive", "-Command", script], {
    stdout: "pipe",
    stderr: "pipe",
    windowsHide: true,
    env: { ...process.env, OC_STARTUP_NAME: name, OC_STARTUP_VALUE: value ?? "" },
  })
  const [stdout, stderr, code] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ])
  if (code !== 0) throw new Error(`Windows startup registration failed: ${stderr.trim()}`)
  if (!write) return (JSON.parse(stdout) as string | null) ?? undefined
}

export const registry: Registry = {
  read: (name) => registryCommand(name),
  write: async (name, value) => {
    await registryCommand(name, value, true)
  },
}

let pending = Promise.resolve()

export function update<T>(
  enabled: boolean,
  persist: () => Promise<T>,
  options: {
    context?: ReturnType<typeof context>
    registry?: Registry
  } = {},
) {
  const run = pending.then(async () => {
    if (typeof enabled !== "boolean") throw new Error("Windows sign-in startup requires a boolean.")
    const next = plan(options.context ?? context())
    const registration = options.registry ?? registry
    const previous = await registration.read(next.name)
    const desired = enabled ? next.command : undefined
    let registered = false
    let created = false
    try {
      if (enabled) {
        await fs.mkdir(path.dirname(next.file), { recursive: true })
        const handle = await fs.open(next.file, "wx").catch((error: NodeJS.ErrnoException) => {
          if (error.code === "EEXIST") return undefined
          throw error
        })
        if (handle) {
          created = true
          try {
            await handle.writeFile(next.script, "utf8")
          } finally {
            await handle.close()
          }
        }
        if (!handle && (await fs.readFile(next.file, "utf8")) !== next.script)
          throw new Error(`Startup launcher contents do not match: ${next.file}`)
      }
      if (previous !== desired) {
        // A failed write may have changed the registration before reporting failure.
        registered = true
        await registration.write(next.name, desired)
      }
      return await persist()
    } catch (error) {
      try {
        if (registered) await registration.write(next.name, previous)
        if (created) await fs.rm(next.file, { force: true })
      } catch (rollback) {
        throw new AggregateError(
          [error, rollback],
          "Windows startup update failed and rollback failed. Check this instance's HKCU Run registration.",
        )
      }
      throw error
    }
  })
  pending = run.then(
    () => undefined,
    () => undefined,
  )
  return run
}
