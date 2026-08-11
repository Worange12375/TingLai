// 物种剪影占位（inline SVG，零图片依赖、零网络请求）
// —— 用途：没有 bespoke 手绘插画（public/assets/npc-<id>.webp）的物种，
//    统一用「按类群区分的剪影」占位，而不是留白或去请求一张不存在的图。——
//
// 设计约束（与全站绘本风保持一致）：
//   · 圆润：主体由椭圆/圆弧构成，无尖角，strokeLinejoin=round
//   · 低饱和：色板取自 tailwind.config.js 的纸感自然色，再压一档饱和度
//   · 描边简洁：只有一层 ink 低透明度描边，不堆细节
//
// ⚠️ 这是「诚实占位」，不冒充真实插画：调用方会给出 aria-label 说明为占位。
import type { SpeciesGroup } from '../types/species'

/* --------------------------- 类群色板（低饱和） --------------------------- */

interface Tone {
  /** 底色水洗，铺满整块，保证不同物种占位观感统一 */
  wash: string
  /** 剪影主体 */
  body: string
  /** 次级结构（翅膀 / 体节），比主体浅一档 */
  accent: string
}

/** 与 GroupBadge 的色相对应：鸟=羽蓝、蛙=苔绿、虫=花黄、其他=暖木 */
const TONES: Record<SpeciesGroup, Tone> = {
  鸟类: { wash: '#E3EDF3', body: '#8FB3C9', accent: '#BCD4E2' },
  蛙类: { wash: '#E7EDE4', body: '#8FA886', accent: '#B7C8B0' },
  昆虫: { wash: '#F3ECDC', body: '#C9AE7D', accent: '#E3D2AC' },
  其他: { wash: '#EFE8DC', body: '#BCA88C', accent: '#D8C9B2' },
}

const INK = '#3E342B'
const PAPER = '#FBF7EE'

/** 统一描边：细、圆角、低透明度，模拟铅笔勾线 */
const OUTLINE = {
  stroke: INK,
  strokeOpacity: 0.2,
  strokeWidth: 2.4,
  strokeLinejoin: 'round' as const,
  strokeLinecap: 'round' as const,
}

/* ------------------------------ 三套类群轮廓 ------------------------------ */

/** 鸟：侧身站姿（尾 + 身 + 头 + 喙 + 腿），一眼可辨 */
function BirdSilhouette({ tone }: { tone: Tone }) {
  return (
    <g>
      {/* 腿 */}
      <g stroke={tone.body} strokeWidth="3.6" strokeLinecap="round" fill="none">
        <path d="M52 86v13M64 86v13" />
        <path d="M46 99h11M58 99h11" strokeWidth="3" />
      </g>
      {/* 尾 + 身 + 头（同色并集 = 剪影） */}
      <g fill={tone.body} {...OUTLINE}>
        <path d="M38 58Q20 48 9 45q3 21 15 33z" />
        <ellipse cx="56" cy="68" rx="26" ry="21" />
        <circle cx="79" cy="46" r="15" />
        <path d="M93 44l15 6-15 6z" />
      </g>
      {/* 翅膀 */}
      <path d="M46 64q17-2 29 12-16 10-29-1z" fill={tone.accent} {...OUTLINE} strokeOpacity={0.14} />
      <circle cx="84" cy="43" r="2.9" fill={INK} opacity="0.72" />
    </g>
  )
}

/** 蛙：正面蹲姿（宽身 + 双凸眼 + 前爪 + 微笑口线） */
function FrogSilhouette({ tone }: { tone: Tone }) {
  return (
    <g>
      {/* 前爪 */}
      <g fill={tone.body} {...OUTLINE}>
        <ellipse cx="26" cy="93" rx="11" ry="6.5" />
        <ellipse cx="94" cy="93" rx="11" ry="6.5" />
      </g>
      {/* 身 + 头 + 眼球（并集） */}
      <g fill={tone.body} {...OUTLINE}>
        <ellipse cx="60" cy="76" rx="31" ry="23" />
        <ellipse cx="60" cy="58" rx="25" ry="19" />
        <circle cx="43" cy="44" r="12" />
        <circle cx="77" cy="44" r="12" />
      </g>
      {/* 肚皮高光 */}
      <ellipse cx="60" cy="80" rx="19" ry="11" fill={tone.accent} opacity="0.75" />
      {/* 眼睛 */}
      <circle cx="43" cy="43" r="6" fill={PAPER} />
      <circle cx="77" cy="43" r="6" fill={PAPER} />
      <circle cx="44" cy="44" r="3" fill={INK} opacity="0.78" />
      <circle cx="78" cy="44" r="3" fill={INK} opacity="0.78" />
      {/* 嘴 */}
      <path d="M45 76q15 12 30 0" stroke={INK} strokeOpacity="0.42" strokeWidth="3" fill="none" strokeLinecap="round" />
    </g>
  )
}

