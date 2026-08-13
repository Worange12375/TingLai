/**
 * 听籁 SoundVerse · 本地管理员工具后端（Vite 开发服务器插件）
 * ============================================================================
 *
 * ⚠️ apply: 'serve' —— 这个插件**只在 `npm run dev` 时生效**，
 *    `npm run build` 完全不会加载它，生产包里不存在任何 /__admin 接口。
 *
 * 前端是纯静态站，改不了磁盘上的文件；管理员工具需要写 species.sample.json、
 * 落音频到 public/audio/、跑 ffmpeg。所以把这些能力做成 dev server 的中间件，
 * 由 Node 侧执行，浏览器只负责 UI。
 *
 * 提供的接口（全部挂在 /__admin 下）：
 *   GET  /__admin/state           读取物种库原始 JSON + 备份列表 + ffmpeg 可用性
 *   POST /__admin/save            校验 → 备份 → 写回 species.sample.json
 *   POST /__admin/upload          上传修正音频（不限文件名），自动改名 <id>.mp3
 *   POST /__admin/normalize       批量 ffmpeg 规范化（响度归一 + 高通 + 静音裁剪）
 *   POST /__admin/refetch         按源重抓音频到本地
 *   GET  /__admin/download?id=    下载某物种的原音频（远端音频由 Node 代理，绕开 CORS）
 *
 * 数据安全三条：
 *   1. 每次写入前自动备份 species.sample.json → species.sample.json.bak.<时间戳>
 *   2. 按 schema 校验（必填 / 类型 / 枚举），不通过直接拒写并返回逐条错误
 *   3. 未知字段原样透传，绝不静默丢弃
 */
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Plugin } from 'vite'

/* ========================================================================== */
/*                                 路径与常量                                   */
/* ========================================================================== */

const ROOT = process.cwd()
const SPECIES_JSON = path.join(ROOT, 'src', 'data', 'species.sample.json')
const RECOG_MAP_JSON = path.join(ROOT, 'src', 'data', 'recognition-map.json')
const ASSETS_DIR = path.join(ROOT, 'public', 'assets')
const AUDIO_DIR = path.join(ROOT, 'public', 'audio')
/** 音频原始外链存档（工具自用，不属于物种 schema，已 gitignore） */
const ORIGINS_JSON = path.join(ROOT, '.audio-origins.json')

/* --------------------------------------------------------------------------
 * 以下规则逐条对齐 src/data/ADMIN_SCHEMA.md（林知声维护的数据契约）。
 * 改这里之前请先看那份文档，不要各写各的。
 * -------------------------------------------------------------------------- */

/** §3.2 授权枚举，4 选 1，不得自由输入 */
const LICENSES = ['CC0', 'CC BY', 'CC BY-NC', 'CC BY-NC-SA 4.0']
/** §1 字段 4：管理工具只允许这 3 个值（"其他" 是运行时兜底，落库即脏数据） */
const GROUPS = ['鸟类', '蛙类', '昆虫']
/** §2 保护级别基础级别，4 选 1 */
const PROTECT_BASES = [
  '国家一级重点保护野生动物',
  '国家二级重点保护野生动物',
  '国家三有保护动物',
  '未列入国家保护名录',
]
/** §2 严格版正则：基础级别 + 可选的中文全角括号补充说明（1–20 字） */
const PROTECT_RE = new RegExp(`^(${PROTECT_BASES.join('|')})(（[^（）]{1,20}）)?$`)

/** §0 规则 4：字段顺序固定，写回时按此顺序序列化，保证 git diff 干净可审 */
const FIELD_ORDER = [
  'id', 'name', 'scientific', 'group', 'callFeature', 'habit',
  'distribution', 'protectLevel', 'funFact', 'audioUrl',
  'audioSource', 'audioLicense', 'image',
]
/** §1：13 个字段里 12 个必填不得为空，image 由 id 派生 */
const REQUIRED_FIELDS = FIELD_ORDER.filter((f) => f !== 'image')

/** §1 各文本字段的建议长度区间（越界只告警，不拦截） */
const TEXT_RANGE: Record<string, [number, number]> = {
  callFeature: [20, 120],
  habit: [20, 120],
  distribution: [10, 80],
  funFact: [20, 140],
}

/** §1 字段 10：音频扩展名白名单 */
const AUDIO_EXT = ['.mp3', '.m4a', '.wav', '.ogg']

const MAX_UPLOAD = 50 * 1024 * 1024

type Json = Record<string, unknown>

/** §1 字段 13：image 恒等于 /assets/npc-<id>.webp */
function derivedImage(id: string): string {
  return `/assets/npc-${id}.webp`
}

/**
 * §0 规则 1 + 4：按固定顺序序列化，且**绝不丢字段**。
 * 契约里的 13 个键无论有没有值都保留；契约之外的未知键原样追加在后面。
 */
function canonicalize(item: Json): Json {
  const out: Json = {}
  for (const f of FIELD_ORDER) out[f] = item[f] ?? ''
  for (const k of Object.keys(item)) {
    if (!(k in out)) out[k] = item[k]
  }
  return out
}

/* ========================================================================== */
/*                                  小工具                                     */
/* ========================================================================== */

function send(res: ServerResponse, status: number, body: unknown): void {
  const text = JSON.stringify(body)
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.setHeader('Cache-Control', 'no-store')
  res.end(text)
}

function readBody(req: IncomingMessage, limit = MAX_UPLOAD): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    let size = 0
    req.on('data', (c: Buffer) => {
      size += c.length
      if (size > limit) {
        reject(new Error(`请求体超过 ${Math.round(limit / 1024 / 1024)}MB 上限`))
        req.destroy()
        return
      }
      chunks.push(c)
    })
    req.on('end', () => resolve(Buffer.concat(chunks)))
    req.on('error', reject)
  })
}

