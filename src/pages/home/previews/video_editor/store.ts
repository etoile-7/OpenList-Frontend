import { createMemo, createSignal } from "solid-js"
import {
  ClipRange,
  DanmakuItem,
  EditorTab,
  EditorStyleSettings,
  ExportSegment,
  SubtitleItem,
} from "../clipper/types"

const defaultStyleSettings: EditorStyleSettings = {
  width: 1280,
  height: 720,
  danmakuOffset: 0,
  danmakuFontSize: 34,
  subtitleFontSize: 42,
  subtitleMarginV: 42,
}

export const createVideoEditorStore = () => {
  const [opened, setOpened] = createSignal(false)
  const [activeTab, setActiveTab] = createSignal<EditorTab>("danmaku")
  const [range, setRange] = createSignal<ClipRange>({ start: 0, end: 0 })
  const [danmaku, setDanmaku] = createSignal<DanmakuItem[]>([])
  const [subtitles, setSubtitles] = createSignal<SubtitleItem[]>([])
  const [selectedSubtitleId, setSelectedSubtitleId] = createSignal("")
  const [keyword, setKeyword] = createSignal("")
  const [onlyRange, setOnlyRange] = createSignal(false)
  const [onlyHidden, setOnlyHidden] = createSignal(false)
  const [segments, setSegments] = createSignal<ExportSegment[]>([])
  const [styleSettings, setStyleSettings] =
    createSignal<EditorStyleSettings>(defaultStyleSettings)

  const enabledDanmaku = createMemo(
    () => danmaku().filter((item) => item.enabled && !item.removed).length,
  )

  const removedDanmaku = createMemo(
    () => danmaku().filter((item) => item.removed || !item.enabled).length,
  )

  const toggleDanmaku = (id: string) => {
    setDanmaku((items) =>
      items.map((item) =>
        item.id === id ? { ...item, enabled: !item.enabled } : item,
      ),
    )
  }

  const removeDanmaku = (id: string) => {
    setDanmaku((items) =>
      items.map((item) =>
        item.id === id ? { ...item, enabled: false, removed: true } : item,
      ),
    )
  }

  const restoreDanmaku = (id: string) => {
    setDanmaku((items) =>
      items.map((item) =>
        item.id === id ? { ...item, enabled: true, removed: false } : item,
      ),
    )
  }

  const disableOutsideRange = () => {
    const current = range()
    setDanmaku((items) =>
      items.map((item) =>
        item.time < current.start || item.time > current.end
          ? { ...item, enabled: false }
          : item,
      ),
    )
  }

  const addSubtitle = (item?: Partial<SubtitleItem>) => {
    const current = range()
    const subtitle: SubtitleItem = {
      id: `manual-${Date.now()}`,
      start: item?.start ?? current.start,
      end:
        item?.end ??
        Math.min(current.end || current.start + 3, current.start + 3),
      text: item?.text ?? "",
      enabled: item?.enabled ?? true,
      source: item?.source ?? "manual",
    }
    setSubtitles((items) => [...items, subtitle])
    setSelectedSubtitleId(subtitle.id)
  }

  const updateSubtitle = (id: string, patch: Partial<SubtitleItem>) => {
    setSubtitles((items) =>
      items.map((item) => {
        if (item.id !== id) return item
        const next = { ...item, ...patch }
        if (next.end < next.start) {
          next.end = next.start
        }
        if (next.start < 0) {
          const offset = Math.abs(next.start)
          next.start = 0
          next.end += offset
        }
        return next
      }),
    )
  }

  const removeSubtitle = (id: string) => {
    setSubtitles((items) => items.filter((item) => item.id !== id))
    setSelectedSubtitleId((selected) => (selected === id ? "" : selected))
  }

  const toggleSubtitle = (id: string) => {
    setSubtitles((items) =>
      items.map((item) =>
        item.id === id ? { ...item, enabled: !item.enabled } : item,
      ),
    )
  }

  const shiftSubtitles = (offset: number) => {
    setSubtitles((items) =>
      items.map((item) => {
        const start = Math.max(0, item.start + offset)
        const end = Math.max(start, item.end + offset)
        return { ...item, start, end }
      }),
    )
  }

  const updateStyleSettings = (patch: Partial<EditorStyleSettings>) => {
    setStyleSettings((current) => {
      const next = { ...current, ...patch }
      return {
        width: Math.max(320, Math.round(next.width)),
        height: Math.max(180, Math.round(next.height)),
        danmakuOffset: Number.isFinite(next.danmakuOffset)
          ? next.danmakuOffset
          : current.danmakuOffset,
        danmakuFontSize: Math.max(12, Math.round(next.danmakuFontSize)),
        subtitleFontSize: Math.max(12, Math.round(next.subtitleFontSize)),
        subtitleMarginV: Math.max(0, Math.round(next.subtitleMarginV)),
      }
    })
  }

  const rebuildSegments = (segmentLength: number) => {
    const current = range()
    const start = Math.max(0, current.start)
    const end = Math.max(start, current.end)
    const next: ExportSegment[] = []
    let cursor = start
    let index = 0
    while (cursor < end) {
      const segmentEnd = Math.min(end, cursor + segmentLength)
      next.push({
        index,
        start: cursor,
        end: segmentEnd,
        status: "pending",
        progress: 0,
      })
      cursor = segmentEnd
      index += 1
    }
    setSegments(next)
  }

  return {
    opened,
    setOpened,
    activeTab,
    setActiveTab,
    range,
    setRange,
    danmaku,
    setDanmaku,
    subtitles,
    setSubtitles,
    selectedSubtitleId,
    setSelectedSubtitleId,
    keyword,
    setKeyword,
    onlyRange,
    setOnlyRange,
    onlyHidden,
    setOnlyHidden,
    segments,
    setSegments,
    styleSettings,
    updateStyleSettings,
    enabledDanmaku,
    removedDanmaku,
    toggleDanmaku,
    removeDanmaku,
    restoreDanmaku,
    disableOutsideRange,
    addSubtitle,
    updateSubtitle,
    removeSubtitle,
    toggleSubtitle,
    shiftSubtitles,
    rebuildSegments,
  }
}

export type VideoEditorStore = ReturnType<typeof createVideoEditorStore>
