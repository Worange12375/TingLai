// 自然大厅：可探索插画场景 + 可点击动物 NPC
// 点击 NPC → 播放叫声 + 弹出科普卡浮层。纯 CSS/SVG 绘制，不引游戏引擎、不做实时碰撞。
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { HallScene, SpeciesAvatar } from '../components/PlaceholderArt'
import { Modal, EmptyState, Button, Badge } from '../components/ui'
import { NoticeBar, SpeciesPopupCard } from '../components/SpeciesCard'
import { speciesList } from '../data/species'
import { useCallPlayer } from '../lib/useCallPlayer'
import type { Species } from '../types/species'

/** NPC 在场景中的锚点（百分比定位，随容器缩放） */
const ANCHORS = [
  { left: '14%', top: '62%', size: 92, delay: 0 },
  { left: '35%', top: '76%', size: 78, delay: 0.5 },
  { left: '56%', top: '58%', size: 86, delay: 1.0 },
  { left: '76%', top: '73%', size: 82, delay: 1.5 },
  { left: '88%', top: '52%', size: 66, delay: 2.0 },
  { left: '25%', top: '44%', size: 62, delay: 2.5 },
  { left: '66%', top: '40%', size: 58, delay: 3.0 },
] as const

export default function Hall() {
  const { playingId, notice, play, stop } = useCallPlayer()
  const [active, setActive] = useState<Species | null>(null)
  const [hovered, setHovered] = useState<string | null>(null)

  // 场景中最多摆放 7 只，优先保证类群多样性
  const npcs = useMemo(() => {
    if (speciesList.length === 0) return []
    const byGroup = new Map<string, Species[]>()
    speciesList.forEach((s) => {
      const arr = byGroup.get(s.group) ?? []
      arr.push(s)
      byGroup.set(s.group, arr)
    })
    const out: Species[] = []
    let round = 0
    // 轮转各类群，保证鸟/蛙/虫都出现在场景里
    while (out.length < Math.min(ANCHORS.length, speciesList.length) && round < 12) {
      for (const arr of byGroup.values()) {
        if (arr[round] && out.length < ANCHORS.length) out.push(arr[round])
      }
      round++
    }
    return out
  }, [])

  const openNpc = (s: Species) => {
    setActive(s)
    play(s)
  }

  const closeCard = () => {
    setActive(null)
    stop()
  }

  return (
    <div className="w-full">
      {/* 场景舞台 */}
      <section className="relative w-full h-[calc(100vh-4rem)] min-h-[520px] overflow-hidden">
        <HallScene />

        {/* 顶部说明浮条 */}
        <div className="absolute top-5 left-1/2 -translate-x-1/2 z-20 px-4 w-full max-w-2xl">
          <div className="rounded-3xl bg-paper-light/85 backdrop-blur-md sketch-border shadow-card px-5 py-3.5 text-center animate-fadeUp">
            <h1 className="text-lg sm:text-xl font-bold text-ink">自然大厅</h1>
            <p className="text-sm text-ink-soft mt-1">
              点击林间的小动物，听它的叫声，读它的故事
            </p>
          </div>
        </div>

        {/* 提示条（音频降级等） */}
        {notice && !active && (
          <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-20 px-4 w-full max-w-md">
            <NoticeBar text={notice} />
          </div>
        )}

        {/* 动物 NPC */}
        {npcs.map((s, i) => {
          const a = ANCHORS[i]
          const isPlaying = playingId === s.id
          const isHover = hovered === s.id
          return (
            <button
              key={s.id}
              onClick={() => openNpc(s)}
              onMouseEnter={() => setHovered(s.id)}
              onMouseLeave={() => setHovered(null)}
              onFocus={() => setHovered(s.id)}
              onBlur={() => setHovered(null)}
              className="absolute z-10 -translate-x-1/2 -translate-y-1/2 transition-transform duration-300 hover:scale-110 focus-visible:scale-110 focus-visible:outline-none animate-fadeUp"
              style={{
                left: a.left,
                top: a.top,
                animationDelay: `${i * 110}ms`,
              }}
              aria-label={`${s.name}（${s.group}），点击听叫声并查看科普卡`}
            >
              <span className="relative block animate-sway" style={{ animationDelay: `${a.delay}s` }}>
                {/* 播放中的声波涟漪 */}
                {isPlaying && (
                  <>
                    <span className="absolute inset-0 rounded-full border-2 border-paper-light/70 animate-ripple" />
                    <span
                      className="absolute inset-0 rounded-full border-2 border-paper-light/50 animate-ripple"
                      style={{ animationDelay: '0.55s' }}
                    />
                  </>
                )}
                <SpeciesAvatar
                  id={s.id}
                  name={s.name}
                  group={s.group}
                  src={s.image}
                  size={a.size}
                  className={isHover || isPlaying ? 'ring-4 ring-paper-light/85 shadow-lift' : ''}
                />
                {/* 悬停名牌 */}
                <span
                  className={`absolute left-1/2 -translate-x-1/2 -bottom-9 whitespace-nowrap rounded-full bg-paper-light/95 px-3 py-1 text-xs font-bold text-ink shadow-soft transition-all duration-200 ${
                    isHover || isPlaying ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-1 pointer-events-none'
                  }`}
                >
                  {s.name}
                </span>
              </span>
            </button>
          )
        })}

        {/* 空数据兜底 */}
        {npcs.length === 0 && (
          <div className="absolute inset-0 z-20 grid place-items-center px-4">
            <div className="rounded-3xl bg-paper-light/92 sketch-border shadow-card max-w-md">
              <EmptyState
                title="大厅里还没有住客"
                desc="物种科普库正在录入中，稍后这里就会有小动物出现。"
                action={<Link to="/recognize"><Button>先去识别一段声音</Button></Link>}
              />
            </div>
          </div>
        )}

        {/* 底部图例 */}
        <div className="absolute bottom-5 right-5 z-20 hidden sm:flex flex-col items-end gap-2">
          <div className="rounded-2xl bg-paper-light/80 backdrop-blur-sm sketch-border px-4 py-2.5 shadow-soft">
            <p className="text-xs text-ink-faint mb-1.5">场景住客 {npcs.length} 位</p>
            <div className="flex gap-1.5">
              {['鸟类', '蛙类', '昆虫'].map((g) => (
                <Badge key={g} tone={g === '鸟类' ? 'feather' : g === '蛙类' ? 'moss' : 'blossom'}>
                  {g}
                </Badge>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* 科普卡浮层 */}
      <Modal open={!!active} onClose={closeCard} labelledBy="species-popup-title">
        {active && (
          <SpeciesPopupCard
            species={active}
            playing={playingId === active.id}
            onPlay={() => play(active)}
            onClose={closeCard}
            notice={notice}
          />
        )}
      </Modal>

      {/* 场景外说明区 */}
      <section className="max-w-6xl mx-auto px-4 py-10">
        <div className="grid sm:grid-cols-3 gap-5">
          {[
            { icon: '🖐️', title: '点一点', desc: '每只小动物都可以点击，会播放它的叫声并展开科普卡。' },
            { icon: '🎧', title: '听一听', desc: '叫声素材来自公开自然声音库；缺少录音时会用合成示意音代替，并明确标注。' },
            { icon: '📖', title: '读一读', desc: '科普卡里有叫声特征、习性、分布与保护级别，点「查看完整科普」看更多。' },
          ].map((t) => (
            <div key={t.title} className="rounded-3xl bg-paper-light/70 sketch-border p-5 paper-texture">
              <p className="text-2xl">{t.icon}</p>
              <p className="font-bold text-ink mt-2">{t.title}</p>
              <p className="text-sm text-ink-soft mt-1.5 leading-relaxed">{t.desc}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
