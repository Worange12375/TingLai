// 物种数据访问层（归一化适配器）
// ⚠️ species.sample.json 由林知声独占维护，此处只读、不写。
// 为防止字段命名版本差异导致白屏，这里同时兼容 camelCase 契约版与早期 snake_case 版。
import rawJson from './species.sample.json'
import type { RawSpecies, Species, SpeciesGroup } from '../types/species'

const GROUPS: SpeciesGroup[] = ['鸟类', '蛙类', '昆虫', '其他']

/** 从 taxonomy / group 文本推断类群 */
function inferGroup(raw: RawSpecies): SpeciesGroup {
  const hay = [raw.group, raw.taxonomy, raw.name_zh, raw.name].filter(Boolean).join(' ')
  if (raw.group && (GROUPS as string[]).includes(raw.group)) return raw.group as SpeciesGroup
  if (/鸟|雀形目|鸡形目|鸮|鹃|鹭|鸦|鹀|鹛|䴕|鹡鸰|鹰/.test(hay)) return '鸟类'
  if (/蛙|蟾|无尾目|树蛙|林蛙/.test(hay)) return '蛙类'
  if (/虫|蝉|蟋蟀|螽斯|直翅目|半翅目|鞘翅目|蝗|蟪蛄|纺织娘/.test(hay)) return '昆虫'
  return '其他'
}

function pick(...vals: Array<unknown>): string {
  for (const v of vals) {
    if (typeof v === 'string' && v.trim()) return v.trim()
  }
  return ''
}

/** 单条归一化：任一版本字段 → 统一 Species */
export function normalizeSpecies(raw: RawSpecies, index: number): Species {
  const id = pick(raw.id, `species-${index + 1}`)
  return {
    id,
    name: pick(raw.name, raw.name_zh, '未命名物种'),
    scientific: pick(raw.scientific, raw.name_en, '—'),
    group: inferGroup(raw),
    callFeature: pick(raw.callFeature, raw.call_desc, '叫声资料整理中'),
    habit: pick(raw.habit, raw.habitat, '习性资料整理中'),
    distribution: pick(raw.distribution, '分布资料整理中'),
    protectLevel: pick(raw.protectLevel, raw.protection_level, '暂无级别信息'),
    funFact: pick(raw.funFact, raw.fun_fact, ''),
    audioUrl: pick(raw.audioUrl, raw.audio_ref),
    image: pick(raw.image, raw.image_ref, `/assets/npc-${id}.webp`),
    // 逐条署名：透传，缺省为空串（Species 要求 string，渲染层已做空值兜底）
    audioSource: pick(raw.audioSource),
    audioLicense: pick(raw.audioLicense),
  }
}

/** 全站物种库（已归一化、已去重） */
export const speciesList: Species[] = (Array.isArray(rawJson) ? (rawJson as RawSpecies[]) : [])
  .map(normalizeSpecies)
  .filter((s, i, arr) => arr.findIndex((x) => x.id === s.id) === i)

export function getSpeciesById(id: string | undefined): Species | undefined {
  if (!id) return undefined
  return speciesList.find((s) => s.id === id)
}

/** 实际存在于数据中的类群（用于筛选栏，避免出现空分组） */
export const availableGroups: SpeciesGroup[] = GROUPS.filter((g) =>
  speciesList.some((s) => s.group === g),
)

/** 关键词 + 类群筛选 */
export function filterSpecies(keyword: string, group: SpeciesGroup | '全部'): Species[] {
  const kw = keyword.trim().toLowerCase()
  return speciesList.filter((s) => {
    const okGroup = group === '全部' || s.group === group
    if (!okGroup) return false
    if (!kw) return true
    return [s.name, s.scientific, s.callFeature, s.habit, s.distribution, s.funFact]
      .join(' ')
      .toLowerCase()
      .includes(kw)
  })
}

/**
 * 已配手绘插画（public/assets/npc-<id>.webp）的物种 id，按展示优先级排列。
 * —— 美术补图后只需在这里追加 id，自然大厅与首页会自动同步，无需改页面代码。——
 */
export const ILLUSTRATED_IDS: string[] = [
  'hoopoe',                // 戴胜 · 折扇羽冠，最上镜
  'oriole',                // 黑枕黄鹂 · 「两个黄鹂鸣翠柳」古诗梗
  'eurasian-tree-sparrow', // 麻雀 · 国民度最高
  'common-frog',           // 黑斑侧褶蛙 · 夏夜蛙声代表
  'weaver-katydid',        // 纺织娘 · 平衡昆虫类群
]

/** 已配插画的物种实体；数据中查不到的 id 自动跳过，不会留空位 */
export const illustratedSpecies: Species[] = ILLUSTRATED_IDS.map((id) =>
  speciesList.find((s) => s.id === id),
).filter((s): s is Species => !!s)

/** 稳定伪随机取样（用于大厅 NPC / Quiz 出题，避免每次渲染跳动） */
export function pickSpecies(count: number, offset = 0): Species[] {
  if (speciesList.length === 0) return []
  const out: Species[] = []
  for (let i = 0; i < Math.min(count, speciesList.length); i++) {
    out.push(speciesList[(i + offset) % speciesList.length])
  }
  return out
}
