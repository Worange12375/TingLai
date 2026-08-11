// 声音识别编排层
// ============================================================================
// 策略：自建 BirdNET 服务（server/recognize_service.py）优先
//       → 不可达 / 报错 / 超时 / 无结果 → 本地启发式兜底，UI 永不崩。
//
// 本层只做「编排」，不训练模型：
//   1. 组装 multipart 请求（音频 + 经纬度 + 日期 + 置信度阈值）
//   2. 兼容多种返回结构（我们自己的服务 / 社区 BirdNET server / 其它 API）
//   3. 用 src/data/recognition-map.json 把拉丁学名映射到我们的 speciesId
//   4. 命中 → 渲染科普卡；高置信但未收录 → 明确告诉用户「暂未收录」
//   5. 全链路失败 → 本地兜底并标注「离线示例结果」，绝不冒充真实模型输出
// ============================================================================
import { speciesList } from '../data/species'
import type { RecognitionItem, Species } from '../types/species'

/* ========================================================================== */
/*                                   配置                                      */
/* ========================================================================== */

const env = import.meta.env

/** 是否处于 vite dev 模式（生产构建时为 false，相关告警日志会被摇树掉） */
const IS_DEV = Boolean(env.DEV)

/**
 * 识别服务地址。支持以下环境变量（优先级从高到低）：
 *   1. VITE_BIRDNET_ENDPOINT —— 直接写完整 endpoint（含 /api/recognize），原样使用，最高优先级
 *   2. VITE_RECOGNIZE_API    —— 只写 base（如 https://host 或 https://host/api），代码自动补 /api/recognize
 *   3. VITE_API_BASE_URL     —— 对齐部署文档（用户填的是 https://tinglai.dushiofcourses.cn/api），
 *                               同样自动补 /api/recognize，纯 fallback，优先级最低
 * 无论取到哪种 base，都会：
 *   · 去掉末尾多余的 /api/recognize 或 /api（避免最终出现双重 /api/api/recognize）
 *   · 由代码统一拼接 /api/recognize
 * 例如用户填 VITE_API_BASE_URL=https://tinglai.dushiofcourses.cn/api
 *   → 归一化为 https://tinglai.dushiofcourses.cn
 *   → 最终请求 https://tinglai.dushiofcourses.cn/api/recognize
 * - 生产：VITE_RECOGNIZE_API / VITE_API_BASE_URL 都留空 → 走同源相对路径 /api/recognize（nginx 反代到容器 8000）
 * - 开发：上面都没配 → 默认 http://localhost:8000
 */
function resolveEndpoint(): string {
  // 1) 老变量：直接写完整 endpoint（含 /api/recognize），原样使用，最高优先级
  const legacy = (env.VITE_BIRDNET_ENDPOINT ?? '').trim()
  if (legacy) return legacy.replace(/\/+$/, '')

  // 2) / 3) base 类变量：优先 VITE_RECOGNIZE_API，其次 VITE_API_BASE_URL（对齐用户部署文档）。
  //    取「第一个非空值」；显式写成空串（如 VITE_RECOGNIZE_API=""）视为「未设置」，
  //    让位给 VITE_API_BASE_URL，避免空串把已配置的 base URL 静默覆盖。
  const base = (
    env.VITE_RECOGNIZE_API?.trim() ||
    env.VITE_API_BASE_URL?.trim() ||
    (IS_DEV ? 'http://localhost:8000' : '')
  )
  // 去掉末尾多余的 /api/recognize 或 /api 以及其它多余斜杠，避免重复拼接出现双 /api
  const clean = base
    .replace(/\/api\/recognize\/?$/, '')
    .replace(/\/api\/?$/, '')
    .replace(/\/+$/, '')
  return `${clean}/api/recognize`
}

const ENDPOINT = resolveEndpoint()

/**
 * 健康检查地址，由 endpoint 推导。
 * 标准路径（以 /api/recognize 结尾）→ 直接换成 /healthz。
 * 自定义 endpoint（VITE_BIRDNET_ENDPOINT 指向非标路径，如 /recognize）→ 取 origin + /healthz，
 * 避免把 /recognize 当 healthz 导致 405 误报 offline。
 */
const HEALTH_URL = (() => {
  const std = ENDPOINT.replace(/\/api\/recognize$/, '/healthz')
  if (std.endsWith('/healthz')) return std
  try {
    return `${new URL(ENDPOINT).origin}/healthz`
  } catch {
    return '/healthz'
  }
})()

