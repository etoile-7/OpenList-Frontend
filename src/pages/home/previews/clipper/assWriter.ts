import {
  ClipRange,
  DanmakuItem,
  EditorStyleSettings,
  SubtitleItem,
} from "./types"

export type WriteAssOptions = {
  danmaku: DanmakuItem[]
  subtitles?: SubtitleItem[]
  range: ClipRange
  style?: Partial<EditorStyleSettings>
}

const assTime = (seconds: number) => {
  seconds = Math.max(0, seconds)
  const total = Math.floor(seconds)
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  const cs = Math.floor((seconds - total) * 100)
  return `${h}:${m.toString().padStart(2, "0")}:${s
    .toString()
    .padStart(2, "0")}.${cs.toString().padStart(2, "0")}`
}

const escapeText = (text: string) =>
  text.replace(/\\/g, "\\\\").replace(/[{}]/g, "").replace(/\r?\n/g, "\\N")

const assColor = (color: string) => {
  const normalized = color.replace("#", "").padStart(6, "f").slice(-6)
  const rr = normalized.slice(0, 2)
  const gg = normalized.slice(2, 4)
  const bb = normalized.slice(4, 6)
  return `${bb}${gg}${rr}`
}

const header = ({
  width,
  height,
  danmakuFontSize,
  subtitleFontSize,
  subtitleMarginV,
}: EditorStyleSettings) => `[Script Info]
ScriptType: v4.00+
WrapStyle: 2
ScaledBorderAndShadow: yes
PlayResX: ${width}
PlayResY: ${height}

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Danmaku,Microsoft YaHei,${danmakuFontSize},&H00FFFFFF,&H00FFFFFF,&H66000000,&H66000000,0,0,0,0,100,100,0,0,1,2,0,7,20,20,20,1
Style: Subtitle,Microsoft YaHei,${subtitleFontSize},&H00FFFFFF,&H00FFFFFF,&HAA000000,&HAA000000,0,0,0,0,100,100,0,0,1,3,0,2,40,40,${subtitleMarginV},1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text`

const normalizeStyle = (
  style: Partial<EditorStyleSettings> = {},
): EditorStyleSettings => ({
  width: Math.max(320, Math.round(style.width || 1280)),
  height: Math.max(180, Math.round(style.height || 720)),
  danmakuOffset: Number.isFinite(style.danmakuOffset)
    ? Number(style.danmakuOffset)
    : 0,
  danmakuFontSize: Math.max(12, Math.round(style.danmakuFontSize || 34)),
  subtitleFontSize: Math.max(12, Math.round(style.subtitleFontSize || 42)),
  subtitleMarginV: Math.max(0, Math.round(style.subtitleMarginV || 42)),
})

export const writeAss = ({
  danmaku,
  subtitles = [],
  range,
  style,
}: WriteAssOptions) => {
  const normalizedStyle = normalizeStyle(style)
  const { width, height, danmakuOffset, danmakuFontSize } = normalizedStyle
  const clipStart = Math.max(0, range.start)
  const clipEnd = Math.max(clipStart, range.end)
  const clipDuration = Math.max(0.1, clipEnd - clipStart)
  const rowHeight = Math.max(24, danmakuFontSize + 8)
  const rows = Math.max(6, Math.floor((height - 120) / rowHeight))
  const lines: string[] = [header(normalizedStyle)]

  danmaku
    .filter(
      (item) =>
        item.enabled &&
        !item.removed &&
        item.time >= clipStart &&
        item.time <= clipEnd,
    )
    .sort((a, b) => a.time - b.time)
    .forEach((item, index) => {
      const start = Math.max(0, item.time - clipStart + danmakuOffset)
      if (start > clipDuration) return
      const fixed = item.mode === 4 || item.mode === 5
      const duration = fixed ? 4 : 6
      const end = Math.min(clipDuration, start + duration)
      const row = index % rows
      const y = Math.round(24 + row * rowHeight)
      const color = assColor(item.color)
      let placement = `\\move(${width + 40},${y},-${width},${y})`
      let layer = 0

      if (item.mode === 5) {
        placement = `\\an8\\pos(${Math.floor(width / 2)},${y})`
        layer = 1
      } else if (item.mode === 4) {
        placement = `\\an2\\pos(${Math.floor(width / 2)},${height - y})`
        layer = 1
      }

      lines.push(
        `Dialogue: ${layer},${assTime(start)},${assTime(
          end,
        )},Danmaku,,0,0,0,,{\\c&H${color}&${placement}}${escapeText(
          item.text,
        )}`,
      )
    })

  subtitles
    .filter(
      (item) =>
        item.enabled &&
        item.end > clipStart &&
        item.start < clipEnd &&
        item.text.trim().length > 0,
    )
    .sort((a, b) => a.start - b.start)
    .forEach((item) => {
      const start = Math.max(0, item.start - clipStart)
      const end = Math.min(clipDuration, item.end - clipStart)
      if (end <= start) return
      lines.push(
        `Dialogue: 2,${assTime(start)},${assTime(
          end,
        )},Subtitle,,0,0,0,,${escapeText(item.text)}`,
      )
    })

  return `${lines.join("\n")}\n`
}
