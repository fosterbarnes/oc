import { expect, test } from "bun:test"
import {
  brewVersion,
  classifyPwshPath,
  isGithubHost,
  latestNugetVersion,
  parseBrewOutdated,
  parseDotnetToolVersion,
  parsePkgInfoVersion,
  parseReleaseTag,
  pkgSignatureProblem,
} from "../src/pwshUpdateMac"

// `pkgutil --check-signature` on powershell-7.6.9-osx-arm64.pkg (2026-11-08), fingerprints trimmed.
const SIGNED = `Package "p.pkg":
   Status: signed by a developer certificate issued by Apple for distribution
   Notarization: trusted by the Apple notary service
   Signed with a trusted timestamp on: 2026-10-25 03:23:35 +0000
   Certificate Chain:
    1. Developer ID Installer: Microsoft Corporation (UBF8T346G9)
       Expires: 2027-02-01 22:12:15 +0000
    2. Developer ID Certification Authority
       Expires: 2027-02-01 22:12:15 +0000
    3. Apple Root CA
       Expires: 2035-02-09 21:40:36 +0000
`

test("accepts Microsoft's notarized package", () => {
  expect(pkgSignatureProblem(SIGNED)).toBeUndefined()
})

test("rejects an unsigned, unnotarized, or foreign package", () => {
  expect(pkgSignatureProblem(`Package "p.pkg":\n   Status: no signature\n`)).toBe(
    "signature check failed: no signature",
  )
  expect(pkgSignatureProblem(SIGNED.replace(/^\s*Notarization:.*\n/m, ""))).toBe("package is not notarized")
  expect(pkgSignatureProblem(SIGNED.replace("Microsoft Corporation (UBF8T346G9)", "Evil Corp (ABCDE12345)"))).toBe(
    "signature signer 'Developer ID Installer: Evil Corp (ABCDE12345)' is not Microsoft",
  )
})

test("classifies each install method by its real path", () => {
  const home = "/Users/me"
  expect(classifyPwshPath("/usr/local/microsoft/powershell/7/pwsh", home, true).method).toBe("pkg")
  expect(classifyPwshPath("/usr/local/microsoft/powershell/7/pwsh", home, false).method).toBe("archive")
  expect(classifyPwshPath("/opt/homebrew/Cellar/powershell/7.6.9/libexec/pwsh", home, true)).toEqual({
    method: "brew",
    path: "/opt/homebrew/Cellar/powershell/7.6.9/libexec/pwsh",
    brew: "/opt/homebrew/bin/brew",
  })
  expect(classifyPwshPath("/Users/me/.dotnet/tools/pwsh", home, true).method).toBe("dotnet")
  expect(classifyPwshPath("/opt/local/bin/pwsh", home, true).method).toBe("unknown")
})

test("reads versions from each source", () => {
  expect(parsePkgInfoVersion("package-id: com.microsoft.powershell\nversion: 7.6.5\nvolume: /\n")).toBe("7.6.5")
  expect(parseReleaseTag({ ReleaseTag: "v7.6.9" })).toBe("7.6.9")
  expect(() => parseReleaseTag({ ReleaseTag: "v7.7.0-preview.4" })).toThrow("unexpected release tag")
  expect(
    parseDotnetToolVersion("Package Id      Version      Commands\n---\npowershell      7.6.5        pwsh\n"),
  ).toBe("7.6.5")
  expect(latestNugetVersion({ versions: ["7.4.20", "7.6.9", "7.7.0-preview.4", "7.6.10"] })).toBe("7.6.10")
  expect(brewVersion("7.6.9_1")).toBe("7.6.9")
})

test("parses brew outdated JSON around stderr noise", () => {
  const outdated = `Warning: something\n{"formulae":[{"name":"powershell","installed_versions":["7.6.5"],"current_version":"7.6.9_1","pinned":false}],"casks":[]}`
  expect(parseBrewOutdated(outdated)).toBe("7.6.9")
  expect(parseBrewOutdated(`{\n  "formulae": [],\n  "casks": []\n}`)).toBeUndefined()
})

test("allows only GitHub release download hosts", () => {
  expect(isGithubHost("release-assets.githubusercontent.com")).toBe(true)
  expect(isGithubHost("GitHub.com")).toBe(true)
  expect(isGithubHost("github.com.evil.example")).toBe(false)
})
