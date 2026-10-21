import { UI } from "../ui"
import * as prompts from "@clack/prompts"
import { InstallationDisplayVersion } from "@opencode-ai/core/installation/version"
import { OcRelease } from "@opencode-ai/core/util/ocRelease"

// Custom fork: oc installs updates from inside the TUI (/update), which stops oc, swaps the
// binaries, and reopens the terminal. This command only reports whether an update exists.
export const UpgradeCommand = {
  command: "upgrade",
  aliases: ["update"],
  describe: "check for a newer oc release",
  handler: async () => {
    UI.empty()
    UI.println(UI.logo("  "))
    UI.empty()
    prompts.intro("Upgrade")
    const release = await OcRelease.lookup().catch((error: unknown) => {
      prompts.log.error(error instanceof Error ? error.message : String(error))
    })
    if (!release) return prompts.outro("Done")
    if (!OcRelease.isNewer(release.version, InstallationDisplayVersion)) {
      prompts.log.info(`oc v${InstallationDisplayVersion} is the latest release`)
      return prompts.outro("Done")
    }
    prompts.log.info(`oc v${release.version} is available (installed: v${InstallationDisplayVersion})`)
    prompts.outro("Run /update inside oc to install it")
  },
}
