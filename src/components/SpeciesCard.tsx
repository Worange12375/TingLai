// 物种相关展示组件：列表卡片 / 详情信息面板 / 浮层科普卡 / 播放按钮 / 提示条
import { Link } from 'react-router-dom'
import type { Species } from '../types/species'
import { SpeciesAvatar, SoundWave, colorOf } from './PlaceholderArt'
import { SpeciesName } from './SpeciesName'
import { Badge, Button, Card } from './ui'

/* ------------------------------- 类群标签色 ------------------------------- */

export function GroupBadge({ group }: { group: Species['group'] }) {
  const tone = group === '鸟类' ? 'feather' : group === '蛙类' ? 'moss' : group === '昆虫' ? 'blossom' : 'wood'
  return <Badge tone={tone as 'feather' | 'moss' | 'blossom' | 'wood'}>{group}</Badge>
}

/* -------------------------------- 播放按钮 -------------------------------- */

export function PlayCallButton({
  playing,
  onClick,
  size = 'md',
  label = '播放叫声',
}: {
  playing: boolean
  onClick: () => void
  size?: 'sm' | 'md'
  label?: string
}) {
  return (
    <Button
      variant={playing ? 'secondary' : 'primary'}
      size={size === 'sm' ? 'sm' : 'md'}
      onClick={onClick}
      aria-label={playing ? '停止播放' : label}
    >
      {playing ? (
        <>
          <SoundWave active className="text-paper-light w-5" />
          <span>播放中</span>
        </>
      ) : (
        <>
          <svg viewBox="0 0 24 24" className="w-4 h-4" fill="currentColor" aria-hidden="true">
            <path d="M8 5.5v13a1 1 0 001.54.84l10-6.5a1 1 0 000-1.68l-10-6.5A1 1 0 008 5.5z" />
          </svg>
          <span>{label}</span>
        </>
      )}
    </Button>
  )
}

/* -------------------------------- 提示条 --------------------------------- */

export function NoticeBar({ text }: { text: string }) {
  if (!text) return null
  return (
    <div
      className="flex items-start gap-2 rounded-2xl bg-blossom/25 sketch-border px-4 py-2.5 text-sm text-ink-soft animate-fadeUp"
      role="status"
    >
      <span aria-hidden="true">🔈</span>
      <span className="flex-1 leading-relaxed">{text}</span>
    </div>
  )
}

/* ------------------------------- 列表卡片 -------------------------------- */

export function SpeciesCard({
  species,
  playing,
  onPlay,
  index = 0,
}: {
  species: Species
  playing: boolean
  onPlay: () => void
  index?: number
}) {
  return (
    <Card
      hoverable
      className="p-5 flex flex-col gap-3.5 animate-fadeUp"
      as="article"
      style={{ animationDelay: `${Math.min(index, 12) * 45}ms` }}
    >
      <div className="flex items-start gap-4">
        <SpeciesAvatar id={species.id} name={species.name} group={species.group} src={species.image} size={72} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            {/* 拼音另起一行：卡片横向空间有限，避免长名（如「红头长尾山雀」）把注音挤掉 */}
            <h3 className="font-bold text-ink text-lg leading-tight min-w-0">
              <SpeciesName species={species} stacked />
            </h3>
            <GroupBadge group={species.group} />
          </div>
          <p className="text-xs italic text-ink-faint mt-1 truncate">{species.scientific}</p>
          <p className="text-sm text-ink-soft mt-2 line-clamp-2 leading-relaxed">
            <span className="text-leaf font-semibold">叫声 · </span>
            {species.callFeature}
          </p>
        </div>
      </div>

      <div className="flex items-center justify-between gap-2 pt-1 mt-auto">
        <span className="text-xs text-ink-faint truncate flex-1">{species.protectLevel}</span>
        <div className="flex items-center gap-2 shrink-0">
          <PlayCallButton playing={playing} onClick={onPlay} size="sm" label="试听" />
          <Link
            to={`/learn/${species.id}`}
            className="rounded-full px-3.5 py-1.5 text-sm font-semibold text-ink-soft hover:text-ink hover:bg-wood-light/50 transition sketch-border"
          >
            详情
          </Link>
        </div>
      </div>
    </Card>
  )
}

/* ------------------------------ 详情信息面板 ------------------------------ */

function InfoRow({ icon, label, value }: { icon: string; label: string; value: string }) {
  if (!value) return null
  return (
    <div className="flex gap-3 py-2.5 border-b border-wood/25 last:border-0">
      <span className="shrink-0 w-7 h-7 grid place-items-center rounded-full bg-wood-light/45 text-sm" aria-hidden="true">
        {icon}
      </span>
      <div className="min-w-0">
        <p className="text-xs font-semibold text-ink-faint">{label}</p>
        <p className="text-[15px] text-ink leading-relaxed mt-0.5">{value}</p>
      </div>
    </div>
  )
}

