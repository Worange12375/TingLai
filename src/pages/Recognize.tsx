// 识籁：上传 / 录音 → 调用识别编排层 → 展示 Top-3 物种卡
// 状态机：idle → recording → ready(有音频待识别) → analyzing → result / error
import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Badge, Button, Card, ConfidenceBar, SectionTitle } from '../components/ui'
import { NoticeBar, GroupBadge, PlayCallButton } from '../components/SpeciesCard'
import { SpeciesName } from '../components/SpeciesName'
import { SpeciesAvatar } from '../components/PlaceholderArt'
import {
  ACCEPTED_AUDIO,
  createRecorder,
  getDuration,
  isRecordingSupported,
  validateAudioFile,
  type RecorderHandle,
} from '../lib/audio'
import {
  probeService,
  recognizeWithDiagnostics,
  type RecognitionResult,
  type ServiceHealth,
} from '../lib/recognize'
import { useCallPlayer } from '../lib/useCallPlayer'
import { addHistory } from '../lib/storage'

type Phase = 'idle' | 'recording' | 'ready' | 'analyzing' | 'result' | 'error'

const MAX_SECONDS = 30

/** 浏览器定位（可选）：拿到经纬度能让 BirdNET 按地理位置收窄候选物种，明显提升准确率 */
function getPosition(): Promise<{ lat: number; lon: number } | null> {
  return new Promise((resolve) => {
    if (!navigator.geolocation) return resolve(null)
    const timer = window.setTimeout(() => resolve(null), 6000)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        window.clearTimeout(timer)
        resolve({ lat: pos.coords.latitude, lon: pos.coords.longitude })
      },
      () => {
        window.clearTimeout(timer)
        resolve(null)
      },
      { timeout: 6000, maximumAge: 600000 },
    )
  })
}

/**
 * 可信度分级标签：把 BirdNET 给出的置信度翻译成用户能懂的"把握程度"。
 * 阈值（与主理人压测结论对齐）：
 *   · >= 0.50     高可信
 *   · 0.25 ~ 0.50 中等可信
 *   · < 0.25      低可信 · 仅供参考（明显弱化展示，提示这很可能是误报/猜测）
 * ⚠️ 本地兜底（离线示例）结果不展示该分级，避免用户误以为兜底也是模型输出。
 */
function CredibilityTag({ confidence }: { confidence: number }) {
  const pct = Math.round(confidence * 100)
  if (confidence >= 0.5) {
    return (
      <Badge tone="moss" title="BirdNET 对此结果有较高把握">
        高可信 · {pct}%
      </Badge>
    )
  }
  if (confidence >= 0.25) {
    return (
      <Badge tone="blossom" title="BirdNET 有一定把握，但建议结合现场情况综合判断">
        中等可信 · {pct}%
      </Badge>
    )
  }
  return (
    <span
      className="text-xs italic text-ink-faint"
      title="模型把握度很低，这很可能是误报或猜测，仅供参考"
    >
      低可信 · 仅供参考（{pct}%）
    </span>
  )
}

/** 识别模式档位 */
const MODES: ReadonlyArray<{ key: 'auto' | 'bird' | 'frog' | 'insect'; label: string }> = [
  { key: 'auto', label: '自动' },
  { key: 'bird', label: '鸟类' },
  { key: 'frog', label: '蛙类' },
  { key: 'insect', label: '虫类' },
]

/**
 * 把识别失败的原因文案归并为「连接失败 / 没听到鸟叫 / 录音或文件问题 / 其它」四档，
 * 给失败反馈 UI 一个清晰、醒目、说清问题的标题与说明。
 */
