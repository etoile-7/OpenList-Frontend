export type DanmakuItem = {
  id: string
  time: number
  mode: number
  color: string
  text: string
  enabled: boolean
  removed?: boolean
}

export type SubtitleItem = {
  id: string
  start: number
  end: number
  text: string
  enabled: boolean
  source: "manual" | "asr" | "file"
}

export type ClipRange = {
  start: number
  end: number
}

export type ExportSegment = {
  index: number
  start: number
  end: number
  status: "pending" | "running" | "done" | "failed"
  progress: number
  error?: string
}

export type EditorStyleSettings = {
  width: number
  height: number
  danmakuOffset: number
  danmakuFontSize: number
  subtitleFontSize: number
  subtitleMarginV: number
}

export type EditorTab = "danmaku" | "subtitle" | "speech" | "style" | "export"

export const formatClipTime = (seconds: number) => {
  if (!Number.isFinite(seconds) || seconds < 0) {
    seconds = 0
  }
  const total = Math.floor(seconds)
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  const ms = Math.floor((seconds - total) * 10)
  const base =
    h > 0
      ? `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`
      : `${m}:${s.toString().padStart(2, "0")}`
  return `${base}.${ms}`
}

export const clampTime = (value: number, max: number) => {
  if (!Number.isFinite(value)) return 0
  return Math.min(Math.max(value, 0), Math.max(max, 0))
}