/* --------------------------- 音频来源与授权 --------------------------- */

const LICENSE_MAP: Record<string, { label: string; tone: string }> = {
  CC0: { label: 'CC0 · 公共领域', tone: 'bg-leaf/15 text-leaf' },
  'CC BY': { label: 'CC BY · 署名', tone: 'bg-feather/20 text-feather' },
  'CC BY-NC': { label: 'CC BY-NC · 非商业署名', tone: 'bg-blossom/25 text-ink-soft' },
  'CC BY-NC-SA': { label: 'CC BY-NC-SA · 非商业署名-相同方式共享', tone: 'bg-blossom/25 text-ink-soft' },
  'CC BY-NC-SA 4.0': { label: 'CC BY-NC-SA 4.0 · 非商业署名-相同方式共享', tone: 'bg-blossom/25 text-ink-soft' },
}

function LicenseBadge({ license }: { license: string }) {
  if (!license) return null
  const hit = LICENSE_MAP[license.trim()]
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${hit ? hit.tone : 'bg-wood-light/60 text-ink-soft'}`}
    >
      {hit ? hit.label : license}
    </span>
  )
}

export function AudioAttribution({ species }: { species: Species }) {
  const { audioSource, audioLicense } = species
  // 兜底：两字段皆空则不渲染，避免空白区块（当前 JSON 未填时静默跳过）
  if (!audioSource && !audioLicense) return null
  return (
    <div className="pt-3 mt-1">
      <p className="text-xs font-semibold text-ink-faint mb-1.5">音频来源与授权</p>
      {audioSource && <p className="text-[15px] text-ink leading-relaxed">{audioSource}</p>}
      {audioLicense && (
        <div className="mt-2">
          <LicenseBadge license={audioLicense} />
        </div>
      )}
    </div>
  )
}

export function SpeciesInfoPanel({ species }: { species: Species }) {
  return (
    <div>
      <InfoRow icon="🎵" label="叫声特征" value={species.callFeature} />
      <InfoRow icon="🌿" label="习性" value={species.habit} />
      <InfoRow icon="🗺️" label="分布" value={species.distribution} />
      <InfoRow icon="🛡️" label="保护级别" value={species.protectLevel} />
      <InfoRow icon="✨" label="趣味知识" value={species.funFact} />
      <AudioAttribution species={species} />
    </div>
  )
}

/* ------------------------------ 浮层科普卡 ------------------------------- */

export function SpeciesPopupCard({
  species,
  playing,
  onPlay,
  onClose,
  notice,
}: {
  species: Species
  playing: boolean
  onPlay: () => void
  onClose: () => void
  notice?: string
}) {
  const color = colorOf(species.id)
  return (
    <Card className="overflow-hidden">
      {/* 卡头：水彩色带 */}
      <div
        className="relative px-6 pt-6 pb-5"
        style={{ background: `linear-gradient(135deg, ${color}38, ${color}12)` }}
      >
        <button
          onClick={onClose}
          className="absolute top-4 right-4 w-9 h-9 grid place-items-center rounded-full bg-paper-light/85 hover:bg-paper-light text-ink-soft hover:text-ink transition shadow-soft"
          aria-label="关闭科普卡"
        >
          <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>

        <div className="flex items-center gap-4 pr-10">
          <SpeciesAvatar id={species.id} name={species.name} group={species.group} src={species.image} size={82} />
          <div className="min-w-0">
            <h3 id="species-popup-title" className="text-2xl font-bold text-ink leading-tight">
              <SpeciesName species={species} size="sm" />
            </h3>
            <p className="text-sm italic text-ink-soft mt-1">{species.scientific}</p>
            <div className="mt-2">
              <GroupBadge group={species.group} />
            </div>
          </div>
        </div>
      </div>

      <div className="px-6 pb-6 pt-1 bg-paper-light/70">
        <SpeciesInfoPanel species={species} />

        {notice && (
          <div className="mt-4">
            <NoticeBar text={notice} />
          </div>
        )}

        <div className="flex items-center gap-3 mt-5">
          <PlayCallButton playing={playing} onClick={onPlay} />
          <Link
            to={`/learn/${species.id}`}
            className="rounded-full px-5 py-2.5 text-[15px] font-semibold text-ink-soft hover:text-ink hover:bg-wood-light/50 transition sketch-border"
          >
            查看完整科普
          </Link>
        </div>
      </div>
    </Card>
  )
}
