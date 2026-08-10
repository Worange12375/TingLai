// Web Audio / MediaRecorder 封装：播放（单例，含错误兜底）/ 录音（含时长与电平）/ 合成鸣叫
// 设计原则：任何一步失败都要抛出可读中文错误，页面层负责提示，绝不静默卡死。

/* ================================ 播放 ================================ */

let current: HTMLAudioElement | null = null

/** 停止当前播放 */
export function stopAudio(): void {
  if (current) {
    current.pause()
    current.currentTime = 0
    current = null
  }
}

export interface PlayHandle {
  stop: () => void
}

/**
 * 播放一段音频（全局单例：播新的会自动停旧的）。
 * @throws 中文可读错误，页面需 catch 后提示用户
 */
export function playAudio(
  url: string,
  opts: { onEnded?: () => void; onError?: (msg: string) => void } = {},
): PlayHandle {
  stopAudio()

  if (!url) {
    const msg = '该物种暂无叫声音频，我们正在补录'
    opts.onError?.(msg)
    return { stop: () => {} }
  }

  // 【重要】切勿为 audio 设置 crossOrigin！
  // iNaturalist / xeno-canto 外链音频均不返回 Access-Control-Allow-Origin（ACAO: null）；
  // 一旦设置 crossOrigin='anonymous'，浏览器强制走 CORS 模式，因源站无 ACAO 头而整条拦截，22 条叫声会全部哑掉。
  // 当前 22 条能响，完全靠「不设 crossOrigin」。若将来做波形/频谱可视化（createMediaElementSource），
  // Web Audio 会强制要求 CORS，届时不能把 crossOrigin 简单加回来，必须改走本地代理或自有 CDN，否则依旧全哑。
  const audio = new Audio()
  audio.preload = 'auto'
  audio.src = url
  current = audio

  let settled = false

  // 8 秒仍未可播放 → 判定为加载失败（外链音频常见）
  const timer = window.setTimeout(() => {
    if (!settled && audio.readyState < 2) {
      settled = true
      stopAudio()
      opts.onError?.('叫声加载超时，可能是网络或音频源不可用')
    }
  }, 8000)

  const clear = () => {
    settled = true
    window.clearTimeout(timer)
  }

  audio.addEventListener('playing', clear, { once: true })
  audio.addEventListener('ended', () => {
    clear()
    if (current === audio) current = null
    opts.onEnded?.()
  })
  audio.addEventListener('error', () => {
    clear()
    if (current === audio) current = null
    opts.onError?.('叫声音频加载失败，请稍后再试')
  })

  audio.play().catch((err: unknown) => {
    clear()
    if (current === audio) current = null
    const name = (err as { name?: string })?.name
    opts.onError?.(
      name === 'NotAllowedError'
        ? '浏览器拦截了自动播放，请再点一次按钮'
        : '叫声播放失败，请检查网络或稍后再试',
    )
  })

  return {
    stop: () => {
      clear()
      if (current === audio) stopAudio()
    },
  }
}

/* ================================ 录音 ================================ */

export interface RecorderHandle {
  start: () => Promise<void>
  stop: () => Promise<Blob>
  cancel: () => void
  /** 0~1 实时电平，用于波形动画 */
  level: () => number
}

function pickMimeType(): string {
  const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus']
  for (const t of candidates) {
    if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported?.(t)) return t
  }
  return ''
}

export function isRecordingSupported(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    !!navigator.mediaDevices?.getUserMedia &&
    typeof MediaRecorder !== 'undefined'
  )
}

