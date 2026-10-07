import { InstallationDisplayVersion, InstallationVersion } from "@opencode-ai/core/installation/version"

// Same oc version as the sidebar footer; InstallationVersion is the incorporated upstream release.
export function reviveVersions() {
  return `oc v${InstallationDisplayVersion.split("-")[0]} . OpenCode v${InstallationVersion}`
}

export function reviveText(at: number, versions: string) {
  const time = new Date(at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
  return `[oc revived at ${time} . ${versions}]`
}