const TIMEOUT_MS = Number(env.VITE_RECOGNIZE_TIMEOUT ?? 30000) || 30000

/**
 * 默认置信度下限，与后端 birdnet_engine.DEFAULT_MIN_CONF 保持一致（均为 0.10）。
 * 实测依据：同一段戴胜音频经二次录音劣化后，置信度会掉到 0.15~0.21，0.25 的阈值会把这些
 * 仍然正确的识别结果一刀切掉（detections 空 → 前端误走本地瞎猜兜底）。改到 0.10 后由
 * UI 按可信度分级（高≥0.50 / 中0.25~0.50 / 低<0.25）诚实展示，避免"AI 在瞎猜"的观感。
 */
const DEFAULT_MIN_CONF = 0.10

/** 未收录物种但置信度高于此值时，明确提示用户"识别到 X（暂未收录）" */
const NOTABLE_CONF = 0.5

/** 是否配置了远端识别服务（同源相对路径也算已配置） */
export function hasRemoteApi(): boolean {
  return Boolean(ENDPOINT)
}

/** 当前识别服务地址，供调试/关于页展示 */
export function getEndpoint(): string {
  return ENDPOINT
}

/* ========================================================================== */
/*                        物种映射表（林知声独占维护，只读）                      */
/* ========================================================================== */

/**
 * 软引用 src/data/recognition-map.json。
 * ⚠️ 用 import.meta.glob 而非 import：该文件由林知声维护，可能尚未创建。
 *    glob 匹配不到文件时返回空对象，**构建不会失败**，前端自动退化到字符串匹配。
 *    文件一旦创建，下次构建自动生效，无需改动本文件。
 */
const mapModules = import.meta.glob('../data/recognition-map*.json', {
  eager: true,
  import: 'default',
}) as Record<string, unknown>

/** 归一化物种名：去空格、转小写、压缩连续空白 */
function normKey(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, ' ')
}

/**
 * 解析映射表，同时兼容两种结构：
 *   A) { "Passer montanus": "eurasian-tree-sparrow" }
 *   B) { version: 1, map: { "Passer montanus": { speciesId, aliases?[] } } }
 * 返回 归一化学名/别名 → speciesId（空串表示"明确不收录"）
 */
function buildRecognitionMap(): Map<string, string> {
  const out = new Map<string, string>()
  // 精确优先：只认 recognition-map.json，避免误读到同名前缀的临时/测试文件
  const exactKey = Object.keys(mapModules).find((k) => k.endsWith('/recognition-map.json'))
  const raw = exactKey ? mapModules[exactKey] : undefined
  if (!raw || typeof raw !== 'object') return out

  const root = raw as Record<string, unknown>
  // 结构 B：有 map 字段就用它，否则整个对象当结构 A
  const entries = root.map && typeof root.map === 'object' ? (root.map as Record<string, unknown>) : root

  for (const [key, value] of Object.entries(entries)) {
    if (key === 'version' || key === 'map' || key === '$schema') continue
    const k = normKey(key)
    if (!k) continue

    if (typeof value === 'string') {
      out.set(k, value.trim())
      continue
    }
    if (value && typeof value === 'object') {
      const obj = value as { speciesId?: unknown; aliases?: unknown }
      const id = typeof obj.speciesId === 'string' ? obj.speciesId.trim() : ''
      out.set(k, id)
      if (Array.isArray(obj.aliases)) {
        for (const a of obj.aliases) {
          if (typeof a === 'string' && a.trim()) out.set(normKey(a), id)
        }
      }
    }
  }
  return out
}

const RECOGNITION_MAP = buildRecognitionMap()

// 开发期校验：映射到不存在的 speciesId 时告警（不阻塞、不抛错）
if (IS_DEV && RECOGNITION_MAP.size > 0) {
  const ids = new Set(speciesList.map((s) => s.id))
  const bad = [...RECOGNITION_MAP.entries()].filter(([, id]) => id && !ids.has(id))
  if (bad.length > 0) {
    console.warn(
      '[recognize] recognition-map.json 里有映射到不存在 speciesId 的条目，已忽略：',
      bad.map(([k, v]) => `${k} → ${v}`),
    )
  }
  console.info(`[recognize] 已加载物种映射表 ${RECOGNITION_MAP.size} 条，服务地址：${ENDPOINT}`)
}

/** 映射表是否已就绪（供 /dev 工具与关于页展示） */
export function getMapSize(): number {
  return RECOGNITION_MAP.size
}

