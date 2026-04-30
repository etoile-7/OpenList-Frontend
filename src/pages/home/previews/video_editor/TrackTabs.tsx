import { For } from "solid-js"
import { EditorTab } from "../clipper/types"

const tabs: { key: EditorTab; label: string }[] = [
  { key: "danmaku", label: "弹幕" },
  { key: "subtitle", label: "字幕" },
  { key: "speech", label: "语音" },
  { key: "style", label: "样式" },
  { key: "export", label: "导出" },
]

export const TrackTabs = (props: {
  active: EditorTab
  onChange: (tab: EditorTab) => void
}) => (
  <div class="video-editor-tabs" role="tablist">
    <For each={tabs}>
      {(tab) => (
        <button
          type="button"
          role="tab"
          classList={{ "is-active": props.active === tab.key }}
          onClick={() => props.onChange(tab.key)}
        >
          {tab.label}
        </button>
      )}
    </For>
  </div>
)
