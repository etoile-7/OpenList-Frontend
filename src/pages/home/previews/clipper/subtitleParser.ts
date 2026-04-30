import { SubtitleItem } from "./types"

export type SubtitleFormat = "srt" | "vtt" | "ass"

const parseTimestamp = (value: string) => {
  const normalized = value.trim().replace(",", ".")
  const parts = normalized.split(":")
  const seconds = Number.parseFloat(parts.pop() || "0")
  const minutes = Number.parseInt(parts.pop() || "0", 10)
  const hours = Number.parseInt(parts.pop() || "0", 10)
  return hours * 3600 + minutes * 60 + seconds
}

const parseSrtOrVtt = (
  text: string,
  format: SubtitleFormat,
): SubtitleItem[] => {
  const normalized = text
    .replace(/\r/g, "")
    .replace(/^WEBVTT[^\n]*\n/i, "")
    .trim()
  if (!normalized) return []

  return normalized.split(/\n{2,}/).flatMap((block, index) => {
    const lines = block
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
    const timeLineIndex = lines.findIndex((line) => line.includes("-->"))
    if (timeLineIndex < 0) return []

    const [startRaw, endRaw] = lines[timeLineIndex].split("-->")
    const end = endRaw?.trim().split(/\s+/)[0]
    if (!startRaw || !end) return []

    return [
      {
        id: `${format}-${index}-${startRaw}`,
        start: parseTimestamp(startRaw),
        end: parseTimestamp(end),
        text: lines.slice(timeLineIndex + 1).join("\n"),
        enabled: true,
        source: "file" as const,
      },
    ]
  })
}

const parseAssTime = (value: string) => parseTimestamp(value)

const cleanupAssText = (value: string) =>
  value
    .replace(/\{[^}]*\}/g, "")
    .replace(/\\N/g, "\n")
    .replace(/\\h/g, " ")

const parseAss = (text: string): SubtitleItem[] =>
  text
    .split(/\r?\n/)
    .filter((line) => line.startsWith("Dialogue:"))
    .flatMap((line, index) => {
      const content = line.slice("Dialogue:".length).trim()
      const parts = content.split(",")
      if (parts.length < 10) return []
      const start = parts[1]
      const end = parts[2]
      const subtitleText = parts.slice(9).join(",")
      return [
        {
          id: `ass-${index}-${start}`,
          start: parseAssTime(start),
          end: parseAssTime(end),
          text: cleanupAssText(subtitleText),
          enabled: true,
          source: "file" as const,
        },
      ]
    })

export const parseSubtitle = (
  text: string,
  format: SubtitleFormat,
): SubtitleItem[] => {
  switch (format) {
    case "ass":
      return parseAss(text)
    case "srt":
    case "vtt":
    default:
      return parseSrtOrVtt(text, format)
  }
}

export const fetchSubtitle = async (url: string, format: SubtitleFormat) => {
  const res = await fetch(url, { credentials: "include" })
  if (!res.ok) {
    throw new Error(`字幕下载失败：${res.status}`)
  }
  return parseSubtitle(await res.text(), format)
}
