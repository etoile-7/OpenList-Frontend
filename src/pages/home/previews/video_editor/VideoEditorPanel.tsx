import {
  Accessor,
  Match,
  Show,
  Switch,
  createEffect,
  createMemo,
  createSignal,
} from "solid-js"
import { useCDN } from "~/hooks"
import { parseAsrTranscript } from "../clipper/asrTranscript"
import { fetchDanmakuXml } from "../clipper/danmakuXml"
import { runSegmentExport } from "../clipper/exportPipeline"
import { getOrBuildFlvIndex } from "../clipper/flvIndexCache"
import { readFlvSegmentBytes } from "../clipper/flvSegment"
import { concatMp4Segments, loadFfmpeg } from "../clipper/ffmpeg"
import { probeRange } from "../clipper/rangeReader"
import { fetchSubtitle, SubtitleFormat } from "../clipper/subtitleParser"
import { writeAss } from "../clipper/assWriter"
import { ClipRangeBar } from "./ClipRangeBar"
import { DanmakuList } from "./DanmakuList"
import { ExportQueue } from "./ExportQueue"
import { SubtitleList } from "./SubtitleList"
import { TrackTabs } from "./TrackTabs"
import { createVideoEditorStore } from "./store"
import "./index.css"

export const VideoEditorPanel = (props: {
  videoName: string
  videoProxyUrl: string
  videoSize?: number
  videoModified?: string
  danmakuUrl?: string
  subtitleFiles: { name: string; url: string; format: SubtitleFormat }[]
  duration: Accessor<number>
  currentTime: Accessor<number>
  onSeek: (time: number) => void
}) => {
  const { ffmpegCorePath, ffmpegCoreMtPath } = useCDN()
  const store = createVideoEditorStore()
  const [loadingDanmaku, setLoadingDanmaku] = createSignal(false)
  const [danmakuError, setDanmakuError] = createSignal("")
  const [rangeProbeStatus, setRangeProbeStatus] = createSignal("")
  const [indexStatus, setIndexStatus] = createSignal("")
  const [ffmpegStatus, setFfmpegStatus] = createSignal("")
  const [subtitleStatus, setSubtitleStatus] = createSignal("")
  const [assSize, setAssSize] = createSignal(0)
  const [speechText, setSpeechText] = createSignal("")
  const [speechStatus, setSpeechStatus] = createSignal("")
  const [exporting, setExporting] = createSignal(false)
  let exportAbortController: AbortController | undefined

  const rangeSeconds = createMemo(() =>
    Math.max(0, store.range().end - store.range().start),
  )

  createEffect(() => {
    const duration = props.duration()
    const range = store.range()
    if (duration > 0 && range.end === 0) {
      store.setRange({ start: 0, end: Math.min(duration, 600) })
    }
  })

  createEffect(() => {
    store.range()
    const segmentLength =
      typeof window !== "undefined" && window.innerWidth <= 760 ? 30 : 60
    store.rebuildSegments(segmentLength)
  })

  let lastDanmakuUrl = ""
  createEffect(() => {
    const url = props.danmakuUrl || ""
    if (url === lastDanmakuUrl) return
    lastDanmakuUrl = url
    store.setDanmaku([])
    setDanmakuError("")
    if (!url) return

    setLoadingDanmaku(true)
    fetchDanmakuXml(url)
      .then((items) => {
        store.setDanmaku(items)
      })
      .catch((error: Error) => {
        setDanmakuError(error.message)
      })
      .finally(() => {
        setLoadingDanmaku(false)
      })
  })

  const buildAss = () => {
    const ass = writeAss({
      danmaku: store.danmaku(),
      subtitles: store.subtitles(),
      range: store.range(),
      style: store.styleSettings(),
    })
    setAssSize(ass.length)
    const blob = new Blob([ass], {
      type: "text/plain;charset=utf-8",
    })
    const url = URL.createObjectURL(blob)
    const link = document.createElement("a")
    const baseName = props.videoName.replace(/\.[^.]+$/, "")
    link.href = url
    link.download = `${baseName || "clip"}.ass`
    link.click()
    URL.revokeObjectURL(url)
  }

  const checkRange = async () => {
    setRangeProbeStatus("正在检查 Range（范围请求）")
    try {
      const contentRange = await probeRange(props.videoProxyUrl)
      if (!contentRange) {
        setRangeProbeStatus(
          "Range（范围请求）可用，但没有返回 Content-Range（内容范围）",
        )
        return
      }
      setRangeProbeStatus(
        `Range（范围请求）正常：${contentRange.unit} ${contentRange.start}-${contentRange.end}/${contentRange.size || "*"}`,
      )
    } catch (error) {
      setRangeProbeStatus(
        error instanceof Error ? error.message : "Range（范围请求）检查失败",
      )
    }
  }

  const buildIndex = async () => {
    setIndexStatus("正在读取并缓存 FLV（直播录像格式）索引")
    try {
      const result = await getOrBuildFlvIndex({
        source: {
          url: props.videoProxyUrl,
          name: props.videoName,
          size: props.videoSize,
          modified: props.videoModified,
        },
      })
      setIndexStatus(
        `${result.cacheHit ? "已命中缓存" : "已写入缓存"}：${result.index.keyframes.length} 个关键帧`,
      )
    } catch (error) {
      setIndexStatus(
        error instanceof Error ? error.message : "FLV（直播录像格式）索引失败",
      )
    }
  }

  const loadFfmpegCore = async () => {
    setFfmpegStatus("正在加载 FFmpeg.wasm（浏览器端 FFmpeg）")
    const result = await loadFfmpeg({
      single: ffmpegCorePath(),
      multi: ffmpegCoreMtPath(),
    })
    setFfmpegStatus(
      result.ready
        ? `FFmpeg.wasm 已加载：${result.mode === "multi" ? "多线程" : "单线程"}`
        : result.reason || "FFmpeg.wasm 加载失败",
    )
    result.ffmpeg?.terminate()
  }

  const importSubtitle = async (url: string, format: SubtitleFormat) => {
    setSubtitleStatus("正在导入字幕文件")
    try {
      const items = await fetchSubtitle(url, format)
      store.setSubtitles((current) => [...current, ...items])
      setSubtitleStatus(`已导入 ${items.length} 条字幕`)
    } catch (error) {
      setSubtitleStatus(error instanceof Error ? error.message : "字幕导入失败")
    }
  }

  const addSpeechTranscript = () => {
    const items = parseAsrTranscript(speechText(), store.range().start)
    if (items.length === 0) {
      setSpeechStatus("请先粘贴识别文本")
      return
    }
    store.setSubtitles((current) => [...current, ...items])
    store.setActiveTab("subtitle")
    setSpeechStatus(`已生成 ${items.length} 条语音字幕`)
  }

  const saveBlob = (bytes: Uint8Array, fileName: string, type: string) => {
    const blobPart = bytes.buffer.slice(
      bytes.byteOffset,
      bytes.byteOffset + bytes.byteLength,
    ) as ArrayBuffer
    const blob = new Blob([blobPart], { type })
    const url = URL.createObjectURL(blob)
    const link = document.createElement("a")
    link.href = url
    link.download = fileName
    link.click()
    URL.revokeObjectURL(url)
  }

  const exportMp4 = async () => {
    if (exporting()) {
      exportAbortController?.abort()
      return
    }

    setExporting(true)
    exportAbortController = new AbortController()
    setFfmpegStatus("正在准备分段导出")
    try {
      const source = {
        url: props.videoProxyUrl,
        name: props.videoName,
        size: props.videoSize,
        modified: props.videoModified,
      }
      const { index } = await getOrBuildFlvIndex({ source })
      const result = await loadFfmpeg({
        single: ffmpegCorePath(),
        multi: ffmpegCoreMtPath(),
      })
      if (!result.ready || !result.ffmpeg) {
        throw new Error(result.reason || "FFmpeg.wasm 加载失败")
      }
      setFfmpegStatus(
        `FFmpeg.wasm 已加载：${result.mode === "multi" ? "多线程" : "单线程"}`,
      )

      const outputs: { name: string; data: Uint8Array }[] = []
      for (const segment of store.segments()) {
        const { bytes: flvBytes, keyframe } = await readFlvSegmentBytes(
          props.videoProxyUrl,
          index,
          segment,
          exportAbortController.signal,
        )
        const outputName = `segment-${segment.index + 1}.mp4`
        const output = await runSegmentExport({
          ffmpeg: result.ffmpeg,
          input: {
            segment,
            flvBytes,
            trimStart: Math.max(0, segment.start - (keyframe?.time || 0)),
          },
          danmaku: store.danmaku(),
          subtitles: store.subtitles(),
          style: store.styleSettings(),
          videoBitrate: "10M",
          signal: exportAbortController.signal,
          onProgress: (nextSegment) => {
            store.setSegments((current) =>
              current.map((item) =>
                item.index === nextSegment.index ? nextSegment : item,
              ),
            )
          },
        })
        outputs.push({ name: outputName, data: output })
      }
      if (outputs.length === 0) {
        throw new Error("没有可导出的分段")
      }
      const baseName = props.videoName.replace(/\.[^.]+$/, "") || "clip"
      const finalOutput =
        outputs.length > 1
          ? await concatMp4Segments(result.ffmpeg, {
              segments: outputs,
              outputName: `${baseName}.mp4`,
              signal: exportAbortController.signal,
            })
          : outputs[0].data
      saveBlob(finalOutput, `${baseName}.mp4`, "video/mp4")
      if (outputs.length > 1) {
        setFfmpegStatus(`已合并 ${outputs.length} 个分段并导出 MP4`)
      } else {
        setFfmpegStatus("已导出 MP4")
      }
      result.ffmpeg.terminate()
    } catch (error) {
      setFfmpegStatus(error instanceof Error ? error.message : "MP4 导出失败")
    } finally {
      setExporting(false)
      exportAbortController = undefined
    }
  }

  return (
    <>
      <button
        class="video-editor-fab"
        type="button"
        onClick={() => store.setOpened(!store.opened())}
      >
        剪辑
      </button>
      <aside
        class="video-editor-panel"
        classList={{ "is-open": store.opened() }}
      >
        <header class="video-editor-header">
          <div>
            <strong>本地剪辑台</strong>
            <span>{props.videoName}</span>
          </div>
          <button type="button" onClick={() => store.setOpened(false)}>
            收起
          </button>
        </header>
        <div class="video-editor-stats">
          <span>弹幕 {store.enabledDanmaku()}</span>
          <span>隐藏 {store.removedDanmaku()}</span>
          <Show when={assSize() > 0}>
            <span>ASS {Math.ceil(assSize() / 1024)}KB</span>
          </Show>
        </div>
        <ClipRangeBar
          range={store.range}
          duration={props.duration}
          currentTime={props.currentTime}
          onRangeChange={store.setRange}
          onSeek={props.onSeek}
        />
        <TrackTabs active={store.activeTab()} onChange={store.setActiveTab} />
        <Switch>
          <Match when={store.activeTab() === "danmaku"}>
            <DanmakuList
              items={store.danmaku()}
              range={store.range()}
              keyword={store.keyword()}
              onlyRange={store.onlyRange()}
              onlyHidden={store.onlyHidden()}
              loading={loadingDanmaku()}
              error={danmakuError()}
              onKeywordChange={store.setKeyword}
              onOnlyRangeChange={store.setOnlyRange}
              onOnlyHiddenChange={store.setOnlyHidden}
              onSeek={props.onSeek}
              onToggle={store.toggleDanmaku}
              onRemove={store.removeDanmaku}
              onRestore={store.restoreDanmaku}
              onDisableOutsideRange={store.disableOutsideRange}
            />
          </Match>
          <Match when={store.activeTab() === "subtitle"}>
            <section class="video-editor-imports">
              <Show
                when={props.subtitleFiles.length > 0}
                fallback={
                  <p class="video-editor-empty">没有发现同名字幕文件</p>
                }
              >
                <div class="video-editor-imports__buttons">
                  {props.subtitleFiles.map((item) => (
                    <button
                      type="button"
                      onClick={() => importSubtitle(item.url, item.format)}
                    >
                      导入 {item.name}
                    </button>
                  ))}
                </div>
              </Show>
              <Show when={subtitleStatus()}>
                <p class="video-editor-note">{subtitleStatus()}</p>
              </Show>
            </section>
            <SubtitleList
              items={store.subtitles()}
              selectedId={store.selectedSubtitleId()}
              onSeek={props.onSeek}
              onAdd={() => store.addSubtitle()}
              onSelect={store.setSelectedSubtitleId}
              onUpdate={store.updateSubtitle}
              onRemove={store.removeSubtitle}
              onToggle={store.toggleSubtitle}
              onShift={store.shiftSubtitles}
            />
          </Match>
          <Match when={store.activeTab() === "speech"}>
            <section class="video-editor-pane video-editor-speech">
              <textarea
                placeholder="粘贴 ASR（语音识别）文本，每行生成一条 3 秒字幕"
                value={speechText()}
                onInput={(e) => setSpeechText(e.currentTarget.value)}
              />
              <button type="button" onClick={addSpeechTranscript}>
                生成语音字幕
              </button>
              <Show when={speechStatus()}>
                <p class="video-editor-note">{speechStatus()}</p>
              </Show>
            </section>
          </Match>
          <Match when={store.activeTab() === "style"}>
            <section class="video-editor-pane video-editor-style">
              <label>
                画布
                <span class="video-editor-inline-inputs">
                  <input
                    type="number"
                    min="320"
                    step="10"
                    value={store.styleSettings().width}
                    onInput={(e) =>
                      store.updateStyleSettings({
                        width: Number.parseFloat(
                          e.currentTarget.value || "1280",
                        ),
                      })
                    }
                  />
                  <input
                    type="number"
                    min="180"
                    step="10"
                    value={store.styleSettings().height}
                    onInput={(e) =>
                      store.updateStyleSettings({
                        height: Number.parseFloat(
                          e.currentTarget.value || "720",
                        ),
                      })
                    }
                  />
                </span>
              </label>
              <label>
                弹幕偏移
                <input
                  type="number"
                  step="0.1"
                  value={store.styleSettings().danmakuOffset}
                  onInput={(e) =>
                    store.updateStyleSettings({
                      danmakuOffset: Number.parseFloat(
                        e.currentTarget.value || "0",
                      ),
                    })
                  }
                />
              </label>
              <label>
                弹幕字号
                <input
                  type="number"
                  min="12"
                  step="1"
                  value={store.styleSettings().danmakuFontSize}
                  onInput={(e) =>
                    store.updateStyleSettings({
                      danmakuFontSize: Number.parseFloat(
                        e.currentTarget.value || "34",
                      ),
                    })
                  }
                />
              </label>
              <label>
                字幕字号
                <input
                  type="number"
                  min="12"
                  step="1"
                  value={store.styleSettings().subtitleFontSize}
                  onInput={(e) =>
                    store.updateStyleSettings({
                      subtitleFontSize: Number.parseFloat(
                        e.currentTarget.value || "42",
                      ),
                    })
                  }
                />
              </label>
              <label>
                字幕底距
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={store.styleSettings().subtitleMarginV}
                  onInput={(e) =>
                    store.updateStyleSettings({
                      subtitleMarginV: Number.parseFloat(
                        e.currentTarget.value || "42",
                      ),
                    })
                  }
                />
              </label>
            </section>
          </Match>
          <Match when={store.activeTab() === "export"}>
            <ExportQueue
              segments={store.segments()}
              rangeSeconds={rangeSeconds()}
              bitrate="10mbps"
              rangeProbeStatus={rangeProbeStatus()}
              indexStatus={indexStatus()}
              ffmpegStatus={ffmpegStatus()}
              exporting={exporting()}
              onBuildAss={buildAss}
              onProbeRange={checkRange}
              onBuildIndex={buildIndex}
              onLoadFfmpeg={loadFfmpegCore}
              onExportMp4={exportMp4}
            />
          </Match>
        </Switch>
      </aside>
    </>
  )
}
