// 手绘绘本风占位美术系统（纯 CSS + 内联 SVG，零图片依赖）
// —— 后续替换成真实插画时，只需改动本文件 ——
// 真图命名规范见 README：public/assets/npc-<物种id>.webp、hall-bg.webp、icon-<功能>.webp（原始 .png 仍保留于 assets 目录）
//
// 插画三态（见 SpeciesAvatar）：白名单内有图 → 手绘 WebP；白名单内断图 → 类群剪影；
// 不在白名单 → 类群剪影且不发请求。剪影本体在 ./SpeciesSilhouette。
import { useMemo, useState } from 'react'
import type { SpeciesGroup } from '../types/species'
import { ILLUSTRATED_IDS } from '../data/species'
import { SpeciesSilhouette } from './SpeciesSilhouette'

/* ---------------------------------- 调色 ---------------------------------- */

const PALETTE = ['#7C9473', '#E8A87C', '#6CA0C1', '#E9C46A', '#C8A87C', '#4F6B4A']

/** 由 id 稳定推出一个色值，保证同一物种每次颜色一致 */
export function colorOf(seed: string): string {
  let h = 0
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0
  return PALETTE[h % PALETTE.length]
}

/* ------------------------------- 类群剪影 -------------------------------- */

/**
 * @deprecated 类群剪影已迁至 ./SpeciesSilhouette（统一色板、统一描边）。
 * 此处保留同名导出以兼容旧调用点；`color` 参数不再生效——占位改用类群统一配色。
 */
export function GroupGlyph({ group, color, className = '' }: { group: SpeciesGroup; color?: string; className?: string }) {
  return <SpeciesSilhouette group={group} className={className} />
}

/* ------------------------------ 物种头像（带兜底） ------------------------------ */

/** 已配 bespoke 手绘插画的物种白名单（O(1) 查询） */
const ILLUSTRATED = new Set(ILLUSTRATED_IDS)

/**
 * 该物种是否拥有 bespoke 手绘插画。
 * 白名单是唯一依据：不在名单里就不发起任何图片请求（线上零 404）。
 */
export function hasBespokeIllustration(id: string): boolean {
  return ILLUSTRATED.has(id)
}

interface AvatarProps {
  id: string
  name: string
  group: SpeciesGroup
  src?: string
  size?: number
  className?: string
}

/**
 * 物种头像：三态渲染，绝不白屏、绝不 404。
 *
 *   ① 白名单内 + 图片加载成功 → bespoke 手绘 WebP（数据 image 路径优先，其次约定路径，再退 .png）
 *   ② 白名单内 + 所有候选图都失败 → 类群剪影（防止「声明了却没图」时开天窗）
 *   ③ 不在白名单内                → 直接类群剪影，一次网络请求都不发
 *
 * 白名单 = src/data/species.ts 的 ILLUSTRATED_IDS，美术补图后在那里追加 id 即可自动升级为 ①。
 * 注意：本兜底在生产构建中同样生效（没有 import.meta.env.DEV 门禁），线上就是靠它占位。
 */
