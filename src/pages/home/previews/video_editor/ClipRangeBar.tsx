import { Accessor } from "solid-js"
import { clampTime, ClipRange, formatClipTime } from "../clipper/types"

export const ClipRangeBar = (props: {
  range: Accessor<ClipRange>
  duration: Accessor<number>
  currentTime: Accessor<number>
  onRangeChange: (range: ClipRange) => void
  onSeek: (time: number) => void
}) => {
  const update = (key: keyof ClipRange, value: string) => {
    const duration = props.duration()
    const seconds = clampTime(Number.parseFloat(value || "0"), duration)
    const next = { ...props.range(), [key]: seconds }
    if (key === "start" && next.start > next.end) next.end = next.start
    if (key === "end" && next.end < next.start) next.start = next.end
    props.onRangeChange(next)
  }

  const setFromCurrent = (key: keyof ClipRange) => {
    update(key, props.currentTime().toFixed(1))
  }

  return (
    <section class="video-editor-range">
      <div class="video-editor-range__times">
        <span>{formatClipTime(props.range().start)}</span>
        <span>{formatClipTime(props.currentTime())}</span>
        <span>{formatClipTime(props.range().end)}</span>
      </div>
      <div class="video-editor-range__bar">
        <span
          class="video-editor-range__fill"
          style={{
            left: `${
              props.duration()
                ? (props.range().start / props.duration()) * 100
                : 0
            }%`,
            width: `${
              props.duration()
                ? ((props.range().end - props.range().start) /
                    props.duration()) *
                  100
                : 0
            }%`,
          }}
        />
      </div>
      <div class="video-editor-range__inputs">
        <label>
          开始
          <input
            type="number"
            min="0"
            step="0.1"
            value={props.range().start.toFixed(1)}
            onInput={(e) => update("start", e.currentTarget.value)}
          />
        </label>
        <button type="button" onClick={() => setFromCurrent("start")}>
          取当前
        </button>
        <label>
          结束
          <input
            type="number"
            min="0"
            step="0.1"
            value={props.range().end.toFixed(1)}
            onInput={(e) => update("end", e.currentTarget.value)}
          />
        </label>
        <button type="button" onClick={() => setFromCurrent("end")}>
          取当前
        </button>
      </div>
      <div class="video-editor-range__actions">
        <button type="button" onClick={() => props.onSeek(props.range().start)}>
          到开始
        </button>
        <button type="button" onClick={() => props.onSeek(props.range().end)}>
          到结束
        </button>
      </div>
    </section>
  )
}
