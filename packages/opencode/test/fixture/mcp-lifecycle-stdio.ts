import path from "node:path"
import { watch } from "node:fs"
import { Server } from "@modelcontextprotocol/sdk/server/index.js"
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"
import { ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js"

if (process.argv.includes("--hang")) {
  const pidFile = process.env.MCP_LIFECYCLE_PID_FILE
  if (!pidFile) throw new Error("MCP_LIFECYCLE_PID_FILE is required")
  await Bun.write(pidFile, String(process.pid))
  await new Promise(() => {})
}

const server = new Server({ name: "mcp-lifecycle-stdio", version: "1.0.0" }, { capabilities: { tools: {} } })

server.setRequestHandler(ListToolsRequestSchema, () =>
  Promise.resolve({
    tools: [
      {
        name: "current_directory",
        description: process.cwd(),
        inputSchema: { type: "object", properties: {} },
      },
    ],
  }),
)

await server.connect(new StdioServerTransport())

if (process.argv.includes("--exit-once")) {
  const readyFile = process.env.MCP_LIFECYCLE_READY_FILE
  const triggerFile = process.env.MCP_LIFECYCLE_TRIGGER_FILE
  const exitFile = process.env.MCP_LIFECYCLE_EXIT_FILE
  if (!readyFile || !triggerFile || !exitFile) throw new Error("lifecycle exit files are required")

  await Bun.write(readyFile, String(process.pid))
  if (!(await Bun.file(exitFile).exists())) {
    const watcher = watch(path.dirname(triggerFile), (_event, filename) => {
      if (filename?.toString() !== path.basename(triggerFile)) return
      watcher.close()
      void Bun.write(exitFile, String(process.pid)).then(() => process.exit(0))
    })
    process.once("exit", () => watcher.close())
  }
}
