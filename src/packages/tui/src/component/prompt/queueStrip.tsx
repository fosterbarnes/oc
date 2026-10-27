import { MouseButton, type BoxRenderable, type RGBA } from "@opentui/core"
import { createMemo, createSignal, Index, Show } from "solid-js"
import { selectedForeground, useTheme } from "../../context/theme"
import { Locale } from "../../util/locale"
import { queueEntryTitle, type QueueEntry } from "../dialogQueue"

const MAX_ROWS = 3
const BADGE = " QUEUED "

// Prompts waiting in the session queue, shown above the prompt until they are sent. Entries being
// sent are about to appear as messages, and scheduled ones wait for their time, so both stay out.
export function QueueStrip(props: { entries: QueueEntry[]; color: RGBA; indent: number; onOpen: () => void }) {
  const { theme } = useTheme()
  const [width, setWidth] = createSignal(0)
  const waiting = createMemo(() =>
    props.entries.filter((entry) => entry.state === "pending" && entry.runAt === undefined),
  )
  const badgeFg = createMemo(() => selectedForeground(theme, props.color))
  const textWidth = () => Math.max(1, width() - BADGE.length - 1)

  return (
    <Show when={waiting().length > 0}>
      <box
        width="100%"
        flexShrink={0}
        paddingLeft={props.indent}
        onSizeChange={function (this: BoxRenderable) {
          const width = this.width - props.indent
          queueMicrotask(() => setWidth(width))
        }}
        onMouseUp={(event) => {
          if (event.button === MouseButton.LEFT) props.onOpen()
        }}
      >
        {/* Index, not For: each poll brings new entry objects, and rows should update in place. */}
        <Index each={waiting().slice(0, MAX_ROWS)}>
          {(entry) => (
            <text selectable={false} wrapMode="none" fg={theme.textMuted}>
              <span style={{ bg: props.color, fg: badgeFg(), bold: true }}>{BADGE}</span>{" "}
              {Locale.truncate(queueEntryTitle(entry()), textWidth())}
            </text>
          )}
        </Index>
        <Show when={waiting().length > MAX_ROWS}>
          <text selectable={false} fg={theme.textMuted}>{`+${waiting().length - MAX_ROWS} more`}</text>
        </Show>
      </box>
    </Show>
  )
}