async function readJsonBody<T = Json>(req: IncomingMessage): Promise<T> {
  const buf = await readBody(req, 16 * 1024 * 1024)
  return JSON.parse(buf.toString('utf8')) as T
}

/**
 * 跨平台安全替换文件：先尽量删掉目标，再 rename 到「不存在的路径」。
 * Windows 上直接 rename 覆盖一个正被占用（共享读锁，如浏览器正在播放、
 * 或 dev server 静态托管）的文件会报 EPERM；而「先删目录项 → rename 到
 * 不存在的路径」可以绕过这个限制。带几次重试，给占用方留出释放时间。
 */
/** 同步版安全替换（用于 transcode 等无需重试的场景） */
function safeReplaceSync(tmp: string, target: string): void {
  try { fs.rmSync(target, { force: true }) } catch { /* 忽略 */ }
  fs.renameSync(tmp, target)
}

/**
 * 上传音频落地：先尝试原地替换（删目录项 → rename 到不存在的路径，绕过共享读锁），
 * 重试等待杀毒/云同步释放；若目标被**独占锁死**（仍 EPERM/EBUSY），则退而求其次
 * 写成一个唯一文件名（<target>.up-<时间戳>），保证上传一定能成功，旧锁文件稍后手动清理。
 * 返回最终落地的文件路径 + 是否走了兜底分支。
 */
async function writeAudioRobust(tmp: string, target: string, buf: Buffer): Promise<{ file: string; fallback: boolean }> {
  // 先尝试原地替换（删目录项 → rename 到空路径，绕过共享读锁），重试等待锁释放
  for (let attempt = 0; attempt < 8; attempt++) {
    try { fs.rmSync(target, { force: true }) } catch { /* 目标可能不存在，忽略 */ }
    try {
      fs.renameSync(tmp, target)
      return { file: target, fallback: false }
    } catch (err: unknown) {
      const code = (err as NodeJS.ErrnoException)?.code
      if (code === 'EPERM' || code === 'EBUSY') {
        if (attempt < 7) {
          await new Promise((r) => setTimeout(r, 400))
          continue
        }
        break // 重试用尽，仍被独占锁死 → 走兜底唯一文件名
      }
      throw err // 非锁类错误（如磁盘满）直接抛出
    }
  }
  // 目标被系统独占锁死：写入唯一文件名兜底，保证上传一定成功
  const alt = `${target}.up-${Date.now()}`
  fs.writeFileSync(alt, buf)
  try { fs.rmSync(tmp, { force: true }) } catch { /* 临时文件清理失败忽略 */ }
  return { file: alt, fallback: true }
}