/** 创建录音器：含麦克风电平分析，便于 UI 画实时波形 */
export function createRecorder(): RecorderHandle {
  let recorder: MediaRecorder | null = null
  let stream: MediaStream | null = null
  let ctx: AudioContext | null = null
  let analyser: AnalyserNode | null = null
  let chunks: BlobPart[] = []
  let buf: Uint8Array | null = null

  const teardown = () => {
    stream?.getTracks().forEach((t) => t.stop())
    ctx?.close().catch(() => {})
    stream = null
    ctx = null
    analyser = null
    recorder = null
    buf = null
  }

  return {
    async start() {
      if (!isRecordingSupported()) {
        throw new Error('当前浏览器不支持录音，请改用「上传音频文件」')
      }
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: true },
        })
      } catch (err) {
        const name = (err as { name?: string })?.name
        if (name === 'NotAllowedError' || name === 'SecurityError') {
          throw new Error('麦克风权限被拒绝，请在浏览器地址栏允许麦克风后重试')
        }
        if (name === 'NotFoundError') {
          throw new Error('没有检测到麦克风设备，请改用「上传音频文件」')
        }
        throw new Error('无法启动麦克风，请改用「上传音频文件」')
      }

      // 电平分析（失败不影响录音主流程）
      try {
        const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
        ctx = new AC()
        const src = ctx.createMediaStreamSource(stream)
        analyser = ctx.createAnalyser()
        analyser.fftSize = 512
        buf = new Uint8Array(analyser.frequencyBinCount)
        src.connect(analyser)
      } catch {
        analyser = null
      }

      const mimeType = pickMimeType()
      recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream)
      chunks = []
      recorder.ondataavailable = (e) => e.data.size > 0 && chunks.push(e.data)
      recorder.start(200)
    },

    async stop() {
      return new Promise<Blob>((resolve, reject) => {
        if (!recorder) {
          teardown()
          return reject(new Error('录音尚未开始'))
        }
        const type = recorder.mimeType || 'audio/webm'
        recorder.onstop = () => {
          const blob = new Blob(chunks, { type })
          teardown()
          if (blob.size === 0) reject(new Error('没有录到声音，请确认麦克风工作正常'))
          else resolve(blob)
        }
        try {
          recorder.stop()
        } catch {
          teardown()
          reject(new Error('停止录音失败，请刷新页面重试'))
        }
      })
    },

    cancel() {
      try {
        recorder?.state !== 'inactive' && recorder?.stop()
      } catch {
        /* ignore */
      }
      teardown()
    },

    level() {
      if (!analyser || !buf) return 0
      analyser.getByteTimeDomainData(buf as Uint8Array<ArrayBuffer>)
      let peak = 0
      for (let i = 0; i < buf.length; i++) peak = Math.max(peak, Math.abs(buf[i] - 128) / 128)
      return Math.min(1, peak * 1.8)
    },
  }
}

/* ============================ 音频文件校验 ============================ */

export const ACCEPTED_AUDIO = '.wav,.mp3,.m4a,.ogg,.webm,.flac,audio/*'
const MAX_SIZE = 20 * 1024 * 1024 // 20MB

/** 校验上传文件，返回错误信息或 null */
export function validateAudioFile(file: File): string | null {
  const okType = file.type.startsWith('audio/') || /\.(wav|mp3|m4a|ogg|webm|flac|aac)$/i.test(file.name)
  if (!okType) return '请选择音频文件（wav / mp3 / m4a / ogg / webm）'
  if (file.size > MAX_SIZE) return '音频文件过大（上限 20MB），请截取一段再上传'
  if (file.size < 1024) return '音频文件太小，可能是空文件'
  return null
}

/** 读取音频时长（秒）；失败返回 0 */
export async function getDuration(blob: Blob): Promise<number> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(blob)
    const a = new Audio(url)
    const done = (v: number) => {
      URL.revokeObjectURL(url)
      resolve(v)
    }
    a.addEventListener('loadedmetadata', () => {
      const d = a.duration
      done(Number.isFinite(d) ? d : 0)
    })
    a.addEventListener('error', () => done(0))
    window.setTimeout(() => done(0), 4000)
  })
}

/* ========================= 合成鸣叫（无音频源兜底） ========================= */

/**
 * 当物种没有真实叫声音频时，用 WebAudio 合成一段"示意音"，
 * 让交互链路不至于断掉（UI 需明确标注为示意音，不冒充真实录音）。
 */