export function SpeciesAvatar({ id, name, group, src, size = 96, className = '' }: AvatarProps) {
  // 仅白名单物种才组装候选图；其余物种候选列表为空 → 直接走剪影
  const candidates = useMemo(() => {
    if (!hasBespokeIllustration(id)) return []
    // 优先 WebP（体积更小）；数据里若仍写 .png 则自动转试 .webp，最后回退 .png
    const fromData = src ? (/\.png$/i.test(src) ? [src.replace(/\.png$/i, '.webp'), src] : [src]) : []
    return Array.from(new Set([...fromData, `/assets/npc-${id}.webp`, `/assets/npc-${id}.png`]))
  }, [id, src])

  // 记录加载失败次数；随 id 变化自动归零（列表复用同一 DOM 位置时不会误判）
  const [broken, setBroken] = useState<{ id: string; attempt: number }>({ id, attempt: 0 })
  const attempt = broken.id === id ? broken.attempt : 0
  const currentSrc = candidates[attempt]

  const color = colorOf(id)

  return (
    <div
      className={`relative shrink-0 rounded-full overflow-hidden paper-texture watercolor shadow-soft sketch-border ${className}`}
      style={{ width: size, height: size, background: `${color}2E` }}
      title={name}
      data-illustration={currentSrc ? 'bespoke' : 'silhouette'}
    >
      {currentSrc ? (
        <img
          src={currentSrc}
          alt={name}
          loading="lazy"
          className="w-full h-full object-cover"
          onError={() => setBroken({ id, attempt: attempt + 1 })}
        />
      ) : (
        <>
          <SpeciesSilhouette
            group={group}
            className="absolute inset-0 w-full h-full"
            label={`${name}（${group}）· 插画待补，暂用剪影占位`}
          />
          <span
            className="absolute right-1 bottom-1 grid place-items-center rounded-full bg-paper-light/90 font-bold text-ink shadow-soft"
            style={{ width: size * 0.34, height: size * 0.34, fontSize: size * 0.18 }}
          >
            {name.slice(0, 1)}
          </span>
        </>
      )}
    </div>
  )
}

/* ------------------------------- 大厅场景背景 ------------------------------- */

/**
 * 林地场景：CSS/SVG 绘制的手绘林地（天空 → 远山 → 林线 → 草地）。
 * 若 public/assets/hall-bg.webp 存在，会自动叠加真实插画；加载失败则保留 CSS 场景。
 */
export function HallScene({ className = '', bgSrc = '/assets/hall-bg.webp' }: { className?: string; bgSrc?: string }) {
  const [bgOk, setBgOk] = useState(true)
  return (
    <div className={`absolute inset-0 overflow-hidden ${className}`} aria-hidden="true">
      {/* 天空 */}
      <div
        className="absolute inset-0"
        style={{
          background:
            'linear-gradient(180deg, #EAF1F5 0%, #F3EDDF 42%, #EDE6D2 62%, #DCE0CB 100%)',
        }}
      />
      {/* 暖阳晕染 */}
      <div
        className="absolute inset-0"
        style={{
          background:
            'radial-gradient(420px 300px at 78% 14%, rgba(233,196,106,0.55), transparent 65%), radial-gradient(520px 340px at 14% 22%, rgba(108,160,193,0.28), transparent 68%)',
        }}
      />
      {/* 远山 */}
      <svg viewBox="0 0 1200 400" preserveAspectRatio="none" className="absolute inset-x-0 top-[26%] w-full h-[38%]">
        <path d="M0 260 L150 150 L280 235 L420 110 L560 240 L700 160 L860 250 L1010 140 L1200 245 L1200 400 L0 400Z" fill="#9CB093" opacity="0.55" />
        <path d="M0 300 L180 205 L340 285 L520 190 L690 290 L880 210 L1060 295 L1200 235 L1200 400 L0 400Z" fill="#7C9473" opacity="0.6" />
      </svg>
      {/* 林线 */}
      <svg viewBox="0 0 1200 260" preserveAspectRatio="none" className="absolute inset-x-0 top-[46%] w-full h-[34%]">
        {Array.from({ length: 16 }).map((_, i) => {
          const x = i * 78 + (i % 3) * 12
          const h = 96 + ((i * 37) % 62)
          return (
            <g key={i} opacity={0.5 + ((i % 4) * 0.08)}>
              <rect x={x + 20} y={230 - h * 0.32} width="9" height={h * 0.34} fill="#A98A61" rx="4" />
              <ellipse cx={x + 24} cy={232 - h * 0.46} rx={30 + (i % 3) * 6} ry={h * 0.34} fill={i % 2 ? '#4F6B4A' : '#617658'} />
            </g>
          )
        })}
      </svg>
      {/* 草地 */}
      <div
        className="absolute inset-x-0 bottom-0 h-[34%]"
        style={{
          background: 'linear-gradient(180deg, rgba(124,148,115,0.86) 0%, #6B8764 40%, #5B7455 100%)',
        }}
      />
      {/* 草地水彩斑块 */}
      <div
        className="absolute inset-x-0 bottom-0 h-[34%] opacity-70"
        style={{
          background:
            'radial-gradient(180px 60px at 18% 40%, rgba(79,107,74,0.55), transparent 70%), radial-gradient(220px 70px at 64% 62%, rgba(233,196,106,0.28), transparent 72%), radial-gradient(160px 54px at 88% 34%, rgba(79,107,74,0.5), transparent 70%)',
        }}
      />
      {/* 漂浮云 */}
      <div className="absolute left-[8%] top-[8%] animate-drift">
        <svg width="150" height="52" viewBox="0 0 150 52"><g fill="#FBF7EE" opacity="0.82"><ellipse cx="45" cy="32" rx="42" ry="18" /><ellipse cx="86" cy="26" rx="34" ry="20" /><ellipse cx="112" cy="34" rx="27" ry="14" /></g></svg>
      </div>
      <div className="absolute right-[12%] top-[15%] animate-drift" style={{ animationDelay: '-9s' }}>
        <svg width="118" height="44" viewBox="0 0 118 44"><g fill="#FBF7EE" opacity="0.7"><ellipse cx="36" cy="27" rx="34" ry="15" /><ellipse cx="72" cy="22" rx="28" ry="17" /></g></svg>
      </div>
      {/* 真实插画层（存在则覆盖 CSS 场景，缺失/加载失败则自动隐藏） */}
      {bgSrc && bgOk && (
        <img
          src={bgSrc}
          alt=""
          className="absolute inset-0 w-full h-full object-cover"
          onError={() => setBgOk(false)}
        />
      )}
      {/* 纸纹 */}
      <div
        className="absolute inset-0 opacity-[0.28] mix-blend-multiply"
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='140' height='140'%3E%3Cfilter id='h'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='3'/%3E%3CfeColorMatrix type='saturate' values='0'/%3E%3C/filter%3E%3Crect width='140' height='140' filter='url(%23h)' opacity='0.35'/%3E%3C/svg%3E\")",
        }}
      />
    </div>
  )
}

