import { ClipRange } from "./types"
import { FlvIndex, FlvKeyframe } from "./flvIndex"
import { readRange } from "./rangeReader"

export type FlvByteRange = {
  start: number
  end?: number
  keyframe?: FlvKeyframe
}

export const findKeyframeBefore = (index: FlvIndex, time: number) => {
  let selected = index.keyframes[0]
  for (const keyframe of index.keyframes) {
    if (keyframe.time > time) break
    selected = keyframe
  }
  return selected
}

export const getFlvSegmentByteRange = (
  index: FlvIndex,
  range: ClipRange,
): FlvByteRange => {
  const keyframe = findKeyframeBefore(index, range.start)
  const next = index.keyframes.find((item) => item.time >= range.end)
  return {
    start: keyframe?.position || index.dataOffset,
    end: next?.position ? Math.max(next.position - 1, 0) : undefined,
    keyframe,
  }
}

const concatBytes = (chunks: Uint8Array[]) => {
  const length = chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0)
  const bytes = new Uint8Array(length)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  return bytes
}

export const readFlvSegmentBytes = async (
  url: string,
  index: FlvIndex,
  range: ClipRange,
  signal?: AbortSignal,
): Promise<{ bytes: Uint8Array; keyframe?: FlvKeyframe }> => {
  const byteRange = getFlvSegmentByteRange(index, range)
  const [header, body] = await Promise.all([
    readRange(url, 0, Math.max(12, index.dataOffset + 3), { signal }),
    readRange(url, byteRange.start, byteRange.end, { signal }),
  ])
  const chunks = [header.bytes]
  const sequenceHeaders = [
    index.firstVideoSequenceHeader,
    index.firstAudioSequenceHeader,
  ]
    .filter((item) => item && item.position < byteRange.start)
    .sort((a, b) => a!.position - b!.position)

  for (const sequenceHeader of sequenceHeaders) {
    if (!sequenceHeader) continue
    const result = await readRange(
      url,
      sequenceHeader.position,
      sequenceHeader.position + sequenceHeader.size - 1,
      { signal },
    )
    chunks.push(result.bytes)
  }
  chunks.push(body.bytes)
  return { bytes: concatBytes(chunks), keyframe: byteRange.keyframe }
}
