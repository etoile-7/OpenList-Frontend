import { For, Show, createMemo } from "solid-js"
import { filterDanmakuItems } from "../clipper/danmakuXml"
import { ClipRange, DanmakuItem, formatClipTime } from "../clipper/types"

export const DanmakuList = (props: {
  items: DanmakuItem[]
  range: ClipRange
  keyword: string
  onlyRange: boolean
  onlyHidden: boolean
  loading: boolean
  error: string
  onKeywordChange: (value: string) => void
  onOnlyRangeChange: (value: boolean) => void
  onOnlyHiddenChange: (value: boolean) => void
  onSeek: (time: number) => void
  onToggle: (id: string) => void
  onRemove: (id: string) => void
  onRestore: (id: string) => void
  onDisableOutsideRange: () => void
}) => {
  const filtered = createMemo(() =>
    filterDanmakuItems(props.items, {
      keyword: props.keyword,
      range: props.range,
      onlyRange: props.onlyRange,
      onlyHidden: props.onlyHidden,
    }),
  )

  return (
    <section class="video-editor-pane">
      <div class="video-editor-search">
        <input
          value={props.keyword}
          placeholder="搜索弹幕"
          onInput={(e) => props.onKeywordChange(e.currentTarget.value)}
        />
        <label>
          <input
            type="checkbox"
            checked={props.onlyRange}
            onChange={(e) => props.onOnlyRangeChange(e.currentTarget.checked)}
          />
          当前片段
        </label>
        <label>
          <input
            type="checkbox"
            checked={props.onlyHidden}
            onChange={(e) => props.onOnlyHiddenChange(e.currentTarget.checked)}
          />
          已隐藏
        </label>
      </div>
      <div class="video-editor-bulk">
        <button type="button" onClick={props.onDisableOutsideRange}>
          隐藏片段外弹幕
        </button>
        <span>{filtered().length} 条</span>
      </div>
      <Show when={props.loading}>
        <p class="video-editor-empty">正在读取 XML（弹幕文件）</p>
      </Show>
      <Show when={props.error}>
        <p class="video-editor-error">{props.error}</p>
      </Show>
      <Show when={!props.loading && !props.error && filtered().length === 0}>
        <p class="video-editor-empty">没有可显示的弹幕</p>
      </Show>
      <div class="video-editor-list">
        <For each={filtered()}>
          {(item) => (
            <article
              class="video-editor-list__item"
              classList={{
                "is-disabled": !item.enabled || item.removed,
              }}
            >
              <button
                class="video-editor-time"
                type="button"
                onClick={() => props.onSeek(item.time)}
              >
                {formatClipTime(item.time)}
              </button>
              <p>{item.text}</p>
              <div class="video-editor-list__actions">
                <button type="button" onClick={() => props.onToggle(item.id)}>
                  {item.enabled && !item.removed ? "禁用" : "启用"}
                </button>
                <Show
                  when={item.removed}
                  fallback={
                    <button
                      type="button"
                      onClick={() => props.onRemove(item.id)}
                    >
                      删除
                    </button>
                  }
                >
                  <button
                    type="button"
                    onClick={() => props.onRestore(item.id)}
                  >
                    恢复
                  </button>
                </Show>
              </div>
            </article>
          )}
        </For>
      </div>
    </section>
  )
}