function classifyFailure(msg: string): { tone: 'red' | 'amber'; icon: string; title: string; detail: string } {
  const m = msg || ''
  // 录音 / 上传文件相关
  if (/麦克风|不支持录音|没有检测到麦克风|没有录到声音|停止录音|录音启动|请选择音频|音频文件过大|音频文件太小|空文件/.test(m)) {
    return { tone: 'amber', icon: '🎙️', title: '录音或文件没准备好', detail: m }
  }
  // 服务 / 网络 / 连接
  if (/服务|连接|网络|不可达|未启动|超时|无响应|fetch|network|网关/i.test(m)) {
    return {
      tone: 'red',
      icon: '📡',
      title: '识别服务连接失败，请检查网络后重试',
      detail: m || '识别服务暂时连不上，可能是网络波动或服务未启动。',
    }
  }
  // 没找到可识别的叫声 / 过短
  if (/没找到|没有可识别|过短|为空|没有得到识别结果|未找到|找不到/.test(m)) {
    return {
      tone: 'red',
      icon: '🔍',
      title: '没听到可识别的鸟叫声',
      detail:
        '这段音频里没找到可识别的鸟叫声（BirdNET 目前主要覆盖鸟类）。也可能是音频太短或环境太吵——换段清晰、稍长一点的录音再试。',
    }
  }
  // 兜底
  return { tone: 'amber', icon: '😣', title: '没能继续下去', detail: m || '出了点小状况，请稍后重试。' }
}

/**
 * 极醒目的失败反馈：警示色大区块 + 加粗大标题 + 明显边框底色 + 轻微 pulse 动效，
 * 配合主理人生成的「失败卡通图」（/assets/recognize-fail.webp，加载失败自动退化到 emoji，绝不崩）。
 */
function FailureAlert({ message, onDismiss }: { message: string; onDismiss: () => void }) {
  const [imgOk, setImgOk] = useState(true)
  const { tone, icon, title, detail } = classifyFailure(message)
  const isRed = tone === 'red'
  return (
    <div
      className={`rounded-3xl border-[3px] px-5 py-5 flex items-start gap-4 animate-fadeUp ${
        isRed
          ? 'bg-red-50 border-red-500 text-red-900 shadow-[0_10px_30px_-12px_rgba(220,38,38,0.45)]'
          : 'bg-amber-50 border-amber-500 text-amber-900 shadow-[0_10px_30px_-12px_rgba(217,119,6,0.45)]'
      }`}
      role="alert"
    >
      {/* 失败卡通图（主理人生成；加载失败自动退化到 emoji） */}
      <div
        className={`relative shrink-0 w-16 h-16 sm:w-20 sm:h-20 rounded-2xl grid place-items-center overflow-hidden border-2 animate-pulse ${
          isRed ? 'border-red-400 bg-red-100' : 'border-amber-400 bg-amber-100'
        }`}
      >
        {imgOk ? (
          <img
            src="/assets/recognize-fail.webp"
            alt="识别失败"
            className="w-full h-full object-cover"
            onError={() => setImgOk(false)}
          />
        ) : (
          <span className="text-3xl" aria-hidden="true">
            {icon}
          </span>
        )}
      </div>

      <div className="flex-1 min-w-0">
        <p className={`font-extrabold text-lg sm:text-xl ${isRed ? 'text-red-700' : 'text-amber-800'}`}>{title}</p>
        <p className={`text-sm mt-1.5 leading-relaxed ${isRed ? 'text-red-800/90' : 'text-amber-800/90'}`}>{detail}</p>
      </div>

      <Button
        size="sm"
        variant="ghost"
        onClick={onDismiss}
        className={isRed ? 'text-red-700 hover:bg-red-100' : 'text-amber-800 hover:bg-amber-100'}
      >
        知道了
      </Button>
    </div>
  )
}

