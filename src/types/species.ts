// 物种科普卡 · 全站唯一数据契约（字段名已锁定，勿改）
// 由 src/data/species.sample.json 提供数据（该文件归林知声独占维护，本项目其它代码只读）

export type SpeciesGroup = '鸟类' | '蛙类' | '昆虫' | '其他'

export interface Species {
  /** 唯一标识，用于路由 /learn/:id */
  id: string
  /** 中文名 */
  name: string
  /** 中文名拼音，空格分隔音节（如「戴胜」→ dài shèng）；生僻字注音用，可能为空 */
  pinyin?: string
  /** 拉丁学名 */
  scientific: string
  /** 类群：鸟类 / 蛙类 / 昆虫 */
  group: SpeciesGroup
  /** 叫声特征 */
  callFeature: string
  /** 习性 */
  habit: string
  /** 分布 */
  distribution: string
  /** 保护级别 */
  protectLevel: string
  /** 趣味知识 */
  funFact: string
  /** 叫声音频地址（可能为空或失效，播放需兜底） */
  audioUrl: string
  /** 插画地址 /assets/npc-<id>.webp（优先 WebP；可能尚未生成，渲染需 onError 兜底） */
  image: string
  /** 音频来源署名（平台+录音编号+录制者+日期+地点），逐条署名用 */
  audioSource: string
  /** 实际授权码：CC0 / CC BY / CC BY-NC / CC BY-NC-SA 4.0 */
  audioLicense: string
  /** 科普配图来源（Wikimedia Commons 文件+作者+授权+链接），由林知声补给，非 NPC 物种才有 */
  photoSource?: string
  /** 配图授权（归一类名：CC0 / Public Domain、CC BY、CC BY-SA 等） */
  photoLicense?: string
}

/**
 * 原始 JSON 条目：兼容两套字段命名。
 * - 契约版（camelCase）：name / scientific / callFeature / audioUrl / image ...
 * - 早期版（snake_case）：name_zh / name_en / call_desc / audio_ref / image_ref ...
 * 归一化在 src/data/species.ts 完成，页面层只消费 Species。
 */
export interface RawSpecies {
  id?: string
  // 契约版
  name?: string
  /** 中文名拼音，空格分隔音节 */
  pinyin?: string
  scientific?: string
  group?: string
  callFeature?: string
  habit?: string
  distribution?: string
  protectLevel?: string
  funFact?: string
  audioUrl?: string
  image?: string
  audioSource?: string
  audioLicense?: string
  // 早期版
  name_zh?: string
  name_en?: string
  taxonomy?: string
  call_desc?: string
  habitat?: string
  protection_level?: string
  fun_fact?: string
  audio_ref?: string
  image_ref?: string
  [key: string]: unknown
}

/** 识别结果条目：Top-N 物种 + 置信度 */
export interface RecognitionItem {
  species: Species
  /** 0~1 */
  confidence: number
  /** 结果来源，便于 UI 标注"离线兜底" */
  source: 'birdnet' | 'thinksound' | 'local-fallback'
}
