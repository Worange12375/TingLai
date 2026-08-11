#!/usr/bin/env node
/**
 * 音频本地化脚本（听籁 SoundVerse）
 * ---------------------------------------------------------------
 * 目的：比赛演示不依赖在线音频库（iNaturalist / xeno-canto）的网络可达性。
 * 把 species.sample.json 里每条 audioUrl 指向的远程音频下载到
 * public/audio/<speciesId>.<ext>，并把 audioUrl 改写为本地相对路径。
 *
 * 硬性约定（与 vite-plugin-admin.ts 的校验器保持一致，勿改）：
 *   - 本地路径形如 /audio/<id>.<ext>，校验器只认 startsWith('/audio/')
 *   - 扩展名白名单 AUDIO_EXT = .mp3 / .m4a / .wav / .ogg
 *     （源站出现的 .mpga 实为 MPEG 音频，统一落地为 .mp3）
 *   - audioSource / audioLicense 逐条署名原样保留，绝不改写
 *   - 下载或校验失败的条目保持原远程 URL 不动，绝不指向不存在的本地文件
 *
 * 用法：
 *   node scripts/localize-audio.mjs           # 下载 + 写回 JSON
 *   node scripts/localize-audio.mjs --dry-run # 只下载校验，不写回 JSON
 *   node scripts/localize-audio.mjs --force   # 已存在的本地文件也重新下载
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const SPECIES_JSON = path.join(ROOT, 'src', 'data', 'species.sample.json')
const AUDIO_DIR = path.join(ROOT, 'public', 'audio')
const ORIGINS_JSON = path.join(ROOT, '.audio-origins.json')

const DRY_RUN = process.argv.includes('--dry-run')
const FORCE = process.argv.includes('--force')

// 与 vite-plugin-admin.ts 的 AUDIO_EXT 白名单严格一致
const ALLOWED_EXT = ['mp3', 'm4a', 'wav', 'ogg']
// 源站扩展名 → 落地扩展名的归一化映射
const EXT_ALIAS = { mpga: 'mp3', mpeg: 'mp3', mp4: 'm4a', oga: 'ogg' }

const CONCURRENCY = 4
const TIMEOUT_MS = 60_000
const RETRIES = 3
const MIN_BYTES = 1024 // 小于 1KB 基本不可能是有效音频，判失败

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) ' +
  'Chrome/124.0 Safari/537.36 SoundVerse-AudioLocalizer/1.0 (academic project; contact via repo)'

/* ------------------------------------------------------------------ *
 * magic bytes 嗅探：以文件真实内容判定容器格式，不轻信 URL 后缀
 * ------------------------------------------------------------------ */
function sniffFormat(buf) {
  if (!buf || buf.length < 12) return null
  const head4 = buf.subarray(0, 4).toString('latin1')

  if (head4 === 'OggS') return 'ogg'
  if (head4 === 'RIFF' && buf.subarray(8, 12).toString('latin1') === 'WAVE') return 'wav'
  if (buf.subarray(4, 8).toString('latin1') === 'ftyp') return 'm4a'
  if (head4.startsWith('ID3')) return 'mp3'
  // MPEG frame sync: 11 个 1 位（0xFF Ex/Fx）
  if (buf[0] === 0xff && (buf[1] & 0xe0) === 0xe0) return 'mp3'

  // 少数 mp3 前面挂了垃圾字节，在前 4KB 内再找一次 ID3 / frame sync
  const scan = buf.subarray(0, Math.min(buf.length, 4096))
  const id3 = scan.indexOf('ID3', 0, 'latin1')
  if (id3 >= 0 && id3 < 512) return 'mp3'
  for (let i = 0; i < scan.length - 1; i++) {
    if (scan[i] === 0xff && (scan[i + 1] & 0xe0) === 0xe0) return 'mp3'
  }
  return null
}

