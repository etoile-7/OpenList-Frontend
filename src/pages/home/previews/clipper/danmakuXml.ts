import { ClipRange, DanmakuItem } from "./types"

const toColor = (value: string | undefined) => {
  const parsed = Number(value || 0)
  const hex = Number.isFinite(parsed)
    ? Math.max(0, parsed).toString(16).padStart(6, "0")
    : "ffffff"
  return `#${hex.slice(-6)}`
}

export const parseDanmakuXml = (xmlText: string): DanmakuItem[] => {
  const doc = new DOMParser().parseFromString(xmlText, "text/xml")
  const parseError = doc.querySelector("parsererror")
  if (parseError) {
    throw new Error(parseError.textContent || "XML 解析失败")
  }

  return Array.from(doc.querySelectorAll("d"))
    .map((node, index) => {
      const attrs = (node.getAttribute("p") || "").split(",")
      const time = Number.parseFloat(attrs[0] || "0")
      const mode = Number.parseInt(attrs[1] || "1", 10)
      const text = node.textContent || ""
      return {
        id: attrs[7] || `${index}-${time}-${text}`,
        time: Number.isFinite(time) ? time : 0,
        mode: Number.isFinite(mode) ? mode : 1,
        color: toColor(attrs[3]),
        text,
        enabled: true,
      }
    })
    .filter((item) => item.text.trim().length > 0)
}

export const fetchDanmakuXml = async (url: string) => {
  const res = await fetch(url, { credentials: "include" })
  if (!res.ok) {
    throw new Error(`XML 下载失败：${res.status}`)
  }
  return parseDanmakuXml(await res.text())
}

export const filterDanmakuItems = (
  items: DanmakuItem[],
  options: {
    keyword?: string
    range?: ClipRange
    onlyRange?: boolean
    onlyHidden?: boolean
  },
) => {
  const keyword = options.keyword?.trim().toLowerCase() || ""
  return items.filter((item) => {
    if (keyword && !item.text.toLowerCase().includes(keyword)) return false
    if (options.onlyHidden && item.enabled && !item.removed) return false
    if (
      options.onlyRange &&
      options.range &&
      (item.time < options.range.start || item.time > options.range.end)
    ) {
      return false
    }
    return true
  })
}
