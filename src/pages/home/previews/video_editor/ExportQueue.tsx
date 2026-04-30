import { For, Show } from "solid-js"
import { ExportSegment, formatClipTime } from "../clipper/types"

export const ExportQueue = (props: {
  segments: ExportSegment[]
  rangeSeconds: number
  bitrate: string
  rangeProbeStatus: string
  indexStatus: string
  ffmpegStatus: string
  exporting: boolean
  onBuildAss: () => void
  onProbeRange: () => void
  onBuildIndex: () => void
  onLoadFfmpeg: () => void
  onExportMp4: () => void
}) => (
  <section class="video-editor-pane">
    <div class="video-editor-export-summary">
      <span>时长 {formatClipTime(props.rangeSeconds)}</span>
      <span>码率 {props.bitrate}</span>
    </div>
    <div class="video-editor-export-actions">
      <button type="button" onClick={props.onBuildAss}>
        导出 ASS
      </button>
      <button type="button" onClick={props.onProbeRange}>
        检查 Range
      </button>
      <button type="button" onClick={props.onBuildIndex}>
        缓存索引
      </button>
      <button type="button" onClick={props.onLoadFfmpeg}>
        加载 FFmpeg
      </button>
      <button
        type="button"
        disabled={props.exporting}
        onClick={props.onExportMp4}
      >
        {props.exporting ? "正在导出" : "导出 MP4"}
      </button>
    </div>
    <Show when={props.rangeProbeStatus}>
      <p class="video-editor-note">{props.rangeProbeStatus}</p>
    </Show>
    <Show when={props.indexStatus}>
      <p class="video-editor-note">{props.indexStatus}</p>
    </Show>
    <Show when={props.ffmpegStatus}>
      <p class="video-editor-note">{props.ffmpegStatus}</p>
    </Show>
    <div class="video-editor-segments">
      <For each={props.segments}>
        {(item) => (
          <article class="video-editor-segment">
            <span>#{item.index + 1}</span>
            <span>
              {formatClipTime(item.start)} - {formatClipTime(item.end)}
            </span>
            <progress value={item.progress} max="100" />
          </article>
        )}
      </For>
    </div>
  </section>
)