function extFromUrl(url) {
  const m = url.split('?')[0].match(/\.([a-z0-9]+)$/i)
  if (!m) return null
  const raw = m[1].toLowerCase()
  return EXT_ALIAS[raw] ?? raw
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function fetchBuffer(url) {
  let lastErr
  for (let attempt = 1; attempt <= RETRIES; attempt++) {
    const ac = new AbortController()
    const timer = setTimeout(() => ac.abort(), TIMEOUT_MS)
    try {
      const res = await fetch(url, {
        redirect: 'follow',
        signal: ac.signal,
        headers: { 'User-Agent': UA, Accept: 'audio/*,*/*;q=0.9' },
      })
      if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`)
      const buf = Buffer.from(await res.arrayBuffer())
      return { buf, contentType: res.headers.get('content-type') ?? '' }
    } catch (err) {
      lastErr = err
      if (attempt < RETRIES) await sleep(600 * attempt)
    } finally {
      clearTimeout(timer)
    }
  }
  throw lastErr
}

/** 下载并校验单条；返回 { id, ok, ext, size, localUrl, reason } */
async function localizeOne(sp) {
  const id = String(sp.id ?? '').trim()
  const url = String(sp.audioUrl ?? '').trim()

  if (!id) return { id: '(missing id)', ok: false, reason: '缺少 id 字段' }
  if (!url) return { id, ok: false, reason: '缺少 audioUrl' }
  if (url.startsWith('/audio/')) return { id, ok: true, skipped: true, localUrl: url, reason: '已是本地路径' }
  if (!/^https?:\/\//i.test(url)) return { id, ok: false, reason: `audioUrl 不是 http(s) 外链：${url}` }

  // 已落地过且非 --force：跳过重下
  if (!FORCE) {
    const hit = ALLOWED_EXT.map((e) => path.join(AUDIO_DIR, `${id}.${e}`)).find(
      (p) => fs.existsSync(p) && fs.statSync(p).size > MIN_BYTES,
    )
    if (hit) {
      const ext = path.extname(hit).slice(1)
      return {
        id,
        ok: true,
        cached: true,
        ext,
        size: fs.statSync(hit).size,
        localUrl: `/audio/${id}.${ext}`,
        origin: url,
      }
    }
  }

  let buf, contentType
  try {
    ;({ buf, contentType } = await fetchBuffer(url))
  } catch (err) {
    return { id, ok: false, url, reason: `下载失败：${err?.message ?? err}` }
  }

  // —— 校验 1：文件大小 ——
  if (buf.length === 0) return { id, ok: false, url, reason: '下载内容为空（0 字节）' }
  if (buf.length < MIN_BYTES) {
    return { id, ok: false, url, reason: `文件过小（${buf.length} 字节），疑似错误页而非音频` }
  }

  // —— 校验 2：magic bytes ——
  const sniffed = sniffFormat(buf)
  if (!sniffed) {
    const peek = buf.subarray(0, 16).toString('latin1').replace(/[^\x20-\x7e]/g, '.')
    return {
      id,
      ok: false,
      url,
      reason: `magic bytes 不是已知音频格式（content-type=${contentType || 'n/a'}，头部="${peek}"）`,
    }
  }

  // 落地扩展名：以嗅探结果为准；URL 后缀仅在嗅探同族时做参考
  let ext = sniffed
  const urlExt = extFromUrl(url)
  if (urlExt && urlExt !== sniffed && ALLOWED_EXT.includes(urlExt)) {
    // 嗅探优先，但记录差异，便于排查源站标注错误
    console.log(`   · ${id}: URL 后缀 .${urlExt} 与实际容器 ${sniffed} 不符，按实际容器落地`)
  }
  if (!ALLOWED_EXT.includes(ext)) {
    return { id, ok: false, url, reason: `容器 ${ext} 不在白名单 ${ALLOWED_EXT.join('/')} 内` }
  }

  const dest = path.join(AUDIO_DIR, `${id}.${ext}`)
  fs.mkdirSync(AUDIO_DIR, { recursive: true })
  fs.writeFileSync(dest, buf)

  // —— 校验 3：回读落盘文件，确认写入完整 ——
  const stat = fs.statSync(dest)
  if (stat.size !== buf.length) {
    return { id, ok: false, url, reason: `落盘校验不一致（期望 ${buf.length}，实际 ${stat.size}）` }
  }
  const reread = sniffFormat(fs.readFileSync(dest).subarray(0, 4096))
  if (reread !== ext) {
    return { id, ok: false, url, reason: `回读 magic bytes 校验失败（${reread ?? 'unknown'} != ${ext}）` }
  }

  return { id, ok: true, ext, size: stat.size, localUrl: `/audio/${id}.${ext}`, origin: url }
}

/** 简易并发池 */
async function runPool(items, limit, worker) {
  const out = new Array(items.length)
  let cursor = 0
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (cursor < items.length) {
        const i = cursor++
        out[i] = await worker(items[i], i)
      }
    }),
  )
  return out
}

/* ------------------------------------------------------------------ */
async function main() {
  const raw = fs.readFileSync(SPECIES_JSON, 'utf8')
  const list = JSON.parse(raw)
  if (!Array.isArray(list)) throw new Error('species.sample.json 顶层不是数组')

  console.log(`物种总数：${list.length}${DRY_RUN ? '（--dry-run，不写回 JSON）' : ''}`)
  console.log(`落地目录：${path.relative(ROOT, AUDIO_DIR)}\n`)

  const results = await runPool(list, CONCURRENCY, async (sp) => {
    const r = await localizeOne(sp)
    const tag = r.ok ? (r.cached ? 'CACHED' : r.skipped ? 'SKIP  ' : 'OK    ') : 'FAIL  '
    const detail = r.ok
      ? `${r.localUrl ?? ''}${r.size ? `  (${(r.size / 1024).toFixed(0)} KB)` : ''}`
      : r.reason
    console.log(`[${tag}] ${String(r.id).padEnd(26)} ${detail}`)
    return r
  })

  const ok = results.filter((r) => r.ok && !r.skipped)
  const failed = results.filter((r) => !r.ok)

  // —— 写回 JSON：只改成功条目的 audioUrl，其余字段一律不动 ——
  if (!DRY_RUN && ok.length > 0) {
    const byId = new Map(ok.map((r) => [r.id, r]))
    let changed = 0
    for (const sp of list) {
      const r = byId.get(String(sp.id ?? ''))
      if (!r || !r.localUrl) continue
      if (sp.audioUrl !== r.localUrl) {
        sp.audioUrl = r.localUrl // audioSource / audioLicense 原样保留
        changed++
      }
    }
    fs.writeFileSync(SPECIES_JSON, JSON.stringify(list, null, 2) + '\n', 'utf8')
    console.log(`\naudioUrl 已改写 ${changed} 条 → /audio/<id>.<ext>`)

    // 原始外链存档到 .audio-origins.json（gitignore，供管理端「按源重抓」）
    let origins = {}
    try {
      origins = JSON.parse(fs.readFileSync(ORIGINS_JSON, 'utf8'))
    } catch {
      /* 文件不存在则新建 */
    }
    for (const r of ok) if (r.origin) origins[r.id] = r.origin
    fs.writeFileSync(ORIGINS_JSON, JSON.stringify(origins, null, 2) + '\n', 'utf8')
    console.log(`原始外链已存档 ${Object.keys(origins).length} 条 → .audio-origins.json`)
  }

  console.log(`\n===== 汇总 =====`)
  console.log(`成功 ${ok.length} / 失败 ${failed.length} / 总计 ${results.length}`)
  if (failed.length) {
    console.log('\n失败清单（audioUrl 保持原远程链接不变）：')
    for (const f of failed) console.log(`  - ${f.id}\n      ${f.url ?? ''}\n      原因：${f.reason}`)
  }
  process.exitCode = 0
}

main().catch((err) => {
  console.error('脚本异常终止：', err)
  process.exitCode = 1
})
