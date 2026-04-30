import { FlvIndex, parseFlvIndex } from "./flvIndex"
import { readHeadRange } from "./rangeReader"
import { deleteFromStore, flvIndexStoreName, withStore } from "./indexedDbCache"

export type FlvIndexCacheSource = {
  url: string
  name: string
  size?: number
  modified?: string
}

export type CachedFlvIndex = {
  key: string
  version: 1
  createdAt: number
  updatedAt: number
  source: FlvIndexCacheSource
  index: FlvIndex
}

export type BuildFlvIndexOptions = {
  source: FlvIndexCacheSource
  readLength?: number
}

const keyPart = (value: unknown) => String(value ?? "")

export const buildFlvIndexCacheKey = (source: FlvIndexCacheSource) =>
  [
    source.url,
    source.name,
    keyPart(source.size),
    keyPart(source.modified),
  ].join("|")

export const getCachedFlvIndex = async (source: FlvIndexCacheSource) =>
  withStore<CachedFlvIndex | undefined>(
    flvIndexStoreName,
    "readonly",
    (store) => store.get(buildFlvIndexCacheKey(source)),
  )

export const putCachedFlvIndex = async (
  source: FlvIndexCacheSource,
  index: FlvIndex,
) => {
  const key = buildFlvIndexCacheKey(source)
  const cached = await getCachedFlvIndex(source)
  const now = Date.now()
  await withStore(flvIndexStoreName, "readwrite", (store) =>
    store.put({
      key,
      version: 1,
      createdAt: cached?.createdAt || now,
      updatedAt: now,
      source,
      index,
    } satisfies CachedFlvIndex),
  )
}

export const deleteCachedFlvIndex = (source: FlvIndexCacheSource) =>
  deleteFromStore(flvIndexStoreName, buildFlvIndexCacheKey(source))

export const getOrBuildFlvIndex = async ({
  source,
  readLength = 2 * 1024 * 1024,
}: BuildFlvIndexOptions) => {
  const cached = await getCachedFlvIndex(source)
  if (cached) {
    return { index: cached.index, cacheHit: true }
  }

  const head = await readHeadRange(source.url, readLength)
  const index = parseFlvIndex(head.bytes.slice().buffer)
  await putCachedFlvIndex(source, index)
  return { index, cacheHit: false }
}
