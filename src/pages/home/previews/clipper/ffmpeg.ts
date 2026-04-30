import { FFmpeg } from "@ffmpeg/ffmpeg"
import { toBlobURL } from "@ffmpeg/util"

export type FfmpegCoreMode = "single" | "multi"

export type FfmpegLoadResult = {
  mode: FfmpegCoreMode
  ready: boolean
  ffmpeg?: FFmpeg
  reason?: string
}

export type FfmpegCorePaths = {
  single: string
  multi: string
}

export type FfmpegTranscodeOptions = {
  inputName: string
  inputData: Uint8Array
  assName?: string
  assText?: string
  outputName?: string
  trimStart?: number
  duration?: number
  videoBitrate?: string
  signal?: AbortSignal
  onProgress?: (progress: number) => void
}

export type FfmpegConcatOptions = {
  segments: { name: string; data: Uint8Array }[]
  outputName?: string
  signal?: AbortSignal
}

export const canUseMultiThreadFfmpeg = () =>
  typeof self !== "undefined" &&
  self.crossOriginIsolated &&
  typeof SharedArrayBuffer !== "undefined"

export const resolveFfmpegCoreMode = (): FfmpegCoreMode =>
  canUseMultiThreadFfmpeg() ? "multi" : "single"

const jsMime = "text/javascript"
const wasmMime = "application/wasm"

const buildCoreConfig = async (basePath: string, mode: FfmpegCoreMode) => {
  const normalized = basePath.replace(/\/$/, "")
  return {
    coreURL: await toBlobURL(`${normalized}/ffmpeg-core.js`, jsMime),
    wasmURL: await toBlobURL(`${normalized}/ffmpeg-core.wasm`, wasmMime),
    workerURL:
      mode === "multi"
        ? await toBlobURL(`${normalized}/ffmpeg-core.worker.js`, jsMime)
        : undefined,
  }
}

export const loadFfmpeg = async (
  paths: FfmpegCorePaths,
  preferredMode: FfmpegCoreMode = resolveFfmpegCoreMode(),
): Promise<FfmpegLoadResult> => {
  const mode =
    preferredMode === "multi" && canUseMultiThreadFfmpeg() ? "multi" : "single"
  const ffmpeg = new FFmpeg()
  try {
    await ffmpeg.load(
      await buildCoreConfig(
        mode === "multi" ? paths.multi : paths.single,
        mode,
      ),
    )
    return { mode, ready: true, ffmpeg }
  } catch (error) {
    if (mode === "multi") {
      ffmpeg.terminate()
      return loadFfmpeg(paths, "single")
    }
    return {
      mode,
      ready: false,
      reason: error instanceof Error ? error.message : "FFmpeg.wasm 加载失败",
    }
  }
}

export const transcodeFlvSegment = async (
  ffmpeg: FFmpeg,
  {
    inputName,
    inputData,
    assName,
    assText,
    outputName = "clip.mp4",
    trimStart = 0,
    duration,
    videoBitrate = "10M",
    signal,
    onProgress,
  }: FfmpegTranscodeOptions,
) => {
  const progressHandler = ({ progress }: { progress: number }) => {
    onProgress?.(Math.max(0, Math.min(100, progress * 100)))
  }
  ffmpeg.on("progress", progressHandler)
  try {
    await ffmpeg.writeFile(inputName, inputData, { signal })
    if (assName && assText) {
      await ffmpeg.writeFile(assName, assText, { signal })
    }

    const args = [
      ...(trimStart > 0 ? ["-ss", trimStart.toFixed(3)] : []),
      "-i",
      inputName,
      ...(duration && duration > 0 ? ["-t", duration.toFixed(3)] : []),
      "-c:v",
      "libx264",
      "-b:v",
      videoBitrate,
      "-c:a",
      "aac",
      "-movflags",
      "+faststart",
    ]
    if (assName) {
      args.push("-vf", `ass=${assName}`)
    }
    args.push(outputName)

    const code = await ffmpeg.exec(args, -1, { signal })
    if (code !== 0) {
      throw new Error(`FFmpeg.wasm 压制失败：${code}`)
    }
    const data = await ffmpeg.readFile(outputName, "binary", { signal })
    return data instanceof Uint8Array ? data : new TextEncoder().encode(data)
  } finally {
    ffmpeg.off("progress", progressHandler)
    await Promise.allSettled([
      ffmpeg.deleteFile(inputName),
      assName ? ffmpeg.deleteFile(assName) : Promise.resolve(true),
      ffmpeg.deleteFile(outputName),
    ])
  }
}

export const concatMp4Segments = async (
  ffmpeg: FFmpeg,
  { segments, outputName = "clip.mp4", signal }: FfmpegConcatOptions,
) => {
  const listName = "concat-list.txt"
  const listText = segments
    .map((segment) => `file '${segment.name.replace(/'/g, "'\\''")}'`)
    .join("\n")

  try {
    await Promise.all(
      segments.map((segment) =>
        ffmpeg.writeFile(segment.name, segment.data, { signal }),
      ),
    )
    await ffmpeg.writeFile(listName, listText, { signal })
    const code = await ffmpeg.exec(
      ["-f", "concat", "-safe", "0", "-i", listName, "-c", "copy", outputName],
      -1,
      { signal },
    )
    if (code !== 0) {
      throw new Error(`FFmpeg.wasm 合并失败：${code}`)
    }
    const data = await ffmpeg.readFile(outputName, "binary", { signal })
    return data instanceof Uint8Array ? data : new TextEncoder().encode(data)
  } finally {
    await Promise.allSettled([
      ...segments.map((segment) => ffmpeg.deleteFile(segment.name)),
      ffmpeg.deleteFile(listName),
      ffmpeg.deleteFile(outputName),
    ])
  }
}
