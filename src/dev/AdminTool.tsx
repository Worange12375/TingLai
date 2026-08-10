/**
 * 听籁 SoundVerse · 本地物种数据管理员工具
 * ============================================================================
 * ⚠️ 仅开发环境可用：本组件由 src/App.tsx 用 import.meta.env.DEV 门禁，
 *    生产构建会被 Rollup 整棵摇掉，公开站点不存在 /dev 路由。
 *
 * 能力对应 src/data/ADMIN_SCHEMA.md（林知声维护的数据契约）：
 *   · 左列表：全部物种，支持搜索/类群筛选/只看有问题/多选
 *   · 右详情：试听原音频 + 下载 + 上传修正音频（自动改名 <id>.mp3）+ 字段编辑
 *   · 批量：ffmpeg 规范化 / 批量改字段 / 按源重抓
 *   · 数据安全：保存前 diff 预览 → 服务端校验 → 自动备份 → 整体写回
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  downloadUrl, fetchState, normalizeBatch, refetchBatch, renameSpecies,
  saveSpecies, uploadAudio, validateRemote,
  type AdminState, type BatchResult, type SpeciesRow, type ValidationIssue,
} from './adminApi'
import { Badge, Button, Card, Modal } from '../components/ui'

/* ========================================================================== */
/*                                   小工具                                    */
/* ========================================================================== */

// 下面几个纯函数导出仅为可测试性（_devtest.mjs 会做真实数据回归），组件外无人使用
export function str(row: SpeciesRow | undefined, field: string): string {
  const v = row?.[field]
  return typeof v === 'string' ? v : v == null ? '' : String(v)
}

export function derivedImage(id: string): string {
  return `/assets/npc-${id}.webp`
}

/** protectLevel = 基础级别 + 可选中文全角括号补充说明，拆成两个输入框防手抖 */
export function splitProtect(value: string, bases: string[]): { base: string; extra: string } {
  const hit = bases.find((b) => value.startsWith(b))
  if (!hit) return { base: '', extra: '' }
  const rest = value.slice(hit.length).trim()
  const m = rest.match(/^（(.*)）$/)
  return { base: hit, extra: m ? m[1] : '' }
}

export function joinProtect(base: string, extra: string): string {
  const e = extra.trim()
  return e ? `${base}（${e}）` : base
}

interface FieldChange { field: string; from: string; to: string }
interface RowDiff { id: string; name: string; kind: 'modified' | 'added' | 'removed'; changes: FieldChange[] }

/** 逐条比对草稿与服务端原文，只列出真正变化的字段 */
export function diffRows(orig: SpeciesRow[], next: SpeciesRow[]): RowDiff[] {
  const out: RowDiff[] = []
  const origById = new Map(orig.map((r) => [str(r, 'id'), r]))
  const nextIds = new Set(next.map((r) => str(r, 'id')))

  for (const row of next) {
    const id = str(row, 'id')
    const before = origById.get(id)
    if (!before) {
      out.push({ id, name: str(row, 'name'), kind: 'added', changes: [] })
      continue
    }
    const keys = new Set([...Object.keys(before), ...Object.keys(row)])
    const changes: FieldChange[] = []
    for (const k of keys) {
      const a = str(before, k)
      const b = str(row, k)
      if (a !== b) changes.push({ field: k, from: a, to: b })
    }
    if (changes.length > 0) out.push({ id, name: str(row, 'name'), kind: 'modified', changes })
  }
  for (const row of orig) {
    const id = str(row, 'id')
    if (!nextIds.has(id)) out.push({ id, name: str(row, 'name'), kind: 'removed', changes: [] })
  }
  return out
}

/* ========================================================================== */
/*                                 输入控件                                    */
/* ========================================================================== */

const inputCls =
  'w-full rounded-xl border border-wood/40 bg-paper-light/70 px-3 py-2 text-sm text-ink ' +
  'focus:outline-none focus:ring-2 focus:ring-feather/60 focus:border-transparent'

function Field({
  label, hint, issues, children,
}: {
  label: string
  hint?: string
  issues?: ValidationIssue[]
  children: React.ReactNode
}) {
  const errs = issues?.filter((i) => i.level === 'error') ?? []
  const warns = issues?.filter((i) => i.level === 'warn') ?? []
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2 mb-1.5">
        <label className="text-[13px] font-semibold text-ink">{label}</label>
        {hint && <span className="text-[11px] text-ink-soft">{hint}</span>}
      </div>
      {children}
      {errs.map((e, i) => (
        <p key={`e${i}`} className="text-[11px] text-red-600 mt-1 leading-snug">✕ {e.message}</p>
      ))}
      {warns.map((w, i) => (
        <p key={`w${i}`} className="text-[11px] text-amber-700 mt-1 leading-snug">! {w.message}</p>
      ))}
    </div>
  )
}

