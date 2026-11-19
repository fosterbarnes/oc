import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { Global } from "../../src/global"
import { OcMirror } from "../../src/util/ocMirror"
import { OcSync } from "../../src/util/ocSync"

// A configured or tailnet ssh destination must never become an ssh option (`-oProxyCommand=...`).
describe("connect", () => {
  test("plain ssh ends options before a checked destination", () => {
    expect(OcMirror.connect("goonstation", false)).toEqual([
      "ssh",
      "-o",
      "BatchMode=yes",
      "-o",
      "ConnectTimeout=5",
      "--",
      "goonstation",
    ])
    expect(OcMirror.connect("goonstation", false, "foster@goon.lan").at(-1)).toBe("foster@goon.lan")
  })

  test("rejects option-like and shell-like destinations", () => {
    for (const bad of ["-oProxyCommand=touch /tmp/x", "a b", "host;rm", "-", "user@-host"])
      expect(() => OcMirror.connect("goonstation", false, bad)).toThrow()
    expect(() => OcMirror.connect("-oProxyCommand=x", false)).toThrow()
  })
})

// Tagged nodes share one Tailscale user across owners, so they are never "own" devices.
describe("isOwnPeer", () => {
  const status = (selfTagged = false, selfUser = 7): OcSync.TailscaleStatus => ({
    selfUser,
    selfHost: "mac",
    selfIps: [],
    selfTagged,
    peers: [],
  })
  const peer = (user: number, tagged = false) => ({ host: "pc", ips: [], online: true, user, ssh: false, tagged })

  test("same untagged user only", () => {
    expect(OcSync.isOwnPeer(status(), peer(7))).toBe(true)
    expect(OcSync.isOwnPeer(status(), peer(8))).toBe(false)
    expect(OcSync.isOwnPeer(status(), peer(7, true))).toBe(false)
    expect(OcSync.isOwnPeer(status(true), peer(7))).toBe(false)
    expect(OcSync.isOwnPeer(status(false, -1), peer(-1))).toBe(false)
  })
})

describe("refusal", () => {
  let root = ""
  let savedConfig = ""
  let savedSsh: string | undefined

  beforeEach(async () => {
    root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), "oc-mirror-")))
    savedConfig = Global.Path.config
    savedSsh = process.env.SSH_CONNECTION
    delete process.env.SSH_CONNECTION
    Global.Path.config = root
  })

  afterEach(async () => {
    Global.Path.config = savedConfig
    if (savedSsh === undefined) delete process.env.SSH_CONNECTION
    else process.env.SSH_CONNECTION = savedSsh
    await fs.rm(root, { recursive: true, force: true })
  })

  const write = (mirror: unknown) => fs.writeFile(path.join(root, "oc.json"), JSON.stringify({ mirror }))

  test("mirrors are off until turned on here", async () => {
    expect(await OcMirror.refusal()).toBe("mirror-disabled")
    await write({ accept: "yes" })
    expect(await OcMirror.refusal()).toBe("mirror-disabled")
    await write({ accept: true })
    expect(await OcMirror.refusal()).toBeUndefined()
  })

  test("an ssh caller outside the user's tailnet devices is refused", async () => {
    await write({ accept: true })
    // TEST-NET-1: never a tailnet address, and refused also when Tailscale is unavailable.
    process.env.SSH_CONNECTION = "192.0.2.10 50000 100.64.0.2 22"
    expect(await OcMirror.refusal()).toBe("caller-not-allowed")
  })
})
