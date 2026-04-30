import { For, Show } from "solid-js"
import { SubtitleItem, formatClipTime } from "../clipper/types"

export const SubtitleList = (props: {
  items: SubtitleItem[]
  selectedId: string
  onSeek: (time: number) => void
  onAdd: () => void
  onSelect: (id: string) => void
  onUpdate: (id: string, patch: Partial<SubtitleItem>) => void
  onRemove: (id: string) => void
  onToggle: (id: string) => void
  onShift: (offset: number) => void
}) => (
  <section class="video-editor-pane">
    <div class="video-editor-subtitle-toolbar">
      <button type="button" onClick={props.onAdd}>
        新增字幕
      </button>
      <button type="button" onClick={() => props.onShift(-0.5)}>
        -0.5s
      </button>
      <button type="button" onClick={() => props.onShift(0.5)}>
        +0.5s
      </button>
    </div>
    <Show
      when={props.items.length > 0}
      fallback={<p class="video-editor-empty">当前还没有字幕轨</p>}
    >
      <div class="video-editor-list">
        <For each={props.items}>
          {(item) => (
            <article
              class="video-editor-list__item video-editor-subtitle-item"
              classList={{
                "is-disabled": !item.enabled,
                "is-selected": props.selectedId === item.id,
              }}
            >
              <div class="video-editor-subtitle-row">
                <button
                  class="video-editor-time"
                  type="button"
                  onClick={() => props.onSeek(item.start)}
                >
                  {formatClipTime(item.start)}
                </button>
                <span class="video-editor-badge">
                  {item.source === "asr"
                    ? "语音"
                    : item.source === "file"
                      ? "文件"
                      : "手动"}
                </span>
              </div>
              <div class="video-editor-subtitle-row">
                <label>
                  开始
                  <input
                    type="number"
                    min="0"
                    step="0.1"
                    value={item.start.toFixed(1)}
                    onInput={(e) =>
                      props.onUpdate(item.id, {
                        start: Number.parseFloat(e.currentTarget.value || "0"),
                      })
                    }
                  />
                </label>
                <label>
                  结束
                  <input
                    type="number"
                    min="0"
                    step="0.1"
                    value={item.end.toFixed(1)}
                    onInput={(e) =>
                      props.onUpdate(item.id, {
                        end: Number.parseFloat(e.currentTarget.value || "0"),
                      })
                    }
                  />
                </label>
              </div>
              <textarea
                value={item.text}
                onFocus={() => props.onSelect(item.id)}
                onInput={(e) =>
                  props.onUpdate(item.id, { text: e.currentTarget.value })
                }
              />
              <div class="video-editor-list__actions">
                <button type="button" onClick={() => props.onToggle(item.id)}>
                  {item.enabled ? "禁用" : "启用"}
                </button>
                <button type="button" onClick={() => props.onRemove(item.id)}>
                  删除
                </button>
              </div>
            </article>
          )}
        </For>
      </div>
    </Show>
  </section>
)
