// Every export in this file must be a plugin function — `getLegacyPlugins`
// (src/plugin/index.ts) throws on anything else. Test constants live in
// `agent-plugin.constants.ts`.
import { ConfigV1 } from "@opencode-ai/core/v1/config/config"

export default async () => ({
  config: async (cfg: ConfigV1.Info) => {
    cfg.agent = cfg.agent ?? {}
    cfg.agent["plugin_added"] = {
      description: "Added by a plugin via the config hook",
      mode: "subagent",
    }
    const modified = cfg.agent["plugin_modified"]
    if (modified) {
      modified.prompt = "Plugin prompt."
      modified.model = "openai/plugin-model"
      delete modified.temperature
      modified.options ??= {}
      modified.options["plugin"] = true
      delete modified.options["removed"]
      if (typeof modified.permission === "object") modified.permission.edit = "deny"
    }
    delete cfg.agent["plugin_removed"]
  },
})