/** 虫：直立体（双翅 + 分节腹部 + 头 + 触角），覆盖蝉/螽斯/蟋蟀等鸣虫 */
function InsectSilhouette({ tone }: { tone: Tone }) {
  return (
    <g>
      {/* 触角 */}
      <g stroke={tone.body} strokeWidth="3" strokeLinecap="round" fill="none">
        <path d="M53 32Q42 17 30 13" />
        <path d="M67 32Q78 17 90 13" />
      </g>
      {/* 足 */}
      <g stroke={tone.body} strokeWidth="3" strokeLinecap="round" fill="none" opacity="0.85">
        <path d="M47 62L31 72M73 62l16 10M48 82l-13 12M72 82l13 12" />
      </g>
      {/* 双翅 */}
      <g fill={tone.accent} {...OUTLINE} strokeOpacity={0.14}>
        <ellipse cx="42" cy="68" rx="13" ry="28" transform="rotate(-15 42 68)" />
        <ellipse cx="78" cy="68" rx="13" ry="28" transform="rotate(15 78 68)" />
      </g>
      {/* 腹 + 头 */}
      <g fill={tone.body} {...OUTLINE}>
        <ellipse cx="60" cy="70" rx="14" ry="29" />
        <circle cx="60" cy="40" r="12" />
      </g>
      {/* 体节 */}
      <g stroke={PAPER} strokeWidth="2.2" strokeOpacity="0.5" fill="none" strokeLinecap="round">
        <path d="M49 68h22M50 80h20M53 90h14" />
      </g>
      <circle cx="55" cy="38" r="2.7" fill={INK} opacity="0.72" />
      <circle cx="65" cy="38" r="2.7" fill={INK} opacity="0.72" />
    </g>
  )
}

/** 其他：中性叶片，用于无法归类的条目（当前数据集为空，仅作防御） */
function LeafSilhouette({ tone }: { tone: Tone }) {
  return (
    <g>
      <path d="M60 26q32 18 24 52-28 14-44-10-8-26 20-42z" fill={tone.body} {...OUTLINE} />
      <path d="M48 82q10-26 28-42" stroke={PAPER} strokeWidth="3" strokeOpacity="0.7" fill="none" strokeLinecap="round" />
    </g>
  )
}

/* -------------------------------- 对外组件 -------------------------------- */

const SHAPES: Record<SpeciesGroup, (p: { tone: Tone }) => JSX.Element> = {
  鸟类: BirdSilhouette,
  蛙类: FrogSilhouette,
  昆虫: InsectSilhouette,
  其他: LeafSilhouette,
}

/**
 * 按类群渲染剪影占位。
 * 生产构建同样生效（不做 DEV 门禁）——线上缺图时就是靠它兜底。
 */
export function SpeciesSilhouette({
  group,
  className = '',
  label,
}: {
  group: SpeciesGroup
  className?: string
  /** 无障碍描述；不传则整块视作装饰 */
  label?: string
}) {
  const tone = TONES[group] ?? TONES.其他
  const Shape = SHAPES[group] ?? LeafSilhouette
  return (
    <svg
      viewBox="0 0 120 120"
      className={className}
      role="img"
      aria-hidden={label ? undefined : true}
      aria-label={label}
      data-silhouette={group}
    >
      {label && <title>{label}</title>}
      {/* 底色水洗：铺满，保证所有占位观感统一 */}
      <rect width="120" height="120" fill={tone.wash} />
      {/* 地面淡影，让剪影"站得住" */}
      <ellipse cx="60" cy="104" rx="34" ry="6.5" fill={INK} opacity="0.09" />
      <Shape tone={tone} />
    </svg>
  )
}
