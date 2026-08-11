// 物种名 + 中文拼音注音
// 中文名多含生僻字（鹀/鸫/鹟/鹛/鳾/鹨/鹮/鸮/鹡鸰/螽…），名字旁标注拼音降低阅读门槛。
// 拼音对读屏软件是无意义的字母串（中文名本身已可朗读），故 aria-hidden，仅作视觉注音。
import type { Species } from '../types/species'

/** 拼音字号档位：xs 用于卡片/名牌，sm 用于详情大标题 */
type PinyinSize = 'xs' | 'sm'

const SIZE_CLASS: Record<PinyinSize, string> = {
  xs: 'text-xs',
  sm: 'text-sm',
}

export function SpeciesName({
  species,
  className,
  size = 'xs',
  stacked = false,
}: {
  species: Species
  /** 外层 className，沿用调用处原有的标题样式 */
  className?: string
  /** 拼音字号，默认 xs；详情页大标题用 sm */
  size?: PinyinSize
  /** true = 拼音另起一行（横向空间紧张处：小卡片、悬停名牌）；false = 紧跟名字之后 */
  stacked?: boolean
}) {
  const pinyin = species.pinyin?.trim()
  const pinyinCls = `font-normal tracking-wide text-ink-faint ${SIZE_CLASS[size]}`

  if (stacked) {
    return (
      <span className={className}>
        <span className="block truncate">{species.name}</span>
        {pinyin && (
          <span className={`block truncate leading-snug ${pinyinCls}`} aria-hidden="true">
            {pinyin}
          </span>
        )}
      </span>
    )
  }

  return (
    <span className={className}>
      <span>{species.name}</span>
      {pinyin && (
        <span className={`ml-1.5 ${pinyinCls}`} aria-hidden="true">
          {pinyin}
        </span>
      )}
    </span>
  )
}