/* -------------------------------- 头图轮播画 -------------------------------- */

export type BannerVariant = 'dawn' | 'forest' | 'dusk'

const BANNER_BG: Record<BannerVariant, string> = {
  dawn: 'linear-gradient(120deg, #F3E2C7 0%, #E9C46A 45%, #E8A87C 100%)',
  forest: 'linear-gradient(120deg, #DCE7DA 0%, #7C9473 52%, #4F6B4A 100%)',
  dusk: 'linear-gradient(120deg, #CFE0EA 0%, #6CA0C1 48%, #4E809F 100%)',
}

/** 头图背景：渐变 + 山林剪影 + 飞鸟 */
export function BannerArt({ variant }: { variant: BannerVariant }) {
  return (
    <div className="absolute inset-0 overflow-hidden" aria-hidden="true">
      <div className="absolute inset-0" style={{ background: BANNER_BG[variant] }} />
      <div
        className="absolute inset-0"
        style={{
          background:
            'radial-gradient(360px 240px at 82% 22%, rgba(255,255,255,0.42), transparent 62%), radial-gradient(420px 260px at 10% 84%, rgba(62,52,43,0.16), transparent 66%)',
        }}
      />
      <svg viewBox="0 0 1200 220" preserveAspectRatio="none" className="absolute inset-x-0 bottom-0 w-full h-[62%]">
        <path d="M0 150 L170 78 L330 148 L500 60 L690 152 L860 88 L1040 158 L1200 96 L1200 220 L0 220Z" fill="#FBF7EE" opacity="0.22" />
        <path d="M0 182 L200 128 L400 186 L600 122 L820 190 L1020 138 L1200 184 L1200 220 L0 220Z" fill="#3E342B" opacity="0.16" />
      </svg>
      {/* 飞鸟剪影 */}
      <svg viewBox="0 0 200 60" className="absolute left-[12%] top-[22%] w-24 opacity-70 animate-sway">
        <path d="M10 30q14-14 28 0 14-14 28 0" stroke="#FBF7EE" strokeWidth="3.4" fill="none" strokeLinecap="round" />
        <path d="M84 18q10-10 20 0 10-10 20 0" stroke="#FBF7EE" strokeWidth="2.8" fill="none" strokeLinecap="round" />
      </svg>
      <div
        className="absolute inset-0 opacity-25 mix-blend-multiply"
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='120'%3E%3Cfilter id='b'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2'/%3E%3CfeColorMatrix type='saturate' values='0'/%3E%3C/filter%3E%3Crect width='120' height='120' filter='url(%23b)' opacity='0.32'/%3E%3C/svg%3E\")",
        }}
      />
    </div>
  )
}