export default function Recognize() {
  const [phase, setPhase] = useState<Phase>('idle')
  const [clip, setClip] = useState<{ blob: Blob; name: string; seconds: number } | null>(null)
  const [items, setItems] = useState<RecognitionResult[]>([])
  const [fallbackReason, setFallbackReason] = useState('')
  const [uncataloged, setUncataloged] = useState<string[]>([])
  const [errorMsg, setErrorMsg] = useState('')
  const [seconds, setSeconds] = useState(0)
  const [level, setLevel] = useState(0)
  const [useGeo, setUseGeo] = useState(false)
  const [health, setHealth] = useState<ServiceHealth>({ state: 'checking' })
  /** 识别模式：自动 / 鸟类 / 蛙类 / 虫类，默认选中「鸟类」 */
  const [mode, setMode] = useState<'auto' | 'bird' | 'frog' | 'insect'>('bird')
  /** 蛙类 / 虫类 当前模型不支持，需要诚实告知 */
  const unsupportedMode = mode === 'frog' || mode === 'insect'

  const recorderRef = useRef<RecorderHandle | null>(null)
  const tickRef = useRef<number | null>(null)
  const clipUrlRef = useRef<string>('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  const { playingId, notice, play } = useCallPlayer()

  /* ------------------------------ 清理 ------------------------------ */

  const clearTick = useCallback(() => {
    if (tickRef.current) {
      window.clearInterval(tickRef.current)
      tickRef.current = null
    }
  }, [])

  useEffect(() => {
    return () => {
      clearTick()
      recorderRef.current?.cancel()
      if (clipUrlRef.current) URL.revokeObjectURL(clipUrlRef.current)
    }
  }, [clearTick])

  // 进页面探一次识别服务，徽章展示真实状态而不是只看有没有配地址
  useEffect(() => {
    let alive = true
    void probeService().then((h) => {
      if (alive) setHealth(h)
    })
    return () => {
      alive = false
    }
  }, [])

  const setClipSafe = useCallback(async (blob: Blob, name: string) => {
    if (clipUrlRef.current) URL.revokeObjectURL(clipUrlRef.current)
    clipUrlRef.current = URL.createObjectURL(blob)
    const sec = await getDuration(blob)
    setClip({ blob, name, seconds: sec })
    setPhase('ready')
  }, [])

  /* ------------------------------ 录音 ------------------------------ */

  const startRecording = async () => {
    setErrorMsg('')
    setItems([])
    const rec = createRecorder()
    recorderRef.current = rec
    try {
      await rec.start()
      setPhase('recording')
      setSeconds(0)
      tickRef.current = window.setInterval(() => {
        setLevel(rec.level())
        setSeconds((s) => {
          if (s + 0.1 >= MAX_SECONDS) {
            window.setTimeout(() => void stopRecording(), 0)
            return MAX_SECONDS
          }
          return s + 0.1
        })
      }, 100)
    } catch (err) {
      recorderRef.current = null
      setErrorMsg(err instanceof Error ? err.message : '录音启动失败')
      setPhase('error')
    }
  }

  const stopRecording = async () => {
    clearTick()
    setLevel(0)
    const rec = recorderRef.current
    if (!rec) return
    recorderRef.current = null
    try {
      const blob = await rec.stop()
      await setClipSafe(blob, `现场录音 ${new Date().toLocaleTimeString('zh-CN')}`)
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : '录音失败')
      setPhase('error')
    }
  }

  const cancelRecording = () => {
    clearTick()
    setLevel(0)
    recorderRef.current?.cancel()
    recorderRef.current = null
    setPhase('idle')
  }

  /* ------------------------------ 上传 ------------------------------ */

  const onFile = async (file?: File | null) => {
    if (!file) return
    const err = validateAudioFile(file)
    if (err) {
      setErrorMsg(err)
      setPhase('error')
      return
    }
    setErrorMsg('')
    setItems([])
    await setClipSafe(file, file.name)
  }

  const [dragging, setDragging] = useState(false)

  /* ------------------------------ 识别 ------------------------------ */

  const analyze = async () => {
    if (!clip) return
    setPhase('analyzing')
    setFallbackReason('')
    setUncataloged([])
    // 声类提示：仅「鸟类」真实生效；「蛙类/虫类」作占位透传给后端，便于将来扩展
    const groupHint: '鸟类' | '蛙类' | '昆虫' | undefined =
      mode === 'bird' ? '鸟类' : mode === 'frog' ? '蛙类' : mode === 'insect' ? '昆虫' : undefined
    try {
      // 用户勾选后才请求定位，不主动弹权限框
      const geo = useGeo ? await getPosition() : null
      const outcome = await recognizeWithDiagnostics(clip.blob, {
        lat: geo?.lat,
        lon: geo?.lon,
        date: new Date().toISOString().slice(0, 10),
        topK: 3,
        groupHint,
      })
      if (outcome.items.length === 0) {
        setErrorMsg('没有得到识别结果，可能是物种库为空或音频过短，请换一段再试')
        setPhase('error')
        return
      }
      setItems(outcome.items)
      setFallbackReason(outcome.fallback ? outcome.reason ?? '' : '')
      setUncataloged(outcome.uncataloged)
      setPhase('result')

      // 只把收录在库里的结果记进历史，避免占位卡污染「我的记录」
      const top = outcome.items.find((it) => it.inLibrary)
      if (top) {
        addHistory({
          speciesId: top.species.id,
          speciesName: top.species.name,
          confidence: top.confidence,
          at: Date.now(),
          source: top.source,
        })
      }
    } catch {
      setErrorMsg('识别过程出错了，请稍后重试')
      setPhase('error')
    }
  }

  const reset = () => {
    if (clipUrlRef.current) {
      URL.revokeObjectURL(clipUrlRef.current)
      clipUrlRef.current = ''
    }
    setClip(null)
    setItems([])
    setErrorMsg('')
    setFallbackReason('')
    setUncataloged([])
    setPhase('idle')
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  /** 识别服务状态徽章文案 */
  const healthBadge = {
    checking: { tone: 'wood' as const, text: '识别服务：探测中…' },
    online: { tone: 'moss' as const, text: '识别服务：已连接' },
    offline: { tone: 'sunset' as const, text: '识别服务：离线（走本地示例）' },
    unconfigured: { tone: 'wood' as const, text: '识别服务：本地示例模式' },
  }[health.state]

  /* ------------------------------ 渲染 ------------------------------ */

  const recordable = isRecordingSupported()

  return (
    <div className="space-y-8">
      <div>
        <SectionTitle
          title="识籁 · 声音识别"
          sub="录一段现场声音，或上传一个音频文件，AI 会给出最可能的 3 个物种"
        />
        <div className="flex flex-wrap gap-2">
          <Badge tone={healthBadge.tone} title={health.detail}>
            {healthBadge.text}
          </Badge>
          <Badge tone="feather">支持 wav / mp3 / m4a / ogg / webm</Badge>
          <Badge tone="blossom">单段建议 5–30 秒</Badge>
        </div>
      </div>

      {/* ============================ 识别模式 ============================ */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-semibold text-ink-soft mr-1">识别模式</span>
        {MODES.map((m) => {
          const active = mode === m.key
          return (
            <button
              key={m.key}
              type="button"
              onClick={() => setMode(m.key)}
              aria-pressed={active}
              className={`rounded-full px-4 py-1.5 text-sm font-semibold transition sketch-border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-feather focus-visible:ring-offset-2 focus-visible:ring-offset-paper ${
                active
                  ? 'bg-ink text-paper-light shadow-soft'
                  : 'bg-wood-light/50 text-ink-soft hover:bg-wood-light hover:text-ink'
              }`}
            >
              {m.label}
            </button>
          )
        })}
      </div>

      {/* 蛙类 / 虫类：当前模型只覆盖鸟类，诚实告知（仍允许点识别） */}
      {unsupportedMode && (
        <div
          className="rounded-2xl border-2 border-amber-400 bg-amber-50 px-5 py-4 flex items-start gap-3 animate-fadeUp"
          role="alert"
        >
          <span className="text-2xl" aria-hidden="true">⚠️</span>
          <div className="flex-1">
            <p className="font-bold text-amber-900 text-base">该模式暂不支持，结果仅供参考</p>
            <p className="text-sm text-amber-800/90 mt-1 leading-relaxed">
              当前识别模型主要覆盖<strong className="text-amber-900">鸟类</strong>
              ，蛙类 / 虫类识别敬请期待。你仍可以点「开始识别」，但下方结果为鸟类引擎输出，不代表蛙类 / 虫类判别。
            </p>
          </div>
        </div>
      )}

      {/* ============================ 输入区 ============================ */}
      <Card className="p-6 sm:p-8">
        {/* —— 空态：录音 + 上传 —— */}
        {(phase === 'idle' || phase === 'error') && (
          <div className="space-y-6">
            <div
              onDragOver={(e) => {
                e.preventDefault()
                setDragging(true)
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => {
                e.preventDefault()
                setDragging(false)
                void onFile(e.dataTransfer.files?.[0])
              }}
              className={`rounded-3xl border-2 border-dashed transition-colors duration-200 px-6 py-12 text-center ${
                dragging ? 'border-moss bg-moss/10' : 'border-wood/60 bg-wood-light/15'
              }`}
            >
              <div className="mx-auto w-20 h-20 grid place-items-center rounded-full bg-paper-light shadow-soft mb-5">
                <svg viewBox="0 0 32 32" className="w-9 h-9" fill="none" stroke="#4F6B4A" strokeWidth="2" strokeLinecap="round">
                  <rect x="12" y="4" width="8" height="15" rx="4" />
                  <path d="M7 15a9 9 0 0018 0M16 24v4M11 28h10" />
                </svg>
              </div>
              <p className="font-bold text-ink text-lg">把自然的声音交给我们</p>
              <p className="text-sm text-ink-soft mt-2 max-w-md mx-auto leading-relaxed">
                点「开始录音」现场收音，或把音频文件拖到这里 / 点击上传
              </p>

              <div className="flex flex-wrap justify-center gap-3 mt-7">
                <Button size="lg" onClick={startRecording} disabled={!recordable}>
                  <span className="w-2.5 h-2.5 rounded-full bg-ink/70" />
                  开始录音
                </Button>
                <Button size="lg" variant="soft" onClick={() => fileInputRef.current?.click()}>
                  上传音频文件
                </Button>
              </div>

              {!recordable && (
                <p className="text-xs text-ink-faint mt-4">
                  当前浏览器或环境不支持录音（需 HTTPS），请使用「上传音频文件」
                </p>
              )}

              <input
                ref={fileInputRef}
                type="file"
                accept={ACCEPTED_AUDIO}
                className="hidden"
                onChange={(e) => void onFile(e.target.files?.[0])}
              />
            </div>

            {/* 录音 / 上传小贴士（低调、与现有 UI 调性一致） */}
            <div className="rounded-2xl bg-wood-light/15 sketch-border px-5 py-4">
              <p className="text-xs font-semibold text-ink-soft mb-2">录音小贴士</p>
              <ul className="space-y-1.5 text-xs text-ink-soft leading-relaxed">
                <li className="flex gap-2">
                  <span className="text-leaf shrink-0">·</span>
                  <span>尽量靠近鸣叫的鸟、减少环境噪声，识别会更准。</span>
                </li>
                <li className="flex gap-2">
                  <span className="text-sunset-dark shrink-0">·</span>
                  <span>
                    <b className="text-ink">不要对着音箱外放再录</b>
                    ：二次录音会大幅降低识别置信度，可能直接认不出来。
                  </span>
                </li>
                <li className="flex gap-2">
                  <span className="text-leaf shrink-0">·</span>
                  <span>
                    直接上传<b className="text-ink">原始音频文件</b>效果最好。
                  </span>
                </li>
                <li className="flex gap-2">
                  <span className="text-leaf shrink-0">·</span>
                  <span>
                    BirdNET 引擎目前主要覆盖<b className="text-ink">鸟类</b>
                    ；蛙类、昆虫暂不支持（会走本地科普库展示）。
                  </span>
                </li>
              </ul>
            </div>

            {phase === 'error' && errorMsg && (
              <FailureAlert message={errorMsg} onDismiss={() => { setErrorMsg(''); setPhase('idle') }} />
            )}
          </div>
        )}

        {/* —— 录音中 —— */}
        {phase === 'recording' && (
          <div className="text-center py-8 animate-fadeUp">
            <div className="relative mx-auto w-28 h-28 grid place-items-center mb-6">
              <span className="absolute inset-0 rounded-full bg-sunset/35 animate-ripple" />
              <span className="absolute inset-0 rounded-full bg-sunset/25 animate-ripple" style={{ animationDelay: '0.6s' }} />
              <span
                className="relative grid place-items-center w-24 h-24 rounded-full bg-sunset shadow-lift transition-transform duration-100"
                style={{ transform: `scale(${1 + level * 0.16})` }}
              >
                <svg viewBox="0 0 32 32" className="w-10 h-10" fill="none" stroke="#3E342B" strokeWidth="2" strokeLinecap="round">
                  <rect x="12" y="4" width="8" height="15" rx="4" />
                  <path d="M7 15a9 9 0 0018 0M16 24v4" />
                </svg>
              </span>
            </div>

            <p className="font-bold text-ink text-lg">正在聆听…</p>
            <p className="text-3xl font-bold text-leaf tabular-nums mt-2">
              {seconds.toFixed(1)}
              <span className="text-base ml-1">秒</span>
            </p>
            <p className="text-xs text-ink-faint mt-1.5">最长 {MAX_SECONDS} 秒，到时会自动停止</p>

            {/* 实时电平条 */}
            <div className="flex items-end justify-center gap-1 h-12 mt-6">
              {Array.from({ length: 24 }).map((_, i) => {
                const h = Math.max(0.12, Math.min(1, level * (0.55 + Math.abs(Math.sin(i * 0.9 + seconds * 5)) * 0.9)))
                return (
                  <span
                    key={i}
                    className="w-1.5 rounded-full bg-moss transition-all duration-100"
                    style={{ height: `${h * 100}%` }}
                  />
                )
              })}
            </div>

            <div className="flex justify-center gap-3 mt-8">
              <Button size="lg" onClick={() => void stopRecording()}>
                <span className="w-3 h-3 rounded-[3px] bg-ink/70" />
                停止并识别
              </Button>
              <Button size="lg" variant="ghost" onClick={cancelRecording}>
                取消
              </Button>
            </div>
          </div>
        )}

        {/* —— 音频就绪 —— */}
        {phase === 'ready' && clip && (
          <div className="space-y-5 animate-fadeUp">
            <div className="flex items-center gap-4 rounded-3xl bg-wood-light/25 p-5 sketch-border">
              <span className="w-14 h-14 grid place-items-center rounded-2xl bg-paper-light shadow-soft text-2xl shrink-0">🎵</span>
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-ink truncate">{clip.name}</p>
                <p className="text-sm text-ink-soft mt-0.5">
                  {clip.seconds > 0 ? `${clip.seconds.toFixed(1)} 秒 · ` : ''}
                  {(clip.blob.size / 1024).toFixed(0)} KB
                </p>
              </div>
            </div>

            {clipUrlRef.current && (
              <audio src={clipUrlRef.current} controls className="w-full rounded-full" preload="metadata" />
            )}

            {/* 可选：带上定位。BirdNET 会按地理位置收窄候选物种，准确率明显提升 */}
            <label className="flex items-start gap-2.5 cursor-pointer select-none rounded-2xl bg-wood-light/15 px-4 py-3 sketch-border">
              <input
                type="checkbox"
                checked={useGeo}
                onChange={(e) => setUseGeo(e.target.checked)}
                className="mt-0.5 w-4 h-4 accent-moss shrink-0"
              />
              <span className="text-sm text-ink-soft leading-relaxed">
                <span className="font-semibold text-ink">带上我的位置，提升准确率</span>
                <br />
                识别模型会按经纬度和日期筛掉本地不可能出现的物种。位置只随这次识别发送，我们不保存。
              </span>
            </label>

            <div className="flex flex-wrap gap-3">
              <Button size="lg" onClick={() => void analyze()}>
                开始识别
              </Button>
              <Button size="lg" variant="ghost" onClick={reset}>
                换一段
              </Button>
            </div>
          </div>
        )}

        {/* —— 识别中 —— */}
        {phase === 'analyzing' && (
          <div className="text-center py-14 animate-fadeUp">
            <div className="mx-auto w-20 h-20 grid place-items-center mb-6">
              <svg viewBox="0 0 50 50" className="w-20 h-20 animate-spin" style={{ animationDuration: '1.6s' }}>
                <circle cx="25" cy="25" r="20" fill="none" stroke="#C8A87C" strokeWidth="4" opacity="0.3" />
                <circle cx="25" cy="25" r="20" fill="none" stroke="#4F6B4A" strokeWidth="4" strokeLinecap="round" strokeDasharray="34 100" />
              </svg>
            </div>
            <p className="font-bold text-ink text-lg">正在分辨这是谁的声音…</p>
            <p className="text-sm text-ink-soft mt-2">正在提取声纹特征并比对物种库</p>
            <div className="mt-6 max-w-xs mx-auto h-2 rounded-full bg-wood-light/45 overflow-hidden">
              <div
                className="h-full w-1/3 rounded-full bg-gradient-to-r from-moss to-sunset animate-shimmer"
                style={{ backgroundSize: '400px 100%' }}
              />
            </div>
          </div>
        )}

        {/* —— 结果 —— */}
        {phase === 'result' && (
          <div className="space-y-5">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <p className="font-bold text-ink text-lg">识别完成 · Top-{items.length} 候选</p>
              <Button variant="soft" size="sm" onClick={reset}>
                再识别一段
              </Button>
            </div>

            {/* 蛙类 / 虫类：模型暂不支持，结果区带明确免责说明 */}
            {unsupportedMode && (
              <div
                className="rounded-2xl border-2 border-amber-400 bg-amber-50 px-5 py-3.5 flex items-start gap-3"
                role="status"
              >
                <span className="text-lg" aria-hidden="true">ℹ️</span>
                <p className="text-sm text-amber-900 leading-relaxed flex-1 font-semibold">
                  （该模式模型暂不支持，以下为鸟类引擎结果，仅供参考）
                </p>
              </div>
            )}

            {fallbackReason && (
              <div className="rounded-2xl bg-feather/15 sketch-border px-5 py-3.5 flex items-start gap-3" role="status">
                <span aria-hidden="true">ℹ️</span>
                <p className="text-sm text-ink-soft leading-relaxed flex-1">
                  {fallbackReason}。这是我们为演示稳定性设计的降级策略：识别服务不可用时，
                  链路仍然完整可走通，结果仅作示例，不代表真实模型判断。
                </p>
              </div>
            )}

            {/* 高置信但不在我们库里的物种：明确告诉用户，不硬套成别的物种 */}
            {uncataloged.length > 0 && (
              <div className="rounded-2xl bg-blossom/20 sketch-border px-5 py-3.5 flex items-start gap-3" role="status">
                <span aria-hidden="true">🔍</span>
                <p className="text-sm text-ink-soft leading-relaxed flex-1">
                  识别到：
                  <span className="font-bold text-ink">{uncataloged.join('、')}</span>
                  （暂未收录）。听籁目前收录了 22 个常见物种的科普卡，这几位还在补录中，
                  我们已经记下它们了。
                </p>
              </div>
            )}

            {notice && <NoticeBar text={notice} />}

            <div className="space-y-4">
              {items.map((it, i) => (
                <Card
                  key={`${it.species.id}-${i}`}
                  className="p-5 animate-fadeUp"
                  style={{ animationDelay: `${i * 100}ms` }}
                >
                  <div className="flex items-start gap-4">
                    <div className="relative shrink-0">
                      <SpeciesAvatar
                        id={it.species.id}
                        name={it.species.name}
                        group={it.species.group}
                        src={it.species.image}
                        size={76}
                      />
                      <span className="absolute -top-1.5 -left-1.5 w-7 h-7 grid place-items-center rounded-full bg-ink text-paper-light text-xs font-bold shadow-soft">
                        {i + 1}
                      </span>
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-bold text-ink text-lg leading-tight">
                          <SpeciesName species={it.species} />
                        </h3>
                        {it.inLibrary && <GroupBadge group={it.species.group} />}
                        {i === 0 && <Badge tone="sunset">最可能</Badge>}
                        {!it.inLibrary && <Badge tone="wood">暂未收录</Badge>}
                      </div>
                      <p className="text-xs italic text-ink-faint mt-0.5">{it.species.scientific}</p>

                      <div className="mt-3">
                        <ConfidenceBar value={it.confidence} delay={i * 120} />
                      </div>

                      {/* 可信度分级：诚实展示模型把握度（本地兜底"离线示例"结果不显示） */}
                      {it.source !== 'local-fallback' && (
                        <div className="mt-1.5">
                          <CredibilityTag confidence={it.confidence} />
                        </div>
                      )}

                      <p className="text-sm text-ink-soft mt-3 line-clamp-2 leading-relaxed">
                        {it.species.callFeature}
                      </p>

                      {/* 命中窗口数：BirdNET 按 3 秒窗口滑动，命中越多说明叫得越持续 */}
                      {typeof it.hitCount === 'number' && it.hitCount > 1 && (
                        <p className="text-xs text-ink-faint mt-1.5">
                          这段音频里有 {it.hitCount} 个片段听起来像它
                        </p>
                      )}

                      {it.inLibrary ? (
                        <div className="flex items-center gap-2 mt-4 flex-wrap">
                          <PlayCallButton
                            playing={playingId === it.species.id}
                            onClick={() => play(it.species)}
                            size="sm"
                            label="听叫声"
                          />
                          <Link
                            to={`/learn/${it.species.id}`}
                            className="rounded-full px-3.5 py-1.5 text-sm font-semibold text-ink-soft hover:text-ink hover:bg-wood-light/50 transition sketch-border"
                          >
                            查看详情
                          </Link>
                        </div>
                      ) : (
                        <p className="text-xs text-ink-faint mt-4">
                          听籁科普库还没有它的档案，所以暂时没有叫声和详情页
                        </p>
                      )}
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          </div>
        )}
      </Card>

      {/* 使用提示 */}
      <div className="grid sm:grid-cols-3 gap-4">
        {[
          { icon: '🌅', t: '清晨录声最好', d: '日出后两小时是鸟类鸣唱高峰，背景噪音也最少。' },
          { icon: '🤫', t: '离声源近一点', d: '尽量减少风声、车流与人声，识别准确率会明显提升。' },
          { icon: '⏱️', t: '5–30 秒足够', d: '一段完整的鸣唱比一长段混杂录音更容易被认出来。' },
        ].map((t) => (
          <div key={t.t} className="rounded-3xl bg-paper-light/60 sketch-border p-5 paper-texture">
            <p className="text-xl">{t.icon}</p>
            <p className="font-bold text-ink mt-2 text-sm">{t.t}</p>
            <p className="text-sm text-ink-soft mt-1.5 leading-relaxed">{t.d}</p>
          </div>
        ))}
      </div>
    </div>
  )
}
