export type ContentRange = {
  unit: string
  start: number
  end: number
  size?: number
}

export type RangeReadResult = {
  bytes: Uint8Array
  contentRange?: ContentRange
  contentLength: number
  status: number
}

export const parseContentRange = (
  value: string | null,
): ContentRange | undefined => {
  if (!value) return undefined
  const matched = value.match(/^(\w+) (\d+)-(\d+)\/(\d+|\*)$/)
  if (!matched) return undefined
  return {
    unit: matched[1],
    start: Number(matched[2]),
    end: Number(matched[3]),
    size: matched[4] === "*" ? undefined : Number(matched[4]),
  }
}

export const readRange = async (
  url: string,
  start: number,
  end?: number,
  init?: RequestInit,
): Promise<RangeReadResult> => {
  const headers = new Headers(init?.headers)
  const safeStart = Math.max(0, start)
  headers.set(
    "Range",
    typeof end === "number"
      ? `bytes=${safeStart}-${Math.max(safeStart, end)}`
      : `bytes=${safeStart}-`,
  )

  const res = await fetch(url, {
    ...init,
    headers,
    credentials: init?.credentials || "include",
  })
  if (res.status !== 206) {
    throw new Error(`Range 请求没有返回 206：${res.status}`)
  }

  const bytes = new Uint8Array(await res.arrayBuffer())
  return {
    bytes,
    status: res.status,
    contentRange: parseContentRange(res.headers.get("Content-Range")),
    contentLength: Number(res.headers.get("Content-Length") || bytes.length),
  }
}

export const readHeadRange = (url: string, length = 1024) =>
  readRange(url, 0, Math.max(0, length - 1))

export const probeRange = async (url: string) => {
  const result = await readRange(url, 0, 0)
  return result.contentRange
}
