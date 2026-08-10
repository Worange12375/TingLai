// 声音识别编排层
// 策略：远端识别 API（BirdNET / ThinkSound）优先 → 失败/无 Key/CORS 拦截 → 本地启发式兜底
// 说明：本层只做「编排」，不训练模型；兜底逻辑保证演示链路在任何网络环境下都可跑通。
import { speciesList } from '../data/species'
import type { RecognitionItem, Species } from '../types/species'

/* --------------------------------- 配置 --------------------------------- */

interface ApiConfig {
  birdnetEndpoint: string
  thinksoundEndpoint: string
  apiKey: string
  timeoutMs: number
}

// Vite 环境变量（.env.local 里配 VITE_BIRDNET_ENDPOINT / VITE_RECOGNIZE_KEY 即可启用远端）
const env = (import.meta as unknown as { env?: Record<string, string | undefined> }).env ?? {}

const config: ApiConfig = {
  birdnetEndpoint: env.VITE_BIRDNET_ENDPOINT ?? '',
  thinksoundEndpoint: env.VITE_THINKSOUND_ENDPOINT ?? '',
  apiKey: env.VITE_RECOGNIZE_KEY ?? '',
  timeoutMs: 15000,
}

export function hasRemoteApi(): boolean {
  return Boolean(config.birdnetEndpoint || config.thinksoundEndpoint)
}

/* ------------------------------ 兼容旧接口 ------------------------------ */

export interface RecognizeResult {
  species: string
  confidence: number
}

/* ------------------------------- 远端调用 ------------------------------- */

interface RemoteHit {
  /** 远端返回的物种名（中文或拉丁名） */
  label: string
  confidence: number
}

async function callRemote(endpoint: string, blob: Blob, signal: AbortSignal): Promise<RemoteHit[]> {
  const form = new FormData()
  form.append('audio', blob, 'clip.webm')
  form.append('lat', '-1')
  form.append('lon', '-1')
  form.append('overlap', '0')

  const res = await fetch(endpoint, {
    method: 'POST',
    body: form,
    signal,
    headers: config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : undefined,
  })

  if (!res.ok) throw new Error(`识别服务返回 ${res.status}`)

  const data: unknown = await res.json()

  // 兼容多种返回结构：{results:[{...}]} / [{...}] / {predictions:[...]}
  const arr: unknown[] = Array.isArray(data)
    ? data
    : ((data as Record<string, unknown>)?.results as unknown[]) ??
      ((data as Record<string, unknown>)?.predictions as unknown[]) ??
      []

  return arr
    .map((raw): RemoteHit | null => {
      const o = raw as Record<string, unknown>
      const label = String(o.common_name ?? o.scientific_name ?? o.label ?? o.species ?? o.name ?? '')
      const conf = Number(o.confidence ?? o.score ?? o.probability ?? 0)
      if (!label) return null
      return { label, confidence: Number.isFinite(conf) ? conf : 0 }
    })
    .filter((x): x is RemoteHit => x !== null)
}

/** 把远端物种名映射到本地科普卡；映射不到则保留为"库外物种" */
function matchLocal(label: string): Species | undefined {
  const k = label.trim().toLowerCase()
  if (!k) return undefined
  return (
    speciesList.find((s) => s.name.toLowerCase() === k || s.scientific.toLowerCase() === k) ??
    speciesList.find(
      (s) => s.name.toLowerCase().includes(k) || k.includes(s.scientific.toLowerCase()),
    )
  )
}

/* ------------------------------- 本地兜底 ------------------------------- */

/**
 * 本地启发式兜底：用音频的可观测特征（大小、时长、字节指纹）派生稳定伪随机，
 * 从本地物种库挑 Top-3。同一段音频重复识别结果一致，便于演示复现。
 * ⚠️ UI 必须明确标注为「离线示例结果」，不得冒充真实模型输出。
 */
async function localFallback(blob: Blob): Promise<RecognitionItem[]> {
  if (speciesList.length === 0) return []

  // 取音频前若干字节做指纹，让不同音频得到不同结果
  let seed = Math.round(blob.size)
  try {
    const head = new Uint8Array(await blob.slice(0, 2048).arrayBuffer())
    for (let i = 0; i < head.length; i += 17) seed = (seed * 31 + head[i]) >>> 0
  } catch {
    /* ignore */
  }

  const pool = [...speciesList]
  const picked: Species[] = []
  let s = seed || 1
  const rand = () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff
    return s / 0x7fffffff
  }

  for (let i = 0; i < Math.min(3, pool.length); i++) {
    picked.push(pool.splice(Math.floor(rand() * pool.length), 1)[0])
  }

  // 递减且带扰动的置信度，看起来像真实模型输出
  const base = 0.72 + rand() * 0.2
  return picked.map((sp, i) => ({
    species: sp,
    confidence: Math.max(0.08, Number((base - i * (0.18 + rand() * 0.08)).toFixed(3))),
    source: 'local-fallback' as const,
  }))
}

/* -------------------------------- 主入口 -------------------------------- */

export interface RecognizeOutcome {
  items: RecognitionItem[]
  /** 是否走了本地兜底 */
  fallback: boolean
  /** 兜底原因（UI 可展示，便于评委理解降级策略） */
  reason?: string
}

/**
 * 识别音频，返回 Top-3 物种 + 置信度。
 * 永远不会 reject——失败会降级到本地兜底并在 outcome 里说明原因。
 */
export async function recognizeAudio(blob: Blob): Promise<RecognizeOutcome> {
  const endpoint = config.birdnetEndpoint || config.thinksoundEndpoint

  if (!endpoint) {
    return {
      items: await localFallback(blob),
      fallback: true,
      reason: '当前未配置识别服务地址，展示的是本地示例结果',
    }
  }

  const controller = new AbortController()
  const timer = window.setTimeout(() => controller.abort(), config.timeoutMs)

  try {
    const hits = await callRemote(endpoint, blob, controller.signal)
    if (hits.length === 0) throw new Error('识别服务未返回结果')

    const items: RecognitionItem[] = hits
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, 3)
      .map((h) => {
        const local = matchLocal(h.label)
        const species: Species =
          local ?? {
            id: `remote-${h.label.replace(/\s+/g, '-').toLowerCase()}`,
            name: h.label,
            scientific: h.label,
            group: '其他',
            callFeature: '该物种暂未收录进听籁科普库',
            habit: '资料整理中',
            distribution: '资料整理中',
            protectLevel: '暂无级别信息',
            funFact: '',
            audioUrl: '',
            image: '',
          }
        return {
          species,
          confidence: Math.max(0, Math.min(1, h.confidence)),
          source: config.birdnetEndpoint ? ('birdnet' as const) : ('thinksound' as const),
        }
      })

    return { items, fallback: false }
  } catch (err) {
    const aborted = (err as { name?: string })?.name === 'AbortError'
    return {
      items: await localFallback(blob),
      fallback: true,
      reason: aborted
        ? '识别服务响应超时，已切换到本地示例结果'
        : '识别服务暂不可用（可能是跨域或网络限制），已切换到本地示例结果',
    }
  } finally {
    window.clearTimeout(timer)
  }
}
