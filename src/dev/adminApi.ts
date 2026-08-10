/**
 * 管理员工具 · 前端 API 封装
 * ============================================================================
 * 对应 vite-plugin-admin.ts 提供的 /__admin/* 接口（仅开发服务器存在）。
 * 这一层只做「请求 + 错误归一」，不含业务逻辑，页面组件只管调。
 */

/** 物种原始记录：契约 13 字段 + 可能存在的未知字段（未知字段必须原样保留） */
export type SpeciesRow = Record<string, unknown>

export interface ValidationIssue {
  index: number
  id: string
  field: string
  level: 'error' | 'warn'
  message: string
}

export interface BackupInfo {
  name: string
  size: number
  mtime: number
}

export interface SchemaMeta {
  fieldOrder: string[]
  required: string[]
  groups: string[]
  licenses: string[]
  protectBases: string[]
  textRange: Record<string, [number, number]>
  audioExt: string[]
}

export interface AdminState {
  species: SpeciesRow[]
  issues: ValidationIssue[]
  backups: BackupInfo[]
  origins: Record<string, string>
  localAudio: string[]
  localAssets: string[]
  recognitionMap: Record<string, string>
  ffmpeg: boolean
  schema: SchemaMeta
  paths: { species: string; audioDir: string; recogMap: string }
}

export interface BatchResult {
  id: string
  ok: boolean
  message: string
  audioUrl?: string
}

/** 把任何失败都转成带中文说明的 Error，页面统一 catch 后展示 */
async function parse<T>(res: Response): Promise<T> {
  const text = await res.text()
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch {
    throw new Error(
      res.ok
        ? '服务端返回的不是 JSON，可能没走到管理插件（确认是 npm run dev 启动的？）'
        : `HTTP ${res.status}：${text.slice(0, 200)}`,
    )
  }
  if (!res.ok) {
    const msg = (data as { message?: string })?.message
    const err = new Error(msg || `HTTP ${res.status}`)
    // 把 issues 挂上去，保存失败时页面要展示逐条错误
    ;(err as Error & { issues?: ValidationIssue[] }).issues =
      (data as { issues?: ValidationIssue[] })?.issues
    throw err
  }
  return data as T
}

export function fetchState(): Promise<AdminState> {
  return fetch('/__admin/state').then((r) => parse<AdminState>(r))
}

export function validateRemote(species: SpeciesRow[]): Promise<{ issues: ValidationIssue[] }> {
  return fetch('/__admin/validate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ species }),
  }).then((r) => parse<{ issues: ValidationIssue[] }>(r))
}

export function saveSpecies(species: SpeciesRow[]): Promise<{
  ok: boolean
  message: string
  backup: string
  species: SpeciesRow[]
  issues: ValidationIssue[]
  backups: BackupInfo[]
}> {
  return fetch('/__admin/save', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ species }),
  }).then((r) => parse(r))
}

/** 上传修正音频：文件名随便取，服务端自动改名为 <speciesId>.mp3 */
export function uploadAudio(
  id: string,
  file: File,
  normalize: boolean,
): Promise<{ ok: boolean; audioUrl: string; message: string; size: number }> {
  return fetch('/__admin/upload', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/octet-stream',
      'x-species-id': id,
      'x-file-name': encodeURIComponent(file.name),
      'x-normalize': normalize ? '1' : '0',
    },
    body: file,
  }).then((r) => parse(r))
}

export function normalizeBatch(ids: string[]): Promise<{
  ok: boolean
  message: string
  results: BatchResult[]
}> {
  return fetch('/__admin/normalize', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ids }),
  }).then((r) => parse(r))
}

export function refetchBatch(ids: string[]): Promise<{
  ok: boolean
  message: string
  results: BatchResult[]
}> {
  return fetch('/__admin/refetch', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ids }),
  }).then((r) => parse(r))
}

export function renameSpecies(
  from: string,
  to: string,
  preview: boolean,
): Promise<{
  ok: boolean
  preview: boolean
  plan: string[]
  warnings: string[]
  message?: string
  species?: SpeciesRow[]
  backups?: string[]
}> {
  return fetch('/__admin/rename', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ from, to, preview }),
  }).then((r) => parse(r))
}

/** 下载原音频：远端链接由 Node 代理，避免浏览器 <a download> 对跨域失效 */
export function downloadUrl(id: string): string {
  return `/__admin/download?id=${encodeURIComponent(id)}`
}
