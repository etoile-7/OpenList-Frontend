export type FlvKeyframe = {
  time: number
  position: number
}

export type FlvIndex = {
  dataOffset: number
  hasAudio: boolean
  hasVideo: boolean
  duration?: number
  keyframes: FlvKeyframe[]
  firstAudioSequenceHeader?: { time: number; position: number; size: number }
  firstVideoSequenceHeader?: { time: number; position: number; size: number }
}

const readUInt24 = (view: DataView, offset: number) =>
  (view.getUint8(offset) << 16) |
  (view.getUint8(offset + 1) << 8) |
  view.getUint8(offset + 2)

export const parseFlvIndex = (
  buffer: ArrayBuffer,
  maxTags = 20000,
): FlvIndex => {
  const view = new DataView(buffer)
  if (
    view.byteLength < 13 ||
    view.getUint8(0) !== 0x46 ||
    view.getUint8(1) !== 0x4c ||
    view.getUint8(2) !== 0x56
  ) {
    throw new Error("不是有效的 FLV 文件头")
  }

  const flags = view.getUint8(4)
  const dataOffset = view.getUint32(5)
  const index: FlvIndex = {
    dataOffset,
    hasAudio: (flags & 0x04) !== 0,
    hasVideo: (flags & 0x01) !== 0,
    keyframes: [],
  }

  let offset = dataOffset + 4
  let count = 0
  while (offset + 15 <= view.byteLength && count < maxTags) {
    const tagType = view.getUint8(offset)
    const dataSize = readUInt24(view, offset + 1)
    const timestamp =
      readUInt24(view, offset + 4) | (view.getUint8(offset + 7) << 24)
    const dataStart = offset + 11
    const dataEnd = dataStart + dataSize
    if (dataEnd + 4 > view.byteLength) break

    if (tagType === 9 && dataSize > 0) {
      const videoInfo = view.getUint8(dataStart)
      const frameType = videoInfo >> 4
      const codecId = videoInfo & 0x0f
      const avcPacketType = dataSize > 1 ? view.getUint8(dataStart + 1) : -1

      if (frameType === 1) {
        index.keyframes.push({ time: timestamp / 1000, position: offset })
      }
      if (
        !index.firstVideoSequenceHeader &&
        codecId === 7 &&
        avcPacketType === 0
      ) {
        index.firstVideoSequenceHeader = {
          time: timestamp / 1000,
          position: offset,
          size: 11 + dataSize + 4,
        }
      }
    }

    if (tagType === 8 && dataSize > 1 && !index.firstAudioSequenceHeader) {
      const soundFormat = view.getUint8(dataStart) >> 4
      const aacPacketType = view.getUint8(dataStart + 1)
      if (soundFormat === 10 && aacPacketType === 0) {
        index.firstAudioSequenceHeader = {
          time: timestamp / 1000,
          position: offset,
          size: 11 + dataSize + 4,
        }
      }
    }

    index.duration = Math.max(index.duration || 0, timestamp / 1000)
    offset = dataEnd + 4
    count++
  }

  return index
}