const byId = new Map(speciesList.map((s) => [s.id, s]))

/**
 * 把远端返回的学名 / 俗名映射到本地物种。
 * 优先级：映射表精确命中 → 本地学名精确 → 本地中文名精确 → 包含式模糊匹配
 */
function matchSpecies(scientificName: string, commonName: string): Species | undefined {
  const sci = normKey(scientificName)
  const com = normKey(commonName)

  // 1) 映射表（林知声维护，最权威）
  for (const key of [sci, com]) {
    if (!key) continue
    const mapped = RECOGNITION_MAP.get(key)
    if (mapped !== undefined) {
      // 空串 = 明确标记"我们不收录这个物种"，直接返回未收录
      return mapped ? byId.get(mapped) : undefined
    }
  }

  // 2) 本地精确匹配
  const exact = speciesList.find(
    (s) => normKey(s.scientific) === sci || normKey(s.name) === com || normKey(s.name) === sci,
  )
  if (exact) return exact

  // 3) 模糊包含（拉丁名属名相同等情况），要求 key 足够长避免误命中
  if (sci.length >= 6) {
    const fuzzy = speciesList.find(
      (s) => normKey(s.scientific).includes(sci) || sci.includes(normKey(s.scientific)),
    )
    if (fuzzy) return fuzzy
  }
  return undefined
}

/* ========================================================================== */
/*                                 对外类型                                    */
/* ========================================================================== */

/** 调用识别时可附带的元数据（全部可选） */
export interface RecognizeMeta {
  /** 录制地纬度，与 lon 成对提供才生效 */
  lat?: number
  /** 录制地经度 */
  lon?: number
  /** 录制日期 YYYY-MM-DD，默认取今天 */
  date?: string
  /** 置信度下限，默认 0.10（与后端 birdnet_engine.DEFAULT_MIN_CONF 一致） */
  minConf?: number
  /** 最多返回几个候选，默认 3 */
  topK?: number
  /** 外部取消信号 */
  signal?: AbortSignal
}

/**
 * 识别结果条目。
 * 继承全站契约 RecognitionItem（species / confidence / source），
 * 额外带上编排层需要的判定信息。
 */
export interface RecognitionResult extends RecognitionItem {
  /** 是否命中我们的科普库（false 时 species 是占位卡，不可跳详情） */
  inLibrary: boolean
  /** 远端返回的原始拉丁学名 */
  scientificName: string
  /** 远端返回的原始俗名 */
  commonName: string
  /** 该物种在整段音频里命中的 3 秒窗口数，越大越可信 */
  hitCount?: number
  /** UI 可直接展示的补充说明，如「暂未收录进听籁科普库」 */
  note?: string
}

/** 兼容旧调用方 */
export interface RecognizeResult {
  species: string
  confidence: number
}

export interface RecognizeOutcome {
  items: RecognitionResult[]
  /** 是否走了本地兜底 */
  fallback: boolean
  /** 兜底原因（UI 展示，便于评委理解降级策略） */
  reason?: string
  /** 高置信但未收录的物种名，UI 可提示「识别到：X（暂未收录）」 */
  uncataloged: string[]
}

/* ========================================================================== */
/*                                 远端调用                                    */
/* ========================================================================== */

interface RemoteHit {
  scientificName: string
  commonName: string
  confidence: number
  hitCount?: number
}

function num(v: unknown, dflt = 0): number {
  const n = Number(v)
  return Number.isFinite(n) ? n : dflt
}

/** 兼容多种后端返回结构，抽取出统一的 RemoteHit 列表 */
function parseDetections(data: unknown): RemoteHit[] {
  const root = data as Record<string, unknown> | null
  const arr: unknown[] = Array.isArray(data)
    ? data
    : ((root?.detections as unknown[]) ??
      (root?.results as unknown[]) ??
      (root?.predictions as unknown[]) ??
      [])

  return arr
    .map((raw): RemoteHit | null => {
      const o = raw as Record<string, unknown>
      // 兼容后端返回「学名_英文名」合并串（如 BirdNET-Analyzer HTTP server）：
      // 仅对含下划线的做 split('_')[0]，空格分隔的二名法（Passer montanus）不受影响。
      const sci = String(o.scientificName ?? o.scientific_name ?? o.sci_name ?? '').trim().split('_')[0]
      const com = String(o.commonName ?? o.common_name ?? o.label ?? o.species ?? o.name ?? '').trim()
      if (!sci && !com) return null
      return {
        scientificName: sci || com,
        commonName: com || sci,
        confidence: num(o.confidence ?? o.score ?? o.probability, 0),
        hitCount: o.hitCount === undefined ? undefined : num(o.hitCount, 1),
      }
    })
    .filter((x): x is RemoteHit => x !== null)
}

