import { SubtitleItem } from "./types"

export const parseAsrTranscript = (
  text: string,
  clipStart: number,
): SubtitleItem[] =>
  text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, index) => {
      const start = clipStart + index * 3
      return {
        id: `asr-${Date.now()}-${index}`,
        start,
        end: start + 3,
        text: line,
        enabled: true,
        source: "asr" as const,
      }
    })
