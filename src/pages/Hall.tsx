// 自然大厅：可探索插画场景 + 可点击动物 NPC
// 点击 NPC → 播放叫声 + 弹出科普卡浮层。纯 CSS/SVG 绘制，不引游戏引擎、不做实时碰撞。
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { HallScene, SpeciesAvatar } from '../components/PlaceholderArt'
import { Modal, EmptyState, Button, Badge } from '../components/ui'
import { NoticeBar, SpeciesPopupCard } from '../components/SpeciesCard'
import { ILLUSTRATED_IDS, speciesList } from '../data/species'
import { useCallPlayer } from '../lib/useCallPlayer'
import type { Species } from '../types/species'

/**
 * 主推 NPC = 已配手绘插画的物种，占据场景中最显眼、尺寸最大的锚点位。
 * 名单维护在 src/data/species.ts 的 ILLUSTRATED_IDS（首页 C 位卡片共用同一份），
 * 美术补图后在那里追加 id 即可，本文件无需改动。
 */
const HALL_NPCS = ILLUSTRATED_IDS

/**
 * NPC 在场景中的锚点（百分比定位，随容器缩放）。
 * 前 5 个是主推位（大尺寸 + 视觉焦点区），后 2 个为补位（小尺寸、靠边靠后），
 * 由未配插画的物种按类群轮转填充，用 SVG 手绘占位呈现。
 */
const ANCHORS = [
  { left: '20%', top: '64%', size: 104, delay: 0 },   // 戴胜：前景左，地面觅食
  { left: '48%', top: '51%', size: 92, delay: 0.6 },  // 黄鹂：树冠中部
  { left: '73%', top: '61%', size: 88, delay: 1.2 },  // 麻雀：中景右
  { left: '35%', top: '80%', size: 84, delay: 1.8 },  // 青蛙：低位近水
  { left: '87%', top: '44%', size: 72, delay: 2.4 },  // 纺织娘：右侧枝叶间
  { left: '60%', top: '79%', size: 62, delay: 3.0 },  // 补位
  { left: '11%', top: '43%', size: 56, delay: 3.6 },  // 补位
] as const

export default function Hall() {
  const { playingId, notice, play, stop } = useCallPlayer()
  const [active, setActive] = useState<Species | null>(null)
  const [hovered, setHovered] = useState<string | null>(null)

  // 主推物种优先上场，剩余锚点用其它物种按类群轮转补齐
  const npcs = useMemo(() => {
    if (speciesList.length === 0) return []

    // 1) 主推：按 HALL_NPCS 顺序取，数据里查不到的 id 直接跳过（不报错、不留空位）
    const featured = HALL_NPCS.map((id) => speciesList.find((s) => s.id === id)).filter(
      (s): s is Species => !!s,
    )

    const out: Species[] = [...featured]
    const used = new Set(out.map((s) => s.id))

    // 2) 补位：剩余物种按类群轮转，保证鸟/蛙/虫都在场景里露面
    const byGroup = new Map<string, Species[]>()
    speciesList
      .filter((s) => !used.has(s.id))
      .forEach((s) => {
        const arr = byGroup.get(s.group) ?? []
        arr.push(s)
        byGroup.set(s.group, arr)
      })

    let round = 0
    while (out.length < Math.min(ANCHORS.length, speciesList.length) && round < 12) {
      for (const arr of byGroup.values()) {
        if (arr[round] && out.length < ANCHORS.length) out.push(arr[round])
      }
      round++
    }
    return out
  }, [])

  // 有真实插画的数量，用于场景图例
  const illustratedCount = useMemo(
    () => npcs.filter((s) => (HALL_NPCS as readonly string[]).includes(s.id)).length,
    [npcs],
  )

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
            <p className="text-xs text-ink-faint mb-1.5">
              场景住客 {npcs.length} 位
              {illustratedCount > 0 && ` · ${illustratedCount} 位已有手绘插画`}
              {npcs.length > illustratedCount && `，其余为类群剪影占位`}
            </p>
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