/* ========================================================================== */
/*                                   主组件                                    */
/* ========================================================================== */

export default function AdminTool() {
  const [state, setState] = useState<AdminState | null>(null)
  const [draft, setDraft] = useState<SpeciesRow[]>([])
  const [issues, setIssues] = useState<ValidationIssue[]>([])
  const [loadError, setLoadError] = useState('')
  const [busy, setBusy] = useState('')
  const [toast, setToast] = useState<{ tone: 'ok' | 'err' | 'info'; text: string } | null>(null)

  const [currentId, setCurrentId] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [keyword, setKeyword] = useState('')
  const [groupFilter, setGroupFilter] = useState('全部')
  const [onlyIssues, setOnlyIssues] = useState(false)

  const [showDiff, setShowDiff] = useState(false)
  const [batchLog, setBatchLog] = useState<BatchResult[]>([])
  const [batchField, setBatchField] = useState('group')
  const [batchValue, setBatchValue] = useState('')

  const [renameOpen, setRenameOpen] = useState(false)
  const [renameTo, setRenameTo] = useState('')
  const [renamePlan, setRenamePlan] = useState<{ plan: string[]; warnings: string[] } | null>(null)

  const [normalizeOnUpload, setNormalizeOnUpload] = useState(true)
  const fileRef = useRef<HTMLInputElement>(null)

  const flash = useCallback((tone: 'ok' | 'err' | 'info', text: string) => {
    setToast({ tone, text })
    window.setTimeout(() => setToast(null), 5200)
  }, [])

  /* ------------------------------ 载入 ------------------------------ */

  const load = useCallback(async () => {
    setBusy('读取物种库…')
    try {
      const s = await fetchState()
      setState(s)
      setDraft(s.species.map((r) => ({ ...r })))
      setIssues(s.issues)
      setLoadError('')
      setCurrentId((cur) => cur || str(s.species[0], 'id'))
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy('')
    }
  }, [])

  useEffect(() => { void load() }, [load])

  /* --------------------- 草稿变化后自动体检（防抖） --------------------- */

  useEffect(() => {
    if (draft.length === 0) return
    const t = window.setTimeout(() => {
      validateRemote(draft)
        .then((r) => setIssues(r.issues))
        .catch(() => { /* 体检失败不打断编辑 */ })
    }, 500)
    return () => window.clearTimeout(t)
  }, [draft])

  /* ------------------------------ 派生数据 ------------------------------ */

  const schema = state?.schema
  const current = useMemo(() => draft.find((r) => str(r, 'id') === currentId), [draft, currentId])
  const currentIndex = useMemo(() => draft.findIndex((r) => str(r, 'id') === currentId), [draft, currentId])

  /** index → 该条的所有问题 */
  const issuesByIndex = useMemo(() => {
    const m = new Map<number, ValidationIssue[]>()
    for (const i of issues) {
      const arr = m.get(i.index) ?? []
      arr.push(i)
      m.set(i.index, arr)
    }
    return m
  }, [issues])

  const currentIssues = issuesByIndex.get(currentIndex) ?? []
  const issuesOf = useCallback(
    (field: string) => currentIssues.filter((i) => i.field === field),
    [currentIssues],
  )

  const errorCount = issues.filter((i) => i.level === 'error').length
  const warnCount = issues.filter((i) => i.level === 'warn').length

  const diffs = useMemo(
    () => (state ? diffRows(state.species, draft) : []),
    [state, draft],
  )
  const dirty = diffs.length > 0

  /** 有未保存改动时，误关标签页/刷新前弹系统确认 */
  useEffect(() => {
    if (!dirty) return
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [dirty])

  const visible = useMemo(() => {
    const kw = keyword.trim().toLowerCase()
    return draft
      .map((row, index) => ({ row, index }))
      .filter(({ row, index }) => {
        if (groupFilter !== '全部' && str(row, 'group') !== groupFilter) return false
        if (onlyIssues && !(issuesByIndex.get(index) ?? []).some((i) => i.level === 'error')) return false
        if (!kw) return true
        return [str(row, 'id'), str(row, 'name'), str(row, 'scientific')]
          .join(' ').toLowerCase().includes(kw)
      })
  }, [draft, keyword, groupFilter, onlyIssues, issuesByIndex])

  /* ------------------------------ 编辑动作 ------------------------------ */

  const patch = useCallback((id: string, field: string, value: string) => {
    setDraft((prev) => prev.map((r) => (str(r, 'id') === id ? { ...r, [field]: value } : r)))
  }, [])

  const toggleSelect = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  /* ------------------------------ 保存 ------------------------------ */

  async function doSave() {
    setBusy('校验并写入…')
    try {
      const r = await saveSpecies(draft)
      setState((s) => (s ? { ...s, species: r.species, backups: r.backups } : s))
      setDraft(r.species.map((x) => ({ ...x })))
      setIssues(r.issues)
      setShowDiff(false)
      flash('ok', r.message)
    } catch (err) {
      const e = err as Error & { issues?: ValidationIssue[] }
      if (e.issues) setIssues(e.issues)
      flash('err', e.message)
    } finally {
      setBusy('')
    }
  }

  /* ---------------------------- 音频相关动作 ---------------------------- */

  async function doUpload(file: File) {
    if (!current) return
    const id = str(current, 'id')
    setBusy(`上传并处理 ${file.name}…`)
    try {
      const r = await uploadAudio(id, file, normalizeOnUpload)
      patch(id, 'audioUrl', r.audioUrl)
      // ⚠️ 这里绝不能调 load()：那会用服务端数据覆盖 draft，把用户其它未保存的编辑冲掉。
      //    只把新落地的文件补进 localAudio 列表即可。
      const fileName = r.audioUrl.replace(/^\/audio\//, '')
      setState((s) =>
        s && !s.localAudio.includes(fileName)
          ? { ...s, localAudio: [...s.localAudio, fileName] }
          : s,
      )
      flash('ok', `${r.message}　audioUrl 已同步到草稿，记得点「保存」写回 JSON。`)
    } catch (err) {
      flash('err', err instanceof Error ? err.message : String(err))
    } finally {
      setBusy('')
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  async function doBatch(kind: 'normalize' | 'refetch') {
    const ids = [...selected]
    if (ids.length === 0) return
    setBusy(kind === 'normalize' ? `ffmpeg 规范化 ${ids.length} 条…` : `重抓 ${ids.length} 条…`)
    try {
      const r = kind === 'normalize' ? await normalizeBatch(ids) : await refetchBatch(ids)
      setBatchLog(r.results)
      // 成功的把 audioUrl 落到草稿，由用户确认后统一保存
      setDraft((prev) =>
        prev.map((row) => {
          const hit = r.results.find((x) => x.ok && x.audioUrl && x.id === str(row, 'id'))
          return hit ? { ...row, audioUrl: hit.audioUrl as string } : row
        }),
      )
      flash(r.ok ? 'ok' : 'err', r.message)
    } catch (err) {
      flash('err', err instanceof Error ? err.message : String(err))
    } finally {
      setBusy('')
    }
  }

  /** 批量改字段：署名两字段按契约 §3.3 禁止参与批量 */
  function doBatchField() {
    const ids = [...selected]
    if (ids.length === 0 || !batchValue.trim()) return
    if (batchField === 'audioSource' || batchField === 'audioLicense') {
      flash('err', '契约 §3.3：逐条署名字段禁止批量覆盖，请在详情面板逐条编辑。')
      return
    }
    setDraft((prev) =>
      prev.map((row) => (ids.includes(str(row, 'id')) ? { ...row, [batchField]: batchValue } : row)),
    )
    flash('info', `已把 ${ids.length} 条的 ${batchField} 改为「${batchValue}」，确认 diff 后再保存。`)
  }

  /* ------------------------------ 改名 ------------------------------ */

  async function previewRename() {
    if (!current) return
    try {
      const r = await renameSpecies(str(current, 'id'), renameTo.trim(), true)
      setRenamePlan({ plan: r.plan, warnings: r.warnings })
    } catch (err) {
      flash('err', err instanceof Error ? err.message : String(err))
    }
  }

  async function applyRename() {
    if (!current) return
    const from = str(current, 'id')
    const to = renameTo.trim()
    setBusy('联动改名…')
    try {
      const r = await renameSpecies(from, to, false)
      flash('ok', r.message ?? '改名完成')
      if (r.warnings?.length) flash('info', r.warnings.join('；'))
      setRenameOpen(false)
      setRenamePlan(null)
      setRenameTo('')
      setCurrentId(to)
      await load()
    } catch (err) {
      flash('err', err instanceof Error ? err.message : String(err))
    } finally {
      setBusy('')
    }
  }

  /* ========================================================================= */
  /*                                   渲染                                     */
  /* ========================================================================= */

  if (loadError) {
    return (
      <div className="max-w-3xl mx-auto py-16 px-4">
        <Card className="p-8">
          <h1 className="text-xl font-bold text-ink mb-3">管理员工具连不上后端</h1>
          <p className="text-sm text-ink-soft leading-relaxed mb-4">{loadError}</p>
          <p className="text-sm text-ink-soft leading-relaxed">
            这个工具依赖 Vite 开发服务器插件（<code className="px-1 bg-wood-light/50 rounded">vite-plugin-admin.ts</code>）。
            请确认是用 <code className="px-1 bg-wood-light/50 rounded">npm run dev</code> 启动的，
            而不是打开了构建产物。
          </p>
          <div className="mt-5"><Button onClick={() => void load()}>重试</Button></div>
        </Card>
      </div>
    )
  }

  if (!state || !schema) {
    return <div className="py-24 text-center text-ink-soft">正在读取物种库…</div>
  }

  const protect = splitProtect(str(current, 'protectLevel'), schema.protectBases)
  const curId = str(current, 'id')
  const audioUrl = str(current, 'audioUrl')
  const imageOk = state.localAssets.includes(`npc-${curId}.webp`)

  return (
    <div className="w-full max-w-[1400px] mx-auto px-4 py-6">
      {/* ------------------------------- 顶栏 ------------------------------- */}
      <Card className="p-4 mb-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex-1 min-w-[240px]">
            <h1 className="text-lg font-bold text-ink flex items-center gap-2">
              🛠 物种数据管理员工具
              <Badge tone="wood">仅本地开发环境</Badge>
            </h1>
            <p className="text-xs text-ink-soft mt-1">
              {state.paths.species} · 共 {draft.length} 条 ·
              {' '}映射表 {Object.keys(state.recognitionMap).length} 个键
            </p>
          </div>

          <Badge tone={errorCount > 0 ? 'sunset' : 'moss'}>
            {errorCount > 0 ? `✕ ${errorCount} 项错误` : '✓ 校验通过'}
          </Badge>
          {warnCount > 0 && <Badge tone="blossom">! {warnCount} 项提醒</Badge>}
          <Badge
            tone={state.ffmpeg ? 'moss' : 'wood'}
            title={state.ffmpeg ? 'ffmpeg 可用，支持转码与响度规范化' : '未检测到 ffmpeg，批量规范化不可用'}
          >
            ffmpeg {state.ffmpeg ? '就绪' : '缺失'}
          </Badge>

          <Button
            variant="soft" size="sm" disabled={!!busy}
            onClick={() => {
              if (dirty && !window.confirm(`有 ${diffs.length} 条未保存改动，重新载入会全部丢弃。确定继续？`)) return
              void load()
            }}
          >重新载入</Button>
          <Button
            size="sm"
            onClick={() => setShowDiff(true)}
            disabled={!dirty || !!busy}
          >
            {dirty ? `保存（${diffs.length} 条改动）` : '无改动'}
          </Button>
        </div>

        {busy && <p className="text-xs text-feather-dark mt-2.5">⏳ {busy}</p>}
        {toast && (
          <p
            className={
              'text-xs mt-2.5 leading-relaxed ' +
              (toast.tone === 'ok' ? 'text-leaf' : toast.tone === 'err' ? 'text-red-600' : 'text-ink-soft')
            }
          >
            {toast.tone === 'ok' ? '✓' : toast.tone === 'err' ? '✕' : 'ℹ'} {toast.text}
          </p>
        )}
      </Card>

      <div className="flex flex-col lg:flex-row gap-4 items-start">
        {/* ----------------------------- 左：列表 ----------------------------- */}
        <Card className="w-full lg:w-[340px] shrink-0 p-3">
          <div className="space-y-2 mb-3">
            <input
              className={inputCls}
              placeholder="搜索名称 / 学名 / id"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
            />
            <div className="flex gap-2">
              <select
                className={inputCls}
                value={groupFilter}
                onChange={(e) => setGroupFilter(e.target.value)}
              >
                <option>全部</option>
                {schema.groups.map((g) => <option key={g}>{g}</option>)}
              </select>
              <label className="flex items-center gap-1.5 text-xs text-ink-soft whitespace-nowrap">
                <input
                  type="checkbox"
                  checked={onlyIssues}
                  onChange={(e) => setOnlyIssues(e.target.checked)}
                />
                只看有错
              </label>
            </div>
            <div className="flex items-center justify-between text-xs text-ink-soft">
              <span>已选 {selected.size} / {visible.length} 条</span>
              <div className="flex gap-2">
                <button
                  className="underline hover:text-ink"
                  onClick={() => setSelected(new Set(visible.map(({ row }) => str(row, 'id'))))}
                >全选</button>
                <button className="underline hover:text-ink" onClick={() => setSelected(new Set())}>
                  清空
                </button>
              </div>
            </div>
          </div>

          <div className="max-h-[62vh] overflow-y-auto pr-1 space-y-1">
            {visible.map(({ row, index }) => {
              const id = str(row, 'id')
              const rowIssues = issuesByIndex.get(index) ?? []
              const hasError = rowIssues.some((i) => i.level === 'error')
              const active = id === currentId
              return (
                <div
                  key={id || index}
                  className={
                    'flex items-center gap-2 rounded-xl px-2 py-1.5 cursor-pointer transition ' +
                    (active ? 'bg-sunset/25' : 'hover:bg-wood-light/40')
                  }
                  onClick={() => setCurrentId(id)}
                >
                  <input
                    type="checkbox"
                    checked={selected.has(id)}
                    onClick={(e) => e.stopPropagation()}
                    onChange={() => toggleSelect(id)}
                  />
                  <img
                    src={str(row, 'image')}
                    alt=""
                    className="w-9 h-9 rounded-lg object-cover bg-wood-light/50 shrink-0"
                    onError={(e) => { (e.currentTarget as HTMLImageElement).style.visibility = 'hidden' }}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-ink truncate">
                      {str(row, 'name') || '(未命名)'}
                      {hasError && <span className="text-red-600 ml-1">●</span>}
                    </p>
                    <p className="text-[11px] text-ink-soft truncate">{id}</p>
                  </div>
                  <Badge tone="wood" className="shrink-0">{str(row, 'group')}</Badge>
                </div>
              )
            })}
            {visible.length === 0 && (
              <p className="text-center text-sm text-ink-soft py-10">没有匹配的物种</p>
            )}
          </div>

          {/* 批量操作区 */}
          {selected.size > 0 && (
            <div className="mt-3 pt-3 border-t border-wood/30 space-y-2">
              <p className="text-xs font-semibold text-ink">批量操作（{selected.size} 条）</p>
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm" variant="soft"
                  disabled={!state.ffmpeg || !!busy}
                  onClick={() => void doBatch('normalize')}
                  title={state.ffmpeg ? '响度归一 + 高通 + 首尾静音裁剪' : '需要先安装 ffmpeg'}
                >规范化音频</Button>
                <Button size="sm" variant="soft" disabled={!!busy} onClick={() => void doBatch('refetch')}>
                  按源重抓
                </Button>
              </div>
              <div className="flex gap-1.5">
                <select
                  className={inputCls + ' flex-1'}
                  value={batchField}
                  onChange={(e) => { setBatchField(e.target.value); setBatchValue('') }}
                >
                  <option value="group">group</option>
                  <option value="protectLevel">protectLevel</option>
                  <option value="distribution">distribution</option>
                </select>
                {batchField === 'group' ? (
                  <select className={inputCls + ' flex-1'} value={batchValue}
                    onChange={(e) => setBatchValue(e.target.value)}>
                    <option value="">选择值</option>
                    {schema.groups.map((g) => <option key={g}>{g}</option>)}
                  </select>
                ) : batchField === 'protectLevel' ? (
                  <select className={inputCls + ' flex-1'} value={batchValue}
                    onChange={(e) => setBatchValue(e.target.value)}>
                    <option value="">选择值</option>
                    {schema.protectBases.map((g) => <option key={g}>{g}</option>)}
                  </select>
                ) : (
                  <input className={inputCls + ' flex-1'} value={batchValue}
                    onChange={(e) => setBatchValue(e.target.value)} placeholder="新值" />
                )}
                <Button size="sm" onClick={doBatchField} disabled={!batchValue}>应用</Button>
              </div>
              <p className="text-[11px] text-ink-soft leading-snug">
                契约 §3.3：audioSource / audioLicense 是逐条版权署名，不参与任何批量操作。
              </p>
            </div>
          )}
        </Card>

        {/* ----------------------------- 右：详情 ----------------------------- */}
        <div className="flex-1 min-w-0 w-full space-y-4">
          {!current ? (
            <Card className="p-10 text-center text-ink-soft">从左侧选一个物种开始编辑</Card>
          ) : (
            <>
              {/* 音频区 */}
              <Card className="p-4">
                <div className="flex flex-wrap items-center gap-2 mb-3">
                  <h2 className="text-base font-bold text-ink flex-1 min-w-[160px]">
                    {str(current, 'name')}
                    <span className="text-xs font-normal text-ink-soft ml-2">{curId}</span>
                  </h2>
                  <Badge tone={imageOk ? 'moss' : 'wood'}>
                    插画{imageOk ? '已就位' : '缺失'}
                  </Badge>
                  <Badge tone={audioUrl.startsWith('/audio/') ? 'feather' : 'blossom'}>
                    {audioUrl.startsWith('/audio/') ? '本地音频' : '远端外链'}
                  </Badge>
                </div>

                <div className="grid md:grid-cols-2 gap-4">
                  {/* 左：试听 + 下载 */}
                  <div>
                    <p className="text-[13px] font-semibold text-ink mb-1.5">当前音频</p>
                    {/* ⚠️ 不要给 audio 加 crossOrigin，会让所有外链音频静默失败 */}
                    <audio key={audioUrl} src={audioUrl} controls preload="none" className="w-full" />
                    <p className="text-[11px] text-ink-soft mt-1.5 break-all">{audioUrl || '（无）'}</p>
                    <div className="mt-2">
                      <a href={downloadUrl(curId)} download>
                        <Button size="sm" variant="soft" disabled={!audioUrl}>下载原音频</Button>
                      </a>
                    </div>
                  </div>

                  {/* 右：上传修正音频 */}
                  <div>
                    <p className="text-[13px] font-semibold text-ink mb-1.5">上传修正音频</p>
                    <input
                      ref={fileRef}
                      type="file"
                      accept="audio/*,.mp3,.wav,.m4a,.ogg,.flac"
                      className="block w-full text-xs text-ink-soft file:mr-3 file:rounded-full file:border-0
                                 file:bg-wood-light/70 file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-ink"
                      onChange={(e) => {
                        const f = e.target.files?.[0]
                        if (f) void doUpload(f)
                      }}
                    />
                    <label className="flex items-center gap-1.5 text-xs text-ink-soft mt-2">
                      <input
                        type="checkbox"
                        checked={normalizeOnUpload}
                        onChange={(e) => setNormalizeOnUpload(e.target.checked)}
                      />
                      同时做响度规范化（loudnorm + 高通 + 裁静音）
                    </label>
                    <p className="text-[11px] text-ink-soft mt-1.5 leading-snug">
                      文件名随便取，工具会自动改名为 <code className="px-1 bg-wood-light/50 rounded">{curId}.mp3</code>
                      {' '}存入 public/audio/ 并同步 audioUrl。
                    </p>
                  </div>
                </div>
              </Card>

              {/* 字段编辑区 */}
              <Card className="p-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-bold text-ink">科普卡字段</h3>
                  <Button
                    size="sm" variant="ghost"
                    onClick={() => {
                      // 改名由服务端直接落盘并重载，会冲掉未保存的草稿，所以先要求清空改动
                      if (dirty) {
                        flash('err', `有 ${diffs.length} 条未保存改动。改名会直接写盘并重载，请先保存或「重新载入」放弃改动。`)
                        return
                      }
                      setRenameTo(curId); setRenamePlan(null); setRenameOpen(true)
                    }}
                  >修改 id（联动改名）</Button>
                </div>

                <div className="grid md:grid-cols-2 gap-x-4 gap-y-3">
                  <Field label="中文名 name" hint="2–8 字，全表唯一" issues={issuesOf('name')}>
                    <input className={inputCls} value={str(current, 'name')}
                      onChange={(e) => patch(curId, 'name', e.target.value)} />
                  </Field>

                  <Field label="学名 scientific" hint="双名法，改动需同步映射表" issues={issuesOf('scientific')}>
                    <input className={inputCls} value={str(current, 'scientific')}
                      onChange={(e) => patch(curId, 'scientific', e.target.value)} />
                  </Field>

                  <Field label="类群 group" hint="三选一" issues={issuesOf('group')}>
                    <select className={inputCls} value={str(current, 'group')}
                      onChange={(e) => patch(curId, 'group', e.target.value)}>
                      <option value="">（未选）</option>
                      {schema.groups.map((g) => <option key={g}>{g}</option>)}
                      {/* 已有脏数据要能显示出来，否则会被静默改掉 */}
                      {!schema.groups.includes(str(current, 'group')) && str(current, 'group') && (
                        <option>{str(current, 'group')}</option>
                      )}
                    </select>
                  </Field>

                  <Field label="保护级别 protectLevel" hint="基础级别 + 可选补充" issues={issuesOf('protectLevel')}>
                    <div className="flex gap-1.5">
                      <select
                        className={inputCls + ' flex-[3]'}
                        value={protect.base}
                        onChange={(e) => patch(curId, 'protectLevel', joinProtect(e.target.value, protect.extra))}
                      >
                        <option value="">（未选）</option>
                        {schema.protectBases.map((b) => <option key={b}>{b}</option>)}
                      </select>
                      <input
                        className={inputCls + ' flex-[2]'}
                        placeholder="补充说明（可空）"
                        value={protect.extra}
                        disabled={!protect.base}
                        onChange={(e) => patch(curId, 'protectLevel', joinProtect(protect.base, e.target.value))}
                      />
                    </div>
                  </Field>

                  <Field label="叫声特征 callFeature" hint="20–120 字" issues={issuesOf('callFeature')}>
                    <textarea className={inputCls} rows={3} value={str(current, 'callFeature')}
                      onChange={(e) => patch(curId, 'callFeature', e.target.value)} />
                  </Field>

                  <Field label="习性 habit" hint="20–120 字" issues={issuesOf('habit')}>
                    <textarea className={inputCls} rows={3} value={str(current, 'habit')}
                      onChange={(e) => patch(curId, 'habit', e.target.value)} />
                  </Field>

                  <Field label="分布 distribution" hint="10–80 字" issues={issuesOf('distribution')}>
                    <textarea className={inputCls} rows={2} value={str(current, 'distribution')}
                      onChange={(e) => patch(curId, 'distribution', e.target.value)} />
                  </Field>

                  <Field label="趣味知识 funFact" hint="20–140 字" issues={issuesOf('funFact')}>
                    <textarea className={inputCls} rows={2} value={str(current, 'funFact')}
                      onChange={(e) => patch(curId, 'funFact', e.target.value)} />
                  </Field>

                  <Field label="音频地址 audioUrl" hint="https 外链或 /audio/<id>.mp3" issues={issuesOf('audioUrl')}>
                    <input className={inputCls} value={audioUrl}
                      onChange={(e) => patch(curId, 'audioUrl', e.target.value)} />
                  </Field>

                  <Field label="插画 image" hint="由 id 派生，不建议手改" issues={issuesOf('image')}>
                    <div className="flex gap-1.5">
                      <input className={inputCls} value={str(current, 'image')}
                        onChange={(e) => patch(curId, 'image', e.target.value)} />
                      <Button size="sm" variant="soft"
                        onClick={() => patch(curId, 'image', derivedImage(curId))}>按 id 生成</Button>
                    </div>
                  </Field>

                  {/* 署名两字段：契约要求默认可见、不得折叠 */}
                  <div className="md:col-span-2 rounded-xl bg-blossom/15 p-3 space-y-3">
                    <p className="text-[12px] font-bold text-ink">
                      版权署名（逐条独立，合规红线 · 禁止批量覆盖）
                    </p>
                    <Field label="音频来源 audioSource" hint="平台 + 编号 + 录制者 + 日期 + 地点"
                      issues={issuesOf('audioSource')}>
                      <input className={inputCls} value={str(current, 'audioSource')}
                        onChange={(e) => patch(curId, 'audioSource', e.target.value)} />
                    </Field>
                    <Field label="授权协议 audioLicense" hint="四选一" issues={issuesOf('audioLicense')}>
                      <select className={inputCls} value={str(current, 'audioLicense')}
                        onChange={(e) => patch(curId, 'audioLicense', e.target.value)}>
                        <option value="">（未选）</option>
                        {schema.licenses.map((l) => <option key={l}>{l}</option>)}
                        {!schema.licenses.includes(str(current, 'audioLicense')) && str(current, 'audioLicense') && (
                          <option>{str(current, 'audioLicense')}</option>
                        )}
                      </select>
                    </Field>
                  </div>
                </div>

                {/* 未知字段提示：绝不静默丢弃 */}
                {Object.keys(current).filter((k) => !schema.fieldOrder.includes(k)).length > 0 && (
                  <p className="text-[11px] text-ink-soft mt-3">
                    该条含契约外字段：
                    {Object.keys(current).filter((k) => !schema.fieldOrder.includes(k)).join('、')}
                    　（工具会原样保留，不会丢）
                  </p>
                )}
              </Card>

              {/* 批量执行日志 */}
              {batchLog.length > 0 && (
                <Card className="p-4">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-sm font-bold text-ink">批量执行结果</h3>
                    <button className="text-xs underline text-ink-soft" onClick={() => setBatchLog([])}>
                      清空
                    </button>
                  </div>
                  <div className="space-y-1 max-h-52 overflow-y-auto">
                    {batchLog.map((r) => (
                      <p key={r.id} className={'text-xs ' + (r.ok ? 'text-leaf' : 'text-red-600')}>
                        {r.ok ? '✓' : '✕'} {r.id} — {r.message}
                      </p>
                    ))}
                  </div>
                </Card>
              )}
            </>
          )}
        </div>
      </div>

      {/* ---------------------------- diff 预览弹窗 ---------------------------- */}
      <Modal open={showDiff} onClose={() => setShowDiff(false)}>
        <Card className="p-5">
          <h3 className="text-base font-bold text-ink mb-1">保存前确认（{diffs.length} 条改动）</h3>
          <p className="text-xs text-ink-soft mb-3 leading-relaxed">
            写入前会自动备份当前文件为 species.sample.json.bak.&lt;时间戳&gt;；
            服务端会再校验一次，有错误级问题会直接拒写。
          </p>

          {errorCount > 0 && (
            <p className="text-xs text-red-600 mb-3">
              当前有 {errorCount} 项错误级问题，保存会被服务端拒绝。请先修掉。
            </p>
          )}

          <div className="max-h-[46vh] overflow-y-auto space-y-3 pr-1">
            {diffs.map((d) => (
              <div key={d.id} className="rounded-xl bg-wood-light/30 p-3">
                <p className="text-sm font-semibold text-ink mb-1.5">
                  {d.name || d.id}
                  <span className="text-[11px] font-normal text-ink-soft ml-2">{d.id}</span>
                  {d.kind !== 'modified' && <Badge tone="sunset" className="ml-2">{d.kind}</Badge>}
                </p>
                {d.changes.map((c) => (
                  <div key={c.field} className="text-[11px] leading-relaxed mb-1">
                    <span className="font-semibold text-ink">{c.field}</span>
                    <div className="text-red-600 break-all">- {c.from || '(空)'}</div>
                    <div className="text-leaf break-all">+ {c.to || '(空)'}</div>
                  </div>
                ))}
              </div>
            ))}
          </div>

          <div className="flex justify-end gap-2 mt-4">
            <Button variant="ghost" size="sm" onClick={() => setShowDiff(false)}>取消</Button>
            <Button size="sm" onClick={() => void doSave()} disabled={!!busy || errorCount > 0}>
              确认写入
            </Button>
          </div>
        </Card>
      </Modal>

      {/* ----------------------------- 改名弹窗 ----------------------------- */}
      <Modal open={renameOpen} onClose={() => setRenameOpen(false)}>
        <Card className="p-5">
          <h3 className="text-base font-bold text-ink mb-1">修改 id · 联动改名</h3>
          <p className="text-xs text-ink-soft mb-3 leading-relaxed">
            id 是主键，被 species.sample.json、插画文件名、本地音频文件名、recognition-map.json 四处引用，
            必须一起改，否则会产生悬空映射和图片 404。
          </p>
          <div className="flex gap-2 items-center mb-3">
            <code className="text-xs px-2 py-1.5 rounded-lg bg-wood-light/50">{curId}</code>
            <span className="text-ink-soft">→</span>
            <input className={inputCls + ' flex-1'} value={renameTo}
              onChange={(e) => { setRenameTo(e.target.value); setRenamePlan(null) }}
              placeholder="新的 kebab-case id" />
          </div>

          {renamePlan && (
            <div className="rounded-xl bg-wood-light/30 p-3 mb-3">
              <p className="text-xs font-semibold text-ink mb-1.5">将执行以下操作：</p>
              {renamePlan.plan.map((p, i) => (
                <p key={i} className="text-[11px] text-ink-soft leading-relaxed">· {p}</p>
              ))}
              {renamePlan.warnings.map((w, i) => (
                <p key={`w${i}`} className="text-[11px] text-amber-700 leading-relaxed mt-1">! {w}</p>
              ))}
            </div>
          )}

          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => setRenameOpen(false)}>取消</Button>
            {!renamePlan ? (
              <Button size="sm" onClick={() => void previewRename()}
                disabled={!renameTo.trim() || renameTo.trim() === curId}>预览改动</Button>
            ) : (
              <Button size="sm" onClick={() => void applyRename()} disabled={!!busy}>确认执行</Button>
            )}
          </div>
        </Card>
      </Modal>
    </div>
  )
}