function stamp(): string {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`
}

function readSpecies(): Json[] {
  const raw = fs.readFileSync(SPECIES_JSON, 'utf8')
  const data = JSON.parse(raw)
  if (!Array.isArray(data)) throw new Error('species.sample.json 顶层不是数组')
  return data as Json[]
}

function listBackups(): { name: string; size: number; mtime: number }[] {
  const dir = path.dirname(SPECIES_JSON)
  if (!fs.existsSync(dir)) return []
  return fs
    .readdirSync(dir)
    .filter((f) => f.startsWith('species.sample.json.bak.'))
    .map((f) => {
      const st = fs.statSync(path.join(dir, f))
      return { name: f, size: st.size, mtime: st.mtimeMs }
    })
    .sort((a, b) => b.mtime - a.mtime)
}

function readOrigins(): Record<string, string> {
  try {
    return JSON.parse(fs.readFileSync(ORIGINS_JSON, 'utf8')) as Record<string, string>
  } catch {
    return {}
  }
}

function writeOrigins(next: Record<string, string>): void {
  try {
    fs.writeFileSync(ORIGINS_JSON, JSON.stringify(next, null, 2) + '\n', 'utf8')
  } catch {
    /* 存档失败不影响主流程 */
  }
}

/** 记录某物种音频的原始外链，供「按源重抓」使用 */
function rememberOrigin(id: string, url: string): void {
  if (!/^https?:\/\//i.test(url)) return
  const all = readOrigins()
  if (all[id] === url) return
  all[id] = url
  writeOrigins(all)
}

/* ========================================================================== */
/*                                 schema 校验                                 */
/* ========================================================================== */

export interface ValidationIssue {
  index: number
  id: string
  field: string
  level: 'error' | 'warn'
  message: string
}

/** 读取识别映射表（扁平 学名 → speciesId），文件缺失时返回空表 */
function readRecogMap(): Record<string, string> {
  try {
    const data = JSON.parse(fs.readFileSync(RECOG_MAP_JSON, 'utf8'))
    if (data && typeof data === 'object' && !Array.isArray(data)) {
      return data as Record<string, string>
    }
  } catch { /* 文件不存在或坏了，识别映射相关检查自动跳过 */ }
  return {}
}

/** §1 字段 5：类群与名字/学名的粗推断，用于交叉告警 */
function inferGroupFromText(text: string): string | '' {
  if (/蛙|蟾|雨蛙/.test(text)) return '蛙类'
  if (/蝉|蟋|螽|蟪蛄|纺织娘|虫/.test(text)) return '昆虫'
  if (/鸟|雀|鹃|鹂|鸠|鸫|鹎|鹮|鹤|鹛|戴胜|秧鸡|喜鹊/.test(text)) return '鸟类'
  return ''
}

/**
 * 按 ADMIN_SCHEMA.md 校验整个物种库。
 * error 级别拦截保存，warn 级别只提示。
 */
function validate(list: unknown): ValidationIssue[] {
  const issues: ValidationIssue[] = []
  if (!Array.isArray(list)) {
    return [{ index: -1, id: '', field: '(root)', level: 'error', message: '数据顶层必须是数组' }]
  }

  const seenId = new Map<string, number>()
  const seenName = new Map<string, number>()
  const seenSci = new Map<string, number>()

  const recogMap = readRecogMap()
  /** 映射表里出现过的学名（小写归一，做大小写/空格容错） */
  const mappedSci = new Set(
    Object.keys(recogMap).map((k) => k.toLowerCase().replace(/\s+/g, ' ').trim()),
  )
  const allIds = new Set(
    list.map((x) => (x && typeof x === 'object' ? String((x as Json).id ?? '') : '')).filter(Boolean),
  )

  list.forEach((item, index) => {
    const o = (item ?? {}) as Json
    const id = typeof o.id === 'string' ? o.id : ''
    const add = (field: string, level: 'error' | 'warn', message: string) =>
      issues.push({ index, id: id || `#${index + 1}`, field, level, message })

    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      add('(root)', 'error', '该条不是对象')
      return
    }

    // —— §0.1 必填 + 类型：12 个字段一个都不能空 ——
    for (const f of REQUIRED_FIELDS) {
      const v = o[f]
      if (v === undefined || v === null) { add(f, 'error', '缺少必填字段（契约要求 13 个键齐全）'); continue }
      if (typeof v !== 'string') { add(f, 'error', `必须是字符串，当前是 ${typeof v}`); continue }
      if (!v.trim()) add(f, 'error', '不能为空')
    }
    if (o.image !== undefined && typeof o.image !== 'string') {
      add('image', 'error', `必须是字符串，当前是 ${typeof o.image}`)
    }

    // —— §1 字段 1：id kebab-case + 全表唯一 ——
    if (id) {
      if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(id)) {
        add('id', 'error', 'id 必须是 kebab-case（小写字母/数字，连字符分隔），如 eurasian-tree-sparrow')
      }
      const prev = seenId.get(id)
      if (prev !== undefined) add('id', 'error', `id 与第 ${prev + 1} 条重复（id 是主键）`)
      else seenId.set(id, index)
    }

    // —— §1 字段 2：name 中文 2–8 字、唯一、无空格标点 ——
    const name = typeof o.name === 'string' ? o.name.trim() : ''
    if (name) {
      if (/[\s，。、；：！？,.;:!?]/.test(name)) add('name', 'error', '中文正式名不应含空格或标点')
      if (name.length < 2 || name.length > 8) add('name', 'warn', `建议 2–8 字，当前 ${name.length} 字`)
      const prev = seenName.get(name)
      if (prev !== undefined) add('name', 'error', `中文名与第 ${prev + 1} 条重复`)
      else seenName.set(name, index)
    }

    // —— §1 字段 3：scientific 双名法 + 唯一 ——
    const sci = typeof o.scientific === 'string' ? o.scientific.trim() : ''
    if (sci) {
      if (!/^[A-Z][a-z]+ [a-z-]+$/.test(sci)) {
        add('scientific', 'error', '须符合拉丁双名法：属名首字母大写 + 空格 + 小写种加词，如 Passer montanus')
      }
      const prev = seenSci.get(sci)
      if (prev !== undefined) add('scientific', 'error', `学名与第 ${prev + 1} 条重复`)
      else seenSci.set(sci, index)

      // §5 警告级：该物种够不到识别链路
      if (mappedSci.size > 0 && !mappedSci.has(sci.toLowerCase().replace(/\s+/g, ' ').trim())) {
        add('scientific', 'warn', '该学名未出现在 recognition-map.json 的键里，识别命中后查不到这张卡')
      }
    }

    // —— §1 字段 4：group 三值枚举（"其他" 视为脏数据） ——
    const group = typeof o.group === 'string' ? o.group.trim() : ''
    if (group && !GROUPS.includes(group)) {
      add('group', 'error',
        group === '其他'
          ? '"其他" 是运行时兜底值，不得写入数据层，请改为 鸟类 / 蛙类 / 昆虫'
          : `必须是 ${GROUPS.join(' / ')} 之一`)
    }
    // §5 警告级：类群与名字推断不一致
    if (group && GROUPS.includes(group)) {
      const guess = inferGroupFromText(`${name} ${sci}`)
      if (guess && guess !== group) {
        add('group', 'warn', `名称看起来像「${guess}」，但填的是「${group}」，请确认`)
      }
    }

    // —— §1 文本字段长度（越界只告警） ——
    for (const [f, [lo, hi]] of Object.entries(TEXT_RANGE)) {
      const v = o[f]
      if (typeof v === 'string' && v.trim()) {
        const n = v.trim().length
        if (n < lo || n > hi) add(f, 'warn', `建议 ${lo}–${hi} 字，当前 ${n} 字`)
      }
    }

    // —— §2 protectLevel ——
    const pl = typeof o.protectLevel === 'string' ? o.protectLevel.trim() : ''
    if (pl && !PROTECT_RE.test(pl)) {
      add('protectLevel', 'error',
        `须为「${PROTECT_BASES.join(' / ')}」之一，后面可选跟中文全角括号补充说明（1–20 字）`)
    }

    // —— §3.2 audioLicense 枚举（空值已在必填里拦过） ——
    const lic = typeof o.audioLicense === 'string' ? o.audioLicense.trim() : ''
    if (lic && !LICENSES.includes(lic)) {
      add('audioLicense', 'error', `必须是 ${LICENSES.join(' / ')} 之一，禁止 CC BY-SA / ARR / 未知 等枚举外取值`)
    }

    // —— §3.1 audioSource 四要素 ——
    const src = typeof o.audioSource === 'string' ? o.audioSource.trim() : ''
    if (src) {
      if (src.length < 20) add('audioSource', 'warn', `署名过短（${src.length} 字），须含 平台+编号+录制者+日期+地点`)
      if (!/#\d+|XC\d+/i.test(src)) add('audioSource', 'warn', '缺少素材编号（形如 #1595435 或 XC777570）')
      if (!src.includes('录制者')) add('audioSource', 'warn', '缺少「录制者：」')
      if (!/\d{4}-\d{2}-\d{2}/.test(src)) add('audioSource', 'warn', '缺少 YYYY-MM-DD 日期')
    }

    // —— §1 字段 10：audioUrl ——
    const audioUrl = typeof o.audioUrl === 'string' ? o.audioUrl.trim() : ''
    if (audioUrl) {
      const isRemote = /^https:\/\//i.test(audioUrl)
      const isLocal = audioUrl.startsWith('/audio/')
      if (/^http:\/\//i.test(audioUrl)) {
        add('audioUrl', 'error', '必须用 https://（站点是 HTTPS，http 外链会被浏览器拦成混合内容）')
      } else if (!isRemote && !isLocal) {
        add('audioUrl', 'error', '必须是 https:// 外链，或本工具落地的 /audio/<id>.<ext> 本地路径')
      }
      const ext = (audioUrl.split('?')[0].match(/\.[a-z0-9]+$/i) ?? [''])[0].toLowerCase()
      if (ext && !AUDIO_EXT.includes(ext)) {
        add('audioUrl', 'error', `扩展名 ${ext} 不在白名单 ${AUDIO_EXT.join(' / ')} 内`)
      }
      if (isLocal) {
        // 契约 §1 原文要求 https 外链；本地化是管理工具引入的新形态，放行但留痕，避免和林知声的校验器打架
        const p = path.join(ROOT, 'public', audioUrl.replace(/^\//, ''))
        if (!fs.existsSync(p)) add('audioUrl', 'error', `本地音频文件不存在：public${audioUrl}`)
        else add('audioUrl', 'warn', '已本地化（契约原文写的是 https 外链），原始出处请确保仍记录在 audioSource 里')
      }
    }

    // —— §1 字段 13：image ——
    // 后台是开发人员在用，校验只兜底“明显写错”（空值 / 非本地路径 / 落到了别的目录），
    // 不强制固定文件名，给运营留灵活度。当前站点设计里 image 只会有两类合法来源：
    //   1) AI 插画：/assets 目录下任意文件（约定 /assets/npc-<id>.webp）
    //   2) 真实照片：/photos 目录（林知声补图，/photos/<id>.<ext>）
    // 文件缺失只告警不拦截（插画/照片可能稍后补）。仅影响 AdminTool 本地校验，不改动任何生产数据。
    const image = typeof o.image === 'string' ? o.image.trim() : ''
    const isLocalAsset = /^\/?assets\//.test(image)
    const isPhoto = /^\/?photos\//.test(image)
    if (id && image && !isLocalAsset && !isPhoto) {
      add('image', 'error', '必须是 /assets/（AI 插画）或 /photos/（真实照片）下的本地路径')
    }
    if (id && image && !fs.existsSync(path.join(ROOT, 'public', image.replace(/^\//, '')))) {
      add('image', 'warn', `图片文件不存在：public${image}（若稍后补图可忽略）`)
    }
  })

  // —— §5 错误级：recognition-map.json 悬空映射 ——
  if (allIds.size > 0) {
    for (const [sciKey, target] of Object.entries(recogMap)) {
      if (typeof target === 'string' && target && !allIds.has(target)) {
        issues.push({
          index: -1,
          id: target,
          field: 'recognition-map.json',
          level: 'error',
          message: `悬空映射："${sciKey}" → "${target}"，但物种库里没有这个 id（识别命中后会白屏）`,
        })
      }
    }
  }

  return issues
}

/* ========================================================================== */
/*                                  ffmpeg                                     */
/* ========================================================================== */

function run(cmd: string, args: string[], timeoutMs = 120000): Promise<{ code: number; stderr: string }> {
  return new Promise((resolve) => {
    let stderr = ''
    let done = false
    const child = spawn(cmd, args, { windowsHide: true })
    const timer = setTimeout(() => {
      if (!done) { child.kill('SIGKILL'); resolve({ code: -1, stderr: stderr + '\n[超时被终止]' }) }
    }, timeoutMs)
    child.stderr?.on('data', (d) => { stderr += String(d) })
    child.on('error', (err) => {
      if (done) return
      done = true; clearTimeout(timer)
      resolve({ code: -1, stderr: String(err) })
    })
    child.on('close', (code) => {
      if (done) return
      done = true; clearTimeout(timer)
      resolve({ code: code ?? -1, stderr })
    })
  })
}

async function hasFfmpeg(): Promise<boolean> {
  const { code } = await run('ffmpeg', ['-version'], 8000)
  return code === 0
}

/**
 * 带超时的 fetch，避免远端音频源慢/挂掉时把 dev server 中间件（乃至整个 UI 请求）卡死。
 * abort 后 fetch 抛 AbortError，调用方按下载失败处理。
 */
async function fetchWithTimeout(
  url: string,
  ms: number,
  headers: Record<string, string> = {},
): Promise<Response> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), ms)
  try {
    return await fetch(url, { headers, signal: ctrl.signal })
  } finally {
    clearTimeout(timer)
  }
}

