import { writeAss } from "./assWriter"
import { transcodeFlvSegment } from "./ffmpeg"
import {
  ClipRange,
  DanmakuItem,
  EditorStyleSettings,
  ExportSegment,
  SubtitleItem,
} from "./types"
import type { FFmpeg } from "@ffmpeg/ffmpeg"

export type BuildExportSegmentsOptions = {
  range: ClipRange
  segmentLength: number
}

export type BuildAssForSegmentOptions = {
  segment: ExportSegment
  danmaku: DanmakuItem[]
  subtitles: SubtitleItem[]
  style?: Partial<EditorStyleSettings>
}

export type ExportSegmentInput = {
  segment: ExportSegment
  flvBytes: Uint8Array
  trimStart?: number
}

export type RunSegmentExportOptions = {
  ffmpeg: FFmpeg
  input: ExportSegmentInput
  danmaku: DanmakuItem[]
  subtitles: SubtitleItem[]
  style?: Partial<EditorStyleSettings>
  videoBitrate?: string
  signal?: AbortSignal
  onProgress?: (segment: ExportSegment) => void
}

export const buildExportSegments = ({
  range,
  segmentLength,
}: BuildExportSegmentsOptions): ExportSegment[] => {
  const start = Math.max(0, range.start)
  const end = Math.max(start, range.end)
  const segments: ExportSegment[] = []
  let cursor = start
  let index = 0

  while (cursor < end) {
    const segmentEnd = Math.min(end, cursor + segmentLength)
    segments.push({
      index,
      start: cursor,
      end: segmentEnd,
      status: "pending",
      progress: 0,
    })
    cursor = segmentEnd
    index += 1
  }

  return segments
}

export const buildAssForSegment = ({
  segment,
  danmaku,
  subtitles,
  style,
}: BuildAssForSegmentOptions) =>
  writeAss({
    danmaku,
    subtitles,
    range: {
      start: segment.start,
      end: segment.end,
    },
    style,
  })

export const runSegmentExport = async ({
  ffmpeg,
  input,
  danmaku,
  subtitles,
  style,
  videoBitrate,
  signal,
  onProgress,
}: RunSegmentExportOptions) => {
  const inputName = `segment-${input.segment.index}.flv`
  const assName = `segment-${input.segment.index}.ass`
  const outputName = `segment-${input.segment.index}.mp4`
  const assText = buildAssForSegment({
    segment: input.segment,
    danmaku,
    subtitles,
    style,
  })

  onProgress?.({ ...input.segment, status: "running", progress: 0 })
  const output = await transcodeFlvSegment(ffmpeg, {
    inputName,
    inputData: input.flvBytes,
    assName,
    assText,
    outputName,
    trimStart: input.trimStart,
    duration: input.segment.end - input.segment.start,
    videoBitrate,
    signal,
    onProgress: (progress) => {
      onProgress?.({ ...input.segment, status: "running", progress })
    },
  })
  onProgress?.({ ...input.segment, status: "done", progress: 100 })
  return output
}
