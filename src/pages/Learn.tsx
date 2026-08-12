// 听籁：物种科普库列表（类群筛选 + 关键词搜索 + 卡片网格）
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Badge, Button, Card, DevBanner, EmptyState, SectionTitle } from '../components/ui'
import { NoticeBar, SpeciesCard } from '../components/SpeciesCard'
import { availableGroups, filterSpecies, speciesList } from '../data/species'
import { useCallPlayer } from '../lib/useCallPlayer'
import type { SpeciesGroup } from '../types/species'

type Filter = SpeciesGroup | '全部'

export default function Learn() {
  const [keyword, setKeyword] = useState('')
  const [group, setGroup] = useState<Filter>('全部')
  const { playingId, notice, play } = useCallPlayer()

  const results = useMemo(() => filterSpecies(keyword, group), [keyword, group])

  const tabs: Filter[] = ['全部', ...availableGroups]

  const counts = useMemo(() => {
    const m = new Map<Filter, number>([['全部', speciesList.length]])
    availableGroups.forEach((g) => m.set(g, speciesList.filter((s) => s.group === g).length))
    return m
  }, [])

  return (
    <div className="space-y-7">
      <SectionTitle
        title="听籁 · 物种科普库"
        sub={`团队原创整理的中文自然科普卡，目前收录 ${speciesList.length} 种`}
      />

      <DevBanner title="科普库持续扩充中">
        当前为初稿，收录多为常见鸟种，蛙类 / 昆虫的图文与高清图鉴仍在补录。
        若某物种资料显示「整理中」，说明它已识别命中、科普卡正在撰写，敬请期待。
      </DevBanner>

      {/* 筛选与搜索 */}
      <Card className="p-5">
        <div className="flex flex-col lg:flex-row lg:items-center gap-4">
          {/* 类群 Tab */}
          <div className="flex gap-2 flex-wrap flex-1">
            {tabs.map((t) => (
              <button
                key={t}
                onClick={() => setGroup(t)}
                className={[
                  'rounded-full px-4 py-2 text-sm font-semibold transition duration-200 sketch-border',
                  group === t
                    ? 'bg-moss text-paper-light shadow-soft'
                    : 'bg-paper-light/70 text-ink-soft hover:bg-wood-light/50 hover:text-ink',
                ].join(' ')}
              >
                {t}
                <span className={`ml-1.5 text-xs ${group === t ? 'opacity-80' : 'opacity-60'}`}>
                  {counts.get(t) ?? 0}
                </span>
              </button>
            ))}
          </div>

          {/* 搜索框 */}
          <div className="relative lg:w-72">
            <svg
              viewBox="0 0 24 24"
              className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none"
              fill="none"
              stroke="#9A8B7A"
              strokeWidth="2.2"
              strokeLinecap="round"
              aria-hidden="true"
            >
              <circle cx="11" cy="11" r="7" />
              <path d="M16.5 16.5L21 21" />
            </svg>
            <input
              type="search"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              placeholder="搜物种名、叫声或习性…"
              className="w-full rounded-full bg-paper-light/80 sketch-border pl-10 pr-4 py-2.5 text-sm text-ink placeholder:text-ink-faint focus:outline-none focus:ring-2 focus:ring-moss/50 transition"
              aria-label="搜索物种"
            />
          </div>
        </div>

        {(keyword || group !== '全部') && (
          <div className="flex items-center gap-3 mt-4 pt-4 border-t border-wood/25">
            <span className="text-sm text-ink-soft">
              找到 <strong className="text-leaf">{results.length}</strong> 个结果
            </span>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setKeyword('')
                setGroup('全部')
              }}
            >
              清除筛选
            </Button>
          </div>
        )}
      </Card>

      {notice && <NoticeBar text={notice} />}

      {/* 结果网格 */}
      {results.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {results.map((s, i) => (
            <SpeciesCard
              key={s.id}
              species={s}
              index={i}
              playing={playingId === s.id}
              onPlay={() => play(s)}
            />
          ))}
        </div>
      ) : (
        <Card>
          <EmptyState
            title={speciesList.length === 0 ? '科普库还在录入中' : '没有找到匹配的物种'}
            desc={
              speciesList.length === 0
                ? '物种数据正在整理，稍后回来就能看到完整的科普卡了。'
                : '换个关键词试试，或者切换到「全部」类群看看。'
            }
            action={
              speciesList.length === 0 ? (
                <Link to="/recognize"><Button>先去识别一段声音</Button></Link>
              ) : (
                <Button
                  onClick={() => {
                    setKeyword('')
                    setGroup('全部')
                  }}
                >
                  查看全部物种
                </Button>
              )
            }
          />
        </Card>
      )}

      {/* 数据来源说明 */}
      <Card className="p-6">
        <div className="flex items-start gap-3">
          <Badge tone="wood">内容说明</Badge>
          <p className="text-sm text-ink-soft leading-relaxed flex-1">
            科普文案由智更鸟队参考公开资料原创撰写，叫声素材引用自公开自然声音库（如 xeno-canto）。
            部分物种插画与录音仍在补充中，界面会以占位图与合成示意音代替，并明确标注，绝不冒充真实素材。
          </p>
        </div>
      </Card>
    </div>
  )
}