/** 后端约定的错误体：{detections:[], error, message} */
async function readErrorMessage(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { message?: unknown }
    if (typeof body?.message === 'string' && body.message.trim()) return body.message.trim()
  } catch {
    /* 非 JSON 响应，忽略 */
  }
  return `识别服务返回 ${res.status}`
}

/** 给音频 Blob 起一个后端认得出扩展名的文件名 */
function fileNameOf(audio: Blob | File): string {
  if (audio instanceof File && audio.name) return audio.name
  const type = audio.type || ''
  const ext =
    /webm/.test(type) ? 'webm'
    : /ogg/.test(type) ? 'ogg'
    : /mp4|m4a|aac/.test(type) ? 'm4a'
    : /mpeg|mp3/.test(type) ? 'mp3'
    : /wav/.test(type) ? 'wav'
    : 'webm'
  return `clip.${ext}`
}

async function callRemote(
  audio: Blob | File,
  meta: RecognizeMeta,
  signal: AbortSignal,
): Promise<RemoteHit[]> {
  const form = new FormData()
  form.append('audio', audio, fileNameOf(audio))

  // 经纬度必须成对提供才有意义
  if (Number.isFinite(meta.lat) && Number.isFinite(meta.lon)) {
    form.append('lat', String(meta.lat))
    form.append('lon', String(meta.lon))
  }
  form.append('date', meta.date ?? new Date().toISOString().slice(0, 10))
  form.append('min_conf', String(meta.minConf ?? DEFAULT_MIN_CONF))
  form.append('top_k', String(Math.max(1, meta.topK ?? 3)))

  const res = await fetch(ENDPOINT, { method: 'POST', body: form, signal })
  if (!res.ok) throw new Error(await readErrorMessage(res))
  return parseDetections(await res.json())
}

/* ========================================================================== */
/*                                 本地兜底                                    */
/* ========================================================================== */

/**
 * 本地启发式兜底：用音频的可观测特征（大小 + 字节指纹）派生稳定伪随机，
 * 从本地物种库挑 Top-3。同一段音频重复识别结果一致，便于演示复现。
 * ⚠️ UI 必须明确标注为「离线示例结果」，不得冒充真实模型输出。
 */
async function localFallback(audio: Blob, topK: number): Promise<RecognitionResult[]> {
  if (speciesList.length === 0) return []

  let seed = Math.round(audio.size)
  try {
    const head = new Uint8Array(await audio.slice(0, 2048).arrayBuffer())
    for (let i = 0; i < head.length; i += 17) seed = (seed * 31 + head[i]) >>> 0
  } catch {
    /* ignore */
  }

  let s = seed || 1
  const rand = () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff
    return s / 0x7fffffff
  }

  const pool = [...speciesList]
  const picked: Species[] = []
  for (let i = 0; i < Math.min(topK, pool.length); i++) {
    picked.push(pool.splice(Math.floor(rand() * pool.length), 1)[0])
  }

  const base = 0.72 + rand() * 0.2
  return picked.map((sp, i) => ({
    species: sp,
    confidence: Math.max(0.08, Number((base - i * (0.18 + rand() * 0.08)).toFixed(3))),
    source: 'local-fallback' as const,
    inLibrary: true,
    scientificName: sp.scientific,
    commonName: sp.name,
    note: '离线示例结果',
  }))
}

/** 未收录物种的占位科普卡 */
function placeholderSpecies(hit: RemoteHit): Species {
  const label = hit.commonName || hit.scientificName
  return {
    id: `uncataloged-${normKey(hit.scientificName).replace(/[^a-z0-9]+/g, '-')}`,
    name: label,
    scientific: hit.scientificName,
    group: '其他',
    callFeature: '这个物种还没被收进听籁的科普库，我们会尽快补上它的叫声档案。',
    habit: '资料整理中',
    distribution: '资料整理中',
    protectLevel: '暂无级别信息',
    funFact: '',
    audioUrl: '',
    image: '',
    audioSource: '',
    audioLicense: '',
  }
}

/* ========================================================================== */
/*                                  主入口                                     */
/* ========================================================================== */

