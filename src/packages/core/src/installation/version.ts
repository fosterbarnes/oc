declare global {
  const OPENCODE_VERSION: string
  const OPENCODE_DISPLAY_VERSION: string
  const OPENCODE_CHANNEL: string
}

export const InstallationVersion = typeof OPENCODE_VERSION === "string" ? OPENCODE_VERSION : "local"
// Custom fork: keep the maintenance display version separate from the public release version.
export const InstallationDisplayVersion =
  typeof OPENCODE_DISPLAY_VERSION === "string" ? OPENCODE_DISPLAY_VERSION : InstallationVersion
export const InstallationChannel = typeof OPENCODE_CHANNEL === "string" ? OPENCODE_CHANNEL : "local"
export const InstallationLocal = InstallationChannel === "local"