export function playSynthCall(seed: string, group: string): PlayHandle {
  let ctx: AudioContext | null = null
  try {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    ctx = new AC()
  } catch {
    return { stop: () => {} }
  }

  let h = 0
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0

  const now = ctx.currentTime
  const master = ctx.createGain()
  master.gain.value = 0.16
  master.connect(ctx.destination)

  // 不同类群用不同音色规则：鸟=高频滑音颤音，蛙=低频脉冲，虫=持续高频
  const isBird = group === '鸟类'
  const isFrog = group === '蛙类'
  const base = isBird ? 1500 + (h % 900) : isFrog ? 190 + (h % 90) : 3200 + (h % 700)
  const pulses = isBird ? 4 + (h % 3) : isFrog ? 5 + (h % 4) : 1
  const gap = isBird ? 0.17 : isFrog ? 0.22 : 0

  if (pulses === 1) {
    // 昆虫：持续振翅音（方波 + 颤动）
    const osc = ctx.createOscillator()
    const g = ctx.createGain()
    const trem = ctx.createOscillator()
    const tremGain = ctx.createGain()
    osc.type = 'sawtooth'
    osc.frequency.value = base
    trem.frequency.value = 42
    tremGain.gain.value = 0.5
    trem.connect(tremGain)
    tremGain.connect(g.gain)
    g.gain.setValueAtTime(0.5, now)
    g.gain.setValueAtTime(0.5, now + 1.4)
    g.gain.linearRampToValueAtTime(0, now + 1.6)
    osc.connect(g)
    g.connect(master)
    osc.start(now)
    trem.start(now)
    osc.stop(now + 1.7)
    trem.stop(now + 1.7)
  } else {
    for (let i = 0; i < pulses; i++) {
      const t = now + i * gap
      const osc = ctx.createOscillator()
      const g = ctx.createGain()
      osc.type = isFrog ? 'square' : 'sine'
      const f = base * (isBird ? 1 + ((h >> (i * 2)) % 5) * 0.06 : 1)
      osc.frequency.setValueAtTime(f, t)
      osc.frequency.exponentialRampToValueAtTime(Math.max(80, f * (isBird ? 1.35 : 0.72)), t + gap * 0.7)
      g.gain.setValueAtTime(0.0001, t)
      g.gain.exponentialRampToValueAtTime(0.7, t + 0.02)
      g.gain.exponentialRampToValueAtTime(0.0001, t + gap * 0.85)
      osc.connect(g)
      g.connect(master)
      osc.start(t)
      osc.stop(t + gap)
    }
  }

  const total = pulses === 1 ? 1.8 : pulses * gap + 0.3
  const timer = window.setTimeout(() => ctx?.close().catch(() => {}), total * 1000 + 200)

  return {
    stop: () => {
      window.clearTimeout(timer)
      ctx?.close().catch(() => {})
    },
  }
}

/**
 * 智能播放：有真实音频走真实音频，失败或缺失则回落到合成示意音。
 * onFallback 会在回落时被调用，UI 应提示"当前为示意音"。
 */
export function playSpeciesCall(
  opts: {
    audioUrl: string
    id: string
    group: string
    onEnded?: () => void
    onFallback?: (reason: string) => void
  },
): PlayHandle {
  const { audioUrl, id, group, onEnded, onFallback } = opts
  if (!audioUrl) {
    onFallback?.('该物种暂无真实录音，播放的是 AI 合成示意音')
    const h = playSynthCall(id, group)
    window.setTimeout(() => onEnded?.(), 1800)
    return h
  }
  let fellBack = false
  const handle = playAudio(audioUrl, {
    onEnded,
    onError: (msg) => {
      if (fellBack) return
      fellBack = true
      onFallback?.(`${msg}，已切换为合成示意音`)
      playSynthCall(id, group)
      window.setTimeout(() => onEnded?.(), 1800)
    },
  })
  return handle
}