/**
 * 识别音频，返回 Top-N 物种 + 置信度 + 完整诊断信息。
 * **永远不会 reject** —— 任何失败都降级到本地兜底并在 outcome.reason 里说明原因。
 */
export async function recognizeWithDiagnostics(
  audio: Blob | File,
  meta: RecognizeMeta = {},
): Promise<RecognizeOutcome> {
  const topK = Math.max(1, meta.topK ?? 3)

  if (!ENDPOINT) {
    return {
      items: await localFallback(audio, topK),
      fallback: true,
      reason: '当前未配置识别服务地址，展示的是本地示例结果',
      uncataloged: [],
    }
  }

  const controller = new AbortController()
  const timer = window.setTimeout(() => controller.abort(), TIMEOUT_MS)
  const onExternalAbort = () => controller.abort()
  meta.signal?.addEventListener('abort', onExternalAbort, { once: true })

  try {
    const hits = await callRemote(audio, meta, controller.signal)
    if (hits.length === 0) {
      return {
        items: await localFallback(audio, topK),
        fallback: true,
        reason: '识别服务没有在这段音频里找到可识别的物种（BirdNET 目前只覆盖鸟类），已切换到本地示例结果',
        uncataloged: [],
      }
    }

    const uncataloged: string[] = []
    const items: RecognitionResult[] = hits
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, topK)
      .map((h) => {
        const local = matchSpecies(h.scientificName, h.commonName)
        const confidence = Math.max(0, Math.min(1, h.confidence))
        if (!local && confidence >= NOTABLE_CONF) {
          uncataloged.push(h.commonName || h.scientificName)
        }
        return {
          species: local ?? placeholderSpecies(h),
          confidence,
          source: 'birdnet' as const,
          inLibrary: Boolean(local),
          scientificName: h.scientificName,
          commonName: h.commonName,
          hitCount: h.hitCount,
          note: local ? undefined : '暂未收录进听籁科普库',
        }
      })

    return { items, fallback: false, uncataloged }
  } catch (err) {
    const aborted = (err as { name?: string })?.name === 'AbortError'
    const detail = err instanceof Error ? err.message : ''
    return {
      items: await localFallback(audio, topK),
      fallback: true,
      reason: aborted
        ? '识别服务响应超时，已切换到本地示例结果'
        : detail && !/failed to fetch|networkerror|load failed/i.test(detail)
          ? `${detail}，已切换到本地示例结果`
          : '识别服务暂不可用（可能未启动或网络受限），已切换到本地示例结果',
      uncataloged: [],
    }
  } finally {
    window.clearTimeout(timer)
    meta.signal?.removeEventListener('abort', onExternalAbort)
  }
}

/**
 * 干净的对外 API：识别音频 → Top-N 结果数组。
 * 供 Recognize / Learn 等页面调用；需要降级原因请用 recognizeWithDiagnostics。
 */
export async function recognize(
  audio: Blob | File,
  meta: RecognizeMeta = {},
): Promise<RecognitionResult[]> {
  const outcome = await recognizeWithDiagnostics(audio, meta)
  return outcome.items
}

/** 兼容旧调用方（Recognize 页原用名） */
export const recognizeAudio = recognizeWithDiagnostics

/* ========================================================================== */
/*                                健康检查                                     */
/* ========================================================================== */

export type ServiceState = 'checking' | 'online' | 'offline' | 'unconfigured'

export interface ServiceHealth {
  state: ServiceState
  /** 后端引擎状态：ready / lazy / error */
  engine?: string
  detail?: string
}

/**
 * 探测识别服务是否在线（3 秒超时）。用于页面徽章展示真实状态，
 * 而不是只看「有没有配地址」。失败返回 offline，不抛错。
 */
export async function probeService(): Promise<ServiceHealth> {
  if (!ENDPOINT) return { state: 'unconfigured' }
  const controller = new AbortController()
  const timer = window.setTimeout(() => controller.abort(), 3000)
  try {
    const res = await fetch(HEALTH_URL, { signal: controller.signal })
    if (!res.ok) return { state: 'offline', detail: `健康检查返回 ${res.status}` }
    const body = (await res.json()) as { engine?: string; detail?: string }
    return { state: 'online', engine: body?.engine, detail: body?.detail }
  } catch {
    return { state: 'offline', detail: '识别服务未启动或不可达' }
  } finally {
    window.clearTimeout(timer)
  }
}