/* ------------------------------ 功能图标（内联） ------------------------------ */

export type IconName = 'recognize' | 'learn' | 'quiz' | 'compose' | 'account' | 'hall'

export function FeatureIcon({ name, className = 'w-9 h-9' }: { name: IconName; className?: string }) {
  const common = { strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, fill: 'none' }
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true">
      {name === 'recognize' && (
        <g {...common} stroke="#4F6B4A">
          <circle cx="14" cy="14" r="8" />
          <path d="M20 20l6 6" />
          <path d="M11 14v2M14 11v8M17 13v4" stroke="#E8A87C" />
        </g>
      )}
      {name === 'learn' && (
        <g {...common} stroke="#6CA0C1">
          <path d="M5 7h9a3 3 0 013 3v15a3 3 0 00-3-3H5z" />
          <path d="M27 7h-9a3 3 0 00-3 3v15a3 3 0 013-3h9z" />
        </g>
      )}
      {name === 'quiz' && (
        <g {...common} stroke="#E9C46A">
          <circle cx="16" cy="16" r="11" />
          <path d="M12.5 12.5a3.6 3.6 0 116.2 2.5c-1.2 1.1-2.7 1.7-2.7 3.4" stroke="#4F6B4A" />
          <circle cx="16" cy="22.5" r="1.2" fill="#4F6B4A" stroke="none" />
        </g>
      )}
      {name === 'compose' && (
        <g {...common} stroke="#E8A87C">
          <path d="M12 22V8l12-3v14" />
          <circle cx="9" cy="22" r="3.2" fill="#E8A87C" stroke="none" />
          <circle cx="21" cy="19" r="3.2" fill="#E8A87C" stroke="none" />
        </g>
      )}
      {name === 'account' && (
        <g {...common} stroke="#C8A87C">
          <circle cx="16" cy="11" r="5" />
          <path d="M6 27c1.6-5.6 5.6-8.4 10-8.4S24.4 21.4 26 27" />
        </g>
      )}
      {name === 'hall' && (
        <g {...common} stroke="#7C9473">
          <path d="M16 4l11 9v14H5V13z" />
          <path d="M13 27v-8h6v8" stroke="#E8A87C" />
        </g>
      )}
    </svg>
  )
}

/* -------------------------------- 声波动效 -------------------------------- */

/** 播放中的声波条 */
export function SoundWave({ active = true, className = '' }: { active?: boolean; className?: string }) {
  const bars = [0.4, 0.75, 1, 0.6, 0.9, 0.5, 0.8]
  return (
    <div className={`flex items-end gap-[3px] h-5 ${className}`} aria-hidden="true">
      {bars.map((h, i) => (
        <span
          key={i}
          className="w-[3px] rounded-full bg-current transition-all duration-300"
          style={{
            height: active ? `${h * 100}%` : '22%',
            animation: active ? `sway ${0.7 + i * 0.11}s ease-in-out infinite` : undefined,
            animationDelay: `${i * 0.07}s`,
          }}
        />
      ))}
    </div>
  )
}
