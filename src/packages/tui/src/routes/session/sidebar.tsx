import { InstallationChannel } from "@opencode-ai/core/installation/version"
import { createMemo, Show } from "solid-js"
import { useTerminalDimensions } from "@opentui/solid"
import { useTuiConfig } from "../../config"
import { useProject } from "../../context/project"
import { useSync } from "../../context/sync"
import { useTheme } from "../../context/theme"
import { WorkspaceLabel } from "../../component/workspace-label"
import { usePluginRuntime } from "../../plugin/runtime"
import { getScrollAcceleration } from "../../util/scroll"
import { SidebarTools, SidebarToolsFooter } from "./sidebar-tools/sidebarTools"

export function Sidebar(props: { sessionID: string; horizontal?: boolean }) {
  const pluginRuntime = usePluginRuntime()
  const project = useProject()
  const sync = useSync()
  const { theme } = useTheme()
  const tuiConfig = useTuiConfig()
  const dimensions = useTerminalDimensions()
  const session = createMemo(() => sync.session.get(props.sessionID))
  const workspace = () => {
    const workspaceID = session()?.workspaceID
    if (!workspaceID) return
    return project.workspace.get(workspaceID)
  }
  const scrollAcceleration = createMemo(() => getScrollAcceleration(tuiConfig))
  const horizontalMaxHeight = createMemo(() => Math.max(8, Math.floor(dimensions().height / 2)))

  return (
    <Show when={session()}>
      <box
        backgroundColor={theme.backgroundPanel}
        width={props.horizontal ? "100%" : 42}
        height={props.horizontal ? undefined : "100%"}
        maxHeight={props.horizontal ? horizontalMaxHeight() : undefined}
        flexShrink={0}
        paddingTop={1}
        paddingBottom={1}
        paddingLeft={2}
        paddingRight={2}
        position="relative"
      >
        <scrollbox
          flexGrow={1}
          scrollAcceleration={scrollAcceleration()}
          verticalScrollbarOptions={{
            // The top bar's track would sit flush against the message scrollbar below it
            visible: !props.horizontal,
            trackOptions: {
              backgroundColor: theme.background,
              foregroundColor: theme.borderActive,
            },
          }}
        >
          <box
            flexShrink={0}
            gap={props.horizontal ? 3 : 1}
            rowGap={1}
            paddingRight={props.horizontal ? 0 : 1}
            flexDirection={props.horizontal ? "row" : "column"}
            flexWrap={props.horizontal ? "wrap" : "no-wrap"}
          >
            <pluginRuntime.Slot
              name="sidebar_title"
              mode="single_winner"
              session_id={props.sessionID}
              title={session()!.title}
              share_url={session()!.share?.url}
            >
              <box paddingRight={1}>
                <text fg={theme.text}>
                  <b>
                    <Show when={session()!.sessionFailed || session()!.sessionComplete}>
                      <span style={{ fg: session()!.sessionFailed ? theme.error : theme.success }}>
                        {session()!.sessionFailed ? "\u2717" : "\u2713"}
                      </span>{" "}
                    </Show>
                    {session()!.title}
                  </b>
                </text>
                <Show when={InstallationChannel !== "latest"}>
                  <text fg={theme.textMuted}>{props.sessionID}</text>
                </Show>
                <Show when={session()!.workspaceID}>
                  <text fg={theme.textMuted}>
                    <Show
                      when={workspace()}
                      fallback={<WorkspaceLabel type="unknown" name={session()!.workspaceID!} status="error" icon />}
                    >
                      {(item) => (
                        <WorkspaceLabel
                          type={item().type}
                          name={item().name}
                          status={project.workspace.status(item().id) ?? "error"}
                          icon
                        />
                      )}
                    </Show>
                  </text>
                </Show>
                <Show when={session()!.share?.url}>
                  <text fg={theme.textMuted}>{session()!.share!.url}</text>
                </Show>
              </box>
            </pluginRuntime.Slot>
            <SidebarTools sessionID={props.sessionID}>
              <pluginRuntime.Slot name="sidebar_content" session_id={props.sessionID} />
            </SidebarTools>
          </box>
        </scrollbox>

        <box
          flexShrink={0}
          gap={props.horizontal ? 3 : 1}
          paddingTop={1}
          flexDirection={props.horizontal ? "row" : "column"}
        >
          <SidebarToolsFooter sessionID={props.sessionID} />
          <pluginRuntime.Slot name="sidebar_footer" session_id={props.sessionID} />
        </box>
      </box>
    </Show>
  )
}
