import type { FFmpeg } from "@ffmpeg/ffmpeg"
import { SubtitleItem } from "./types"

export const DEFAULT_LOCAL_ASR_MODEL = "onnx-community/whisper-tiny"

export type LocalAsrStatus =
  | "extracting"
  | "loading-model"
  | "transcribing"
  | "done"

export type ExtractAudioForAsrOptions = {
  ffmpeg: FFmpeg
  inputName: string
  inputData: Uint8Array
  trimStart?: number
  duration: number
  outputName?: string
  signal?: AbortSignal
}

export type TranscribeAudioOptions = {
  audio: Float32Array
  clipStart: number
  clipDuration: number
  model?: string
  language?: string
  signal?: AbortSignal
  onStatus?: (status: LocalAsrStatus, detail?: string) => void
}

type AsrChunk = {
  text?: unknown
  timestamp?: unknown
}

type AsrResult = {
  text?: unknown
  chunks?: AsrChunk[]
}

type AsrPipeline = (
  audio: Float32Array,
  options?: Record<string, unknown>,
) => Promise<unknown>

let cachedTranscriber:
  | {
      model: string
      promise: Promise<AsrPipeline>
    }
  | undefined

const assertNotAborted = (signal?: AbortSignal) => {
  if (signal?.aborted) {
    throw new DOMException("语音识别已取消", "AbortError")
  }
}

const toBytes = (data: Awaited<ReturnType<FFmpeg["readFile"]>>) =>
  data instanceof Uint8Array ? data : new TextEncoder().encode(data)

const toFloat32Audio = (bytes: Uint8Array) => {
  const aligned =
    bytes.byteOffset % 4 === 0 && bytes.byteLength % 4 === 0
      ? bytes
      : new Uint8Array(bytes)
  return new Float32Array(
    aligned.buffer,
    aligned.byteOffset,
    Math.floor(aligned.byteLength / 4),
  )
}

const getTimestamp = (value: unknown): [number, number | undefined] => {
  if (!Array.isArray(value)) return [0, undefined]
  const start = Number(value[0])
  const end = Number(value[1])
  return [
    Number.isFinite(start) ? Math.max(0, start) : 0,
    Number.isFinite(end) ? Math.max(0, end) : undefined,
  ]
}

const normalizeAsrResult = (
  result: unknown,
  clipStart: number,
  clipDuration: number,
): SubtitleItem[] => {
  const payload: AsrResult =
    typeof result === "string" ? { text: result } : (result as AsrResult)
  const chunks = Array.isArray(payload?.chunks) ? payload.chunks : []
  const now = Date.now()

  if (chunks.length > 0) {
    return chunks.flatMap((chunk, index) => {
      const text = String(chunk.text || "").trim()
      if (!text) return []
      const [relativeStart, relativeEnd] = getTimestamp(chunk.timestamp)
      const start = clipStart + relativeStart
      const fallbackEnd = Math.min(clipStart + clipDuration, start + 3)
      const end = clipStart + (relativeEnd ?? relativeStart + 3)
      return [
        {
          id: `asr-${now}-${index}`,
          start,
          end: Math.max(
            start + 0.2,
            Math.min(clipStart + clipDuration, end || fallbackEnd),
          ),
          text,
          enabled: true,
          source: "asr" as const,
        },
      ]
    })
  }

  const text = String(payload?.text || "").trim()
  if (!text) return []
  return [
    {
      id: `asr-${now}-0`,
      start: clipStart,
      end: Math.max(clipStart + 0.2, clipStart + clipDuration),
      text,
      enabled: true,
      source: "asr" as const,
    },
  ]
}

const loadTranscriber = async (
  model: string,
  onStatus?: (detail?: string) => void,
) => {
  if (cachedTranscriber?.model === model) {
    return cachedTranscriber.promise
  }

  cachedTranscriber = {
    model,
    promise: (async () => {
      const { env, pipeline } = await import("@huggingface/transformers")
      ;(env as Record<string, unknown>).allowLocalModels = false
      ;(env as Record<string, unknown>).useBrowserCache = true

      return (await pipeline("automatic-speech-recognition", model, {
        progress_callback: (progress: unknown) => {
          if (!progress || typeof progress !== "object") return
          const detail = (progress as { file?: string; status?: string }).file
            ? `${(progress as { status?: string }).status || "loading"} ${
                (progress as { file?: string }).file
              }`
            : (progress as { status?: string }).status
          onStatus?.(detail)
        },
      } as Record<string, unknown>)) as AsrPipeline
    })(),
  }

  return cachedTranscriber.promise
}

export const extractAudioForAsr = async ({
  ffmpeg,
  inputName,
  inputData,
  trimStart = 0,
  duration,
  outputName = "asr-audio.f32",
  signal,
}: ExtractAudioForAsrOptions) => {
  assertNotAborted(signal)
  await ffmpeg.writeFile(inputName, inputData, { signal })
  try {
    const args = [
      "-i",
      inputName,
      ...(trimStart > 0 ? ["-ss", trimStart.toFixed(3)] : []),
      ...(duration > 0 ? ["-t", duration.toFixed(3)] : []),
      "-vn",
      "-ac",
      "1",
      "-ar",
      "16000",
      "-f",
      "f32le",
      outputName,
    ]

    const code = await ffmpeg.exec(args, -1, { signal })
    if (code !== 0) {
      throw new Error(`音频提取失败：${code}`)
    }
    const data = await ffmpeg.readFile(outputName, "binary", { signal })
    const audio = toFloat32Audio(toBytes(data))
    if (audio.length === 0) {
      throw new Error("没有提取到可识别的音频")
    }
    return audio
  } finally {
    await Promise.allSettled([
      ffmpeg.deleteFile(inputName),
      ffmpeg.deleteFile(outputName),
    ])
  }
}

export const transcribeAudioToSubtitles = async ({
  audio,
  clipStart,
  clipDuration,
  model = DEFAULT_LOCAL_ASR_MODEL,
  language = "zh",
  signal,
  onStatus,
}: TranscribeAudioOptions) => {
  assertNotAborted(signal)
  onStatus?.("loading-model", "正在加载本地语音识别模型")
  const transcriber = await loadTranscriber(model, (detail) =>
    onStatus?.("loading-model", detail),
  )

  assertNotAborted(signal)
  onStatus?.("transcribing", "正在识别当前片段")
  const result = await transcriber(audio, {
    chunk_length_s: Math.min(30, Math.max(5, Math.ceil(clipDuration))),
    stride_length_s: 5,
    return_timestamps: true,
    language,
    task: "transcribe",
  })

  assertNotAborted(signal)
  const subtitles = normalizeAsrResult(result, clipStart, clipDuration)
  onStatus?.("done", `已识别 ${subtitles.length} 条字幕`)
  return subtitles
}