/**
 * 规范化滤镜链：
 *   highpass=f=120        砍掉 120Hz 以下的风噪/交流声
 *   loudnorm              EBU R128 响度归一，各条音量一致，听感不忽大忽小
 *   silenceremove ×2      配合 areverse 裁掉首尾静音（中间静音保留，那是叫声的节奏）
 */
const FILTER_CHAIN = [
  'highpass=f=120',
  'loudnorm=I=-16:TP=-1.5:LRA=11',
  'silenceremove=start_periods=1:start_duration=0:start_threshold=-45dB:detection=peak',
  'areverse',
  'silenceremove=start_periods=1:start_duration=0:start_threshold=-45dB:detection=peak',
  'areverse',
].join(',')

async function transcode(input: string, output: string, normalize: boolean): Promise<{ ok: boolean; error?: string }> {
  fs.mkdirSync(path.dirname(output), { recursive: true })
  const tmp = output + '.tmp.mp3'
  const args = ['-hide_banner', '-loglevel', 'error', '-y', '-i', input]
  if (normalize) args.push('-af', FILTER_CHAIN)
  args.push('-ac', '1', '-ar', '44100', '-b:a', '128k', '-codec:a', 'libmp3lame', tmp)

  const { code, stderr } = await run('ffmpeg', args, 180000)
  if (code !== 0 || !fs.existsSync(tmp)) {
    try { fs.existsSync(tmp) && fs.unlinkSync(tmp) } catch { /* ignore */ }
    return { ok: false, error: (stderr || 'ffmpeg 执行失败').slice(-400) }
  }
  safeReplaceSync(tmp, output)
  return { ok: true }
}

