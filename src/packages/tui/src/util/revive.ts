import { InstallationDisplayVersion, InstallationVersion } from "@opencode-ai/core/installation/version"
import { Locale } from "./locale"

// Same oc version as the sidebar footer; InstallationVersion is the incorporated upstream release.
export function reviveVersions() {
  return `oc v${InstallationDisplayVersion.split("-")[0]} . OpenCode v${InstallationVersion}`
}

export function reviveText(at: number, versions: string) {
  const time = Locale.time(at)
  return `[oc revived at ${time} . ${versions}]`
}