/** 把远端音频下载到临时文件（30s 超时，避免慢源卡死中间件） */
async function download(url: string): Promise<string> {
  let res: Response
  try {
    res = await fetchWithTimeout(url, 30000, {
      'User-Agent': 'TingLai-SoundVerse-AdminTool/1.0 (contest project)',
    })
  } catch (err) {
    if ((err as { name?: string })?.name === 'AbortError') {
      throw new Error('下载超时（30s）：源站响应太慢或不可达，请稍后重试或换用本地音频')
    }
    throw new Error(`下载失败：${err instanceof Error ? err.message : String(err)}`)
  }
  if (!res.ok) throw new Error(`下载失败 HTTP ${res.status}`)
  const buf = Buffer.from(await res.arrayBuffer())
  if (buf.length < 1024) throw new Error('下载到的文件过小，可能是错误页')
  const ext = path.extname(new URL(url).pathname) || '.mp3'
  const tmp = path.join(AUDIO_DIR, `.tmp-dl-${Date.now()}${ext}`)
  fs.mkdirSync(AUDIO_DIR, { recursive: true })
  fs.writeFileSync(tmp, buf)
  return tmp
}

/** 解析某物种音频的本地来源：本地文件直接返回，远端先下载 */
async function resolveSource(sp: Json): Promise<{ file: string; temp: boolean }> {
  const url = String(sp.audioUrl ?? '')
  if (!url) throw new Error('该条没有 audioUrl')
  if (url.startsWith('/')) {
    const p = path.join(ROOT, 'public', url.replace(/^\//, ''))
    if (!fs.existsSync(p)) throw new Error(`本地文件不存在：public${url}`)
    return { file: p, temp: false }
  }
  return { file: await download(url), temp: true }
}

/* ========================================================================== */
/*                                   插件本体                                   */
/* ========================================================================== */

export function adminToolPlugin(): Plugin {
  return {
    name: 'tinglai-admin-tool',
    // 只在开发服务器生效；生产构建根本不会走到这里
    apply: 'serve',

    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = req.url ?? ''
        if (!url.startsWith('/__admin/')) return next()

        const route = url.split('?')[0]
        const query = new URLSearchParams(url.split('?')[1] ?? '')

        try {
          /* ------------------------- 读取全量状态 ------------------------- */
          if (route === '/__admin/state' && req.method === 'GET') {
            const species = readSpecies()
            // 顺手把当前的远端外链存档下来，之后本地化了还能「按源重抓」
            for (const sp of species) {
              const id = String(sp.id ?? '')
              const au = String(sp.audioUrl ?? '')
              if (id && /^https?:\/\//i.test(au)) rememberOrigin(id, au)
            }
            const localAudio = fs.existsSync(AUDIO_DIR)
              ? fs.readdirSync(AUDIO_DIR).filter((f) => !f.startsWith('.'))
              : []
            const localAssets = fs.existsSync(ASSETS_DIR)
              ? fs.readdirSync(ASSETS_DIR).filter((f) => !f.startsWith('.'))
              : []
            return send(res, 200, {
              species,
              issues: validate(species),
              backups: listBackups(),
              origins: readOrigins(),
              localAudio,
              localAssets,
              recognitionMap: readRecogMap(),
              ffmpeg: await hasFfmpeg(),
              // 下拉框的取值来源统一由后端下发，避免前后端各写一份枚举导致漂移
              schema: {
                fieldOrder: FIELD_ORDER,
                required: REQUIRED_FIELDS,
                groups: GROUPS,
                licenses: LICENSES,
                protectBases: PROTECT_BASES,
                textRange: TEXT_RANGE,
                audioExt: AUDIO_EXT,
              },
              paths: {
                species: path.relative(ROOT, SPECIES_JSON).replace(/\\/g, '/'),
                audioDir: path.relative(ROOT, AUDIO_DIR).replace(/\\/g, '/'),
                recogMap: path.relative(ROOT, RECOG_MAP_JSON).replace(/\\/g, '/'),
              },
            })
          }

          /* --------------------------- 校验（预演） -------------------------- */
          if (route === '/__admin/validate' && req.method === 'POST') {
            const body = await readJsonBody<{ species?: unknown }>(req)
            return send(res, 200, { issues: validate(body.species) })
          }

          /* ---------------------------- 保存写回 ---------------------------- */
          if (route === '/__admin/save' && req.method === 'POST') {
            const body = await readJsonBody<{ species?: unknown }>(req)
            const next = body.species

            const issues = validate(next)
            const errors = issues.filter((i) => i.level === 'error')
            if (errors.length > 0) {
              return send(res, 400, {
                ok: false,
                message: `有 ${errors.length} 处校验未通过，已拒绝写入（原文件未改动）`,
                issues,
              })
            }

            // 1) 备份
            const backupName = `species.sample.json.bak.${stamp()}`
            const backupPath = path.join(path.dirname(SPECIES_JSON), backupName)
            fs.copyFileSync(SPECIES_JSON, backupPath)

            // 2) 按契约固定字段顺序整理（未知字段原样保留在末尾，不丢）
            const ordered = (next as Json[]).map(canonicalize)

            // 3) 整体写回：UTF-8 无 BOM / LF / 2 空格缩进 / 中文不转义 / 尾换行
            const text = JSON.stringify(ordered, null, 2).replace(/\r\n/g, '\n') + '\n'
            fs.writeFileSync(SPECIES_JSON, text, 'utf8')

            return send(res, 200, {
              ok: true,
              message: `已保存 ${ordered.length} 条，备份：${backupName}`,
              backup: backupName,
              species: ordered,
              issues,
              backups: listBackups(),
            })
          }

          /* -------------------------- 上传修正音频 -------------------------- */
          // 客户端用原始二进制 body 上传，文件名与类型放在请求头里（dev 同源，无需 multipart 依赖）
          if (route === '/__admin/upload' && req.method === 'POST') {
            const id = String(req.headers['x-species-id'] ?? '').trim()
            const rawName = decodeURIComponent(String(req.headers['x-file-name'] ?? 'upload'))
            const normalize = String(req.headers['x-normalize'] ?? '') === '1'
            if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(id)) {
              return send(res, 400, { ok: false, message: '缺少或非法的 x-species-id' })
            }

            const buf = await readBody(req)
            if (buf.length < 512) {
              return send(res, 400, { ok: false, message: '文件为空或过小' })
            }

            fs.mkdirSync(AUDIO_DIR, { recursive: true })
            // 用户随便选什么文件名都行，这里统一改名成 <speciesId>.mp3
            const srcExt = (path.extname(rawName) || '.bin').toLowerCase()
            const tmp = path.join(AUDIO_DIR, `.tmp-up-${id}-${Date.now()}${srcExt}`)
            fs.writeFileSync(tmp, buf)

            const target = path.join(AUDIO_DIR, `${id}.mp3`)
            let finalUrl = `/audio/${id}.mp3`
            let note = ''

            const ff = await hasFfmpeg()
            if (ff) {
              const r = await transcode(tmp, target, normalize)
              try { fs.unlinkSync(tmp) } catch { /* ignore */ }
              if (!r.ok) return send(res, 500, { ok: false, message: `转码失败：${r.error}` })
              note = normalize ? '已转码为 mp3 并做响度规范化' : '已转码为 mp3'
            } else if (srcExt === '.mp3') {
              const r = await writeAudioRobust(tmp, target, buf)
              finalUrl = `/audio/${path.basename(r.file)}`
              note = r.fallback
                ? '目标文件被系统进程独占锁定（多半是杀毒软件 / 云同步 / 资源管理器预览窗格），已改存为唯一文件名兜底；请稍后解锁原文件再清理旧副本'
                : '未检测到 ffmpeg，源文件本身是 mp3，已直接改名存入'
            } else {
              // 没有 ffmpeg 又不是 mp3：保留真实扩展名，不谎报成 .mp3
              const keep = path.join(AUDIO_DIR, `${id}${srcExt}`)
              const r = await writeAudioRobust(tmp, keep, buf)
              finalUrl = `/audio/${path.basename(r.file)}`
              note = r.fallback
                ? '目标被系统独占锁定，已按原格式存为唯一文件名兜底'
                : `未检测到 ffmpeg，无法转码；已按原格式存为 ${path.basename(r.file)}。装上 ffmpeg 后可重新上传统一成 mp3`
            }

            const size = fs.statSync(path.join(ROOT, 'public', finalUrl.replace(/^\//, ''))).size
            return send(res, 200, {
              ok: true, audioUrl: finalUrl, note, size,
              message: `已写入 public${finalUrl}（${(size / 1024).toFixed(0)} KB）。${note}`,
            })
          }

          /* ------------------------ 批量 ffmpeg 规范化 ----------------------- */
          if (route === '/__admin/normalize' && req.method === 'POST') {
            const body = await readJsonBody<{ ids?: string[] }>(req)
            const ids = Array.isArray(body.ids) ? body.ids : []
            if (ids.length === 0) return send(res, 400, { ok: false, message: '没有选中任何物种' })
            if (!(await hasFfmpeg())) {
              return send(res, 503, {
                ok: false,
                message: '未检测到 ffmpeg。请先安装（Windows: winget install Gyan.FFmpeg，macOS: brew install ffmpeg）并确保在 PATH 中。',
              })
            }

            const all = readSpecies()
            const results: { id: string; ok: boolean; message: string; audioUrl?: string }[] = []

            for (const id of ids) {
              const sp = all.find((s) => String(s.id) === id)
              if (!sp) { results.push({ id, ok: false, message: '物种不存在' }); continue }
              let temp = ''
              try {
                const src = await resolveSource(sp)
                temp = src.temp ? src.file : ''
                if (/^https?:\/\//i.test(String(sp.audioUrl))) rememberOrigin(id, String(sp.audioUrl))

                const target = path.join(AUDIO_DIR, `${id}.mp3`)
                // 原地处理：源和目标同路径时先转到临时文件再替换（transcode 内部已用 .tmp.mp3）
                const r = await transcode(src.file, target, true)
                if (!r.ok) { results.push({ id, ok: false, message: r.error ?? '转码失败' }); continue }

                const size = fs.statSync(target).size
                results.push({
                  id, ok: true, audioUrl: `/audio/${id}.mp3`,
                  message: `规范化完成（${(size / 1024).toFixed(0)} KB）`,
                })
              } catch (err) {
                results.push({ id, ok: false, message: err instanceof Error ? err.message : String(err) })
              } finally {
                if (temp) { try { fs.unlinkSync(temp) } catch { /* ignore */ } }
              }
            }

            const okCount = results.filter((r) => r.ok).length
            return send(res, 200, {
              ok: okCount > 0, results,
              message: `规范化完成：成功 ${okCount} / ${results.length}。注意：audioUrl 还没写回 JSON，请在预览确认后点「保存」。`,
            })
          }

          /* --------------------------- 按源重抓 --------------------------- */
          if (route === '/__admin/refetch' && req.method === 'POST') {
            const body = await readJsonBody<{ ids?: string[]; toLocal?: boolean }>(req)
            const ids = Array.isArray(body.ids) ? body.ids : []
            if (ids.length === 0) return send(res, 400, { ok: false, message: '没有选中任何物种' })

            const all = readSpecies()
            const origins = readOrigins()
            const ff = await hasFfmpeg()
            const results: { id: string; ok: boolean; message: string; audioUrl?: string }[] = []

            for (const id of ids) {
              const sp = all.find((s) => String(s.id) === id)
              if (!sp) { results.push({ id, ok: false, message: '物种不存在' }); continue }

              const current = String(sp.audioUrl ?? '')
              const origin = /^https?:\/\//i.test(current) ? current : origins[id]
              if (!origin) {
                results.push({
                  id, ok: false,
                  message: '没有可用的原始外链（该条已本地化且工具没存过它的来源）。请在详情面板手工填回外链后再重抓。',
                })
                continue
              }

              let temp = ''
              try {
                temp = await download(origin)
                rememberOrigin(id, origin)
                const target = path.join(AUDIO_DIR, `${id}.mp3`)
                if (ff) {
                  const r = await transcode(temp, target, false)
                  if (!r.ok) { results.push({ id, ok: false, message: r.error ?? '转码失败' }); continue }
                } else if (path.extname(temp).toLowerCase() === '.mp3') {
                  fs.copyFileSync(temp, target)
                } else {
                  results.push({ id, ok: false, message: '未装 ffmpeg 且源文件不是 mp3，无法本地化' })
                  continue
                }
                const size = fs.statSync(target).size
                results.push({
                  id, ok: true, audioUrl: `/audio/${id}.mp3`,
                  message: `已从源重抓（${(size / 1024).toFixed(0)} KB）`,
                })
              } catch (err) {
                results.push({ id, ok: false, message: err instanceof Error ? err.message : String(err) })
              } finally {
                if (temp) { try { fs.unlinkSync(temp) } catch { /* ignore */ } }
              }
            }

            const okCount = results.filter((r) => r.ok).length
            return send(res, 200, {
              ok: okCount > 0, results,
              message: `重抓完成：成功 ${okCount} / ${results.length}。确认后记得点「保存」把 audioUrl 写回 JSON。`,
            })
          }

          /* ------------------------ id 联动改名（§4.1） ----------------------- */
          // id 被 4 处引用，必须一起改，否则会产生悬空映射 / 图片 404。
          // preview=true 时只算差异不落盘，UI 先给用户看清楚再确认。
          if (route === '/__admin/rename' && req.method === 'POST') {
            const body = await readJsonBody<{ from?: string; to?: string; preview?: boolean }>(req)
            const from = String(body.from ?? '').trim()
            const to = String(body.to ?? '').trim()
            const preview = body.preview !== false

            if (!from || !to) return send(res, 400, { ok: false, message: '缺少 from / to' })
            if (from === to) return send(res, 400, { ok: false, message: '新旧 id 相同' })
            if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(to)) {
              return send(res, 400, { ok: false, message: '新 id 必须是 kebab-case' })
            }

            const all = readSpecies()
            const target = all.find((s) => String(s.id) === from)
            if (!target) return send(res, 404, { ok: false, message: `物种 ${from} 不存在` })
            if (all.some((s) => String(s.id) === to)) {
              return send(res, 400, { ok: false, message: `新 id ${to} 已被占用` })
            }

            const plan: string[] = []
            plan.push(`species.sample.json: id "${from}" → "${to}"`)
            plan.push(`species.sample.json: image → ${derivedImage(to)}`)

            // 插画物理改名
            const oldWebp = path.join(ASSETS_DIR, `npc-${from}.webp`)
            const newWebp = path.join(ASSETS_DIR, `npc-${to}.webp`)
            const hasWebp = fs.existsSync(oldWebp)
            if (hasWebp) plan.push(`public/assets/npc-${from}.webp → npc-${to}.webp`)
            else plan.push(`（跳过）public/assets/npc-${from}.webp 不存在`)

            // 本地音频物理改名 + audioUrl 同步
            const curAudio = String(target.audioUrl ?? '')
            let newAudioUrl = curAudio
            let oldAudioPath = ''
            let newAudioPath = ''
            if (curAudio.startsWith('/audio/')) {
              const ext = path.extname(curAudio) || '.mp3'
              oldAudioPath = path.join(ROOT, 'public', curAudio.replace(/^\//, ''))
              newAudioPath = path.join(AUDIO_DIR, `${to}${ext}`)
              newAudioUrl = `/audio/${to}${ext}`
              plan.push(`public${curAudio} → public${newAudioUrl}`)
              plan.push(`species.sample.json: audioUrl → ${newAudioUrl}`)
            }

            // 识别映射表联动（一个物种通常有 1–3 个别名键）
            const recogMap = readRecogMap()
            const mapKeys = Object.entries(recogMap)
              .filter(([, v]) => v === from)
              .map(([k]) => k)
            if (mapKeys.length > 0) {
              plan.push(`recognition-map.json: ${mapKeys.length} 个键改指向（${mapKeys.join('、')}）`)
            } else {
              plan.push('（注意）recognition-map.json 里没有键指向该物种，识别链路够不到它')
            }

            // ILLUSTRATED_IDS 只告警不自动改（那是前端代码，属郝栈桥手改范围）
            const warnings: string[] = []
            try {
              const dataTs = fs.readFileSync(path.join(ROOT, 'src', 'data', 'species.ts'), 'utf8')
              if (new RegExp(`['"]${from}['"]`).test(dataTs)) {
                warnings.push(`src/data/species.ts 的 ILLUSTRATED_IDS 里含 "${from}"，本工具不自动改前端代码，请手工同步`)
              }
            } catch { /* 读不到就算了 */ }

            if (preview) {
              return send(res, 200, { ok: true, preview: true, plan, warnings })
            }

            // —— 正式执行：两份 JSON 都先备份 ——
            const st = stamp()
            const spBak = `species.sample.json.bak.${st}`
            fs.copyFileSync(SPECIES_JSON, path.join(path.dirname(SPECIES_JSON), spBak))
            let mapBak = ''
            if (mapKeys.length > 0 && fs.existsSync(RECOG_MAP_JSON)) {
              mapBak = `recognition-map.json.bak.${st}`
              fs.copyFileSync(RECOG_MAP_JSON, path.join(path.dirname(RECOG_MAP_JSON), mapBak))
            }

            // 物理文件改名（先做文件，失败就中止，JSON 还没动）
            if (hasWebp) fs.renameSync(oldWebp, newWebp)
            if (oldAudioPath && fs.existsSync(oldAudioPath)) fs.renameSync(oldAudioPath, newAudioPath)

            // 写 species.sample.json
            target.id = to
            target.image = derivedImage(to)
            if (newAudioUrl !== curAudio) target.audioUrl = newAudioUrl
            fs.writeFileSync(
              SPECIES_JSON,
              JSON.stringify(all.map(canonicalize), null, 2) + '\n',
              'utf8',
            )

            // 写 recognition-map.json（保持原键顺序，只换 value）
            if (mapKeys.length > 0) {
              const nextMap: Record<string, string> = {}
              for (const [k, v] of Object.entries(recogMap)) nextMap[k] = v === from ? to : v
              fs.writeFileSync(RECOG_MAP_JSON, JSON.stringify(nextMap, null, 2) + '\n', 'utf8')
            }

            // 音频来源存档跟着搬
            const origins = readOrigins()
            if (origins[from]) { origins[to] = origins[from]; delete origins[from]; writeOrigins(origins) }

            return send(res, 200, {
              ok: true,
              preview: false,
              plan,
              warnings,
              backups: [spBak, mapBak].filter(Boolean),
              species: readSpecies(),
              message: `已把 ${from} 改名为 ${to}，联动 ${plan.length} 处；备份：${spBak}${mapBak ? ' / ' + mapBak : ''}`,
            })
          }

          /* ------------------------- 下载原音频（代理） ------------------------ */
          if (route === '/__admin/download' && req.method === 'GET') {
            const id = String(query.get('id') ?? '')
            const sp = readSpecies().find((s) => String(s.id) === id)
            if (!sp) return send(res, 404, { ok: false, message: '物种不存在' })
            const url = String(sp.audioUrl ?? '')
            if (!url) return send(res, 404, { ok: false, message: '该条没有音频' })

            let buf: Buffer
            let ext = '.mp3'
            if (url.startsWith('/')) {
              const p = path.join(ROOT, 'public', url.replace(/^\//, ''))
              if (!fs.existsSync(p)) return send(res, 404, { ok: false, message: '本地音频文件不存在' })
              buf = fs.readFileSync(p)
              ext = path.extname(p) || '.mp3'
            } else {
              // 远端音频由 Node 代理下载，浏览器端 <a download> 对跨域链接无效
              let r: Response
              try {
                r = await fetchWithTimeout(url, 30000, {
                  'User-Agent': 'TingLai-SoundVerse-AdminTool/1.0 (contest project)',
                })
              } catch (err) {
                if ((err as { name?: string })?.name === 'AbortError') {
                  return send(res, 504, { ok: false, message: '下载超时（30s）：源站响应太慢或不可达' })
                }
                return send(res, 502, { ok: false, message: `下载失败：${err instanceof Error ? err.message : String(err)}` })
              }
              if (!r.ok) return send(res, 502, { ok: false, message: `源站返回 ${r.status}` })
              buf = Buffer.from(await r.arrayBuffer())
              ext = path.extname(new URL(url).pathname) || '.mp3'
            }

            res.statusCode = 200
            res.setHeader('Content-Type', 'application/octet-stream')
            res.setHeader('Content-Disposition', `attachment; filename="${id}${ext}"`)
            res.setHeader('Content-Length', String(buf.length))
            res.end(buf)
            return
          }

          return send(res, 404, { ok: false, message: `未知的管理接口 ${route}` })
        } catch (err) {
          // 任何异常都返回可读 JSON，别让 dev server 500 裸奔
          return send(res, 500, {
            ok: false,
            message: err instanceof Error ? err.message : String(err),
          })
        }
      })

      server.config.logger.info(
        '\n  \x1b[35m➜\x1b[0m  \x1b[1m管理员工具\x1b[0m: http://localhost:'
        + (server.config.server.port ?? 5173) + '/#/dev  \x1b[2m(仅开发环境)\x1b[0m',
      )
    },
  }
}

export default adminToolPlugin
