// 物种详情页 /learn/:id
import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Button, Card, EmptyState } from '../components/ui'
import { GroupBadge, NoticeBar, PlayCallButton, SpeciesInfoPanel } from '../components/SpeciesCard'
import { SpeciesAvatar, colorOf } from '../components/PlaceholderArt'
import { getSpeciesById, speciesList } from '../data/species'
import { useCallPlayer } from '../lib/useCallPlayer'
import { isFavorite, toggleFavorite } from '../lib/storage'

export default function LearnDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const species = getSpeciesById(id)
  const { playingId, notice, play } = useCallPlayer()
  const [fav, setFav] = useState(false)

  useEffect(() => {
    if (id) setFav(isFavorite(id))
  }, [id])

  if (!species) {
    return (
      <Card>
        <EmptyState
          title="没有找到这个物种"
          desc="它可能还没被收录进听籁科普库，或者链接有点问题。"
          action={
            <div className="flex justify-center gap-3">
              <Button variant="soft" onClick={() => navigate(-1)}>返回上一页</Button>
              <Link to="/learn"><Button>回到物种库</Button></Link>
            </div>
          }
        />
      </Card>
    )
  }

  const color = colorOf(species.id)
  const related = speciesList.filter((s) => s.group === species.group && s.id !== species.id).slice(0, 4)

  return (
    <div className="space-y-7">
      {/* 面包屑 */}
      <nav className="flex items-center gap-2 text-sm text-ink-soft" aria-label="面包屑导航">
        <Link to="/learn" className="hover:text-leaf transition">听籁 · 物种库</Link>
        <span className="text-ink-faint">/</span>
        <span className="text-ink font-semibold">{species.name}</span>
      </nav>

      {/* 主卡 */}
      <Card className="overflow-hidden">
        <div
          className="px-6 sm:px-9 py-8"
          style={{ background: `linear-gradient(135deg, ${color}3A, ${color}0F)` }}
        >
          <div className="flex flex-col sm:flex-row sm:items-center gap-6">
            <SpeciesAvatar
              id={species.id}
              name={species.name}
              group={species.group}
              src={species.image}
              size={128}
              className="animate-popIn"
            />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2.5 flex-wrap">
                <h1 className="text-3xl sm:text-4xl font-bold text-ink leading-tight">{species.name}</h1>
                <GroupBadge group={species.group} />
              </div>
              <p className="text-base italic text-ink-soft mt-2">{species.scientific}</p>

              <div className="flex items-center gap-3 mt-5 flex-wrap">
                <PlayCallButton playing={playingId === species.id} onClick={() => play(species)} />
                <Button
                  variant="soft"
                  onClick={() => setFav(toggleFavorite(species.id))}
                  aria-pressed={fav}
                >
                  <span aria-hidden="true">{fav ? '★' : '☆'}</span>
                  {fav ? '已收藏' : '收藏'}
                </Button>
              </div>
            </div>
          </div>
        </div>

        <div className="px-6 sm:px-9 py-7 bg-paper-light/70">
          {notice && (
            <div className="mb-5">
              <NoticeBar text={notice} />
            </div>
          )}
          <SpeciesInfoPanel species={species} />
        </div>
      </Card>

      {/* 相关物种 */}
      {related.length > 0 && (
        <section>
          <h2 className="text-lg font-bold text-ink mb-4 flex items-center gap-2">
            <span className="inline-block w-2 h-5 rounded-full bg-moss" />
            同为「{species.group}」的还有
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {related.map((s) => (
              <Link key={s.id} to={`/learn/${s.id}`} className="group">
                <Card hoverable className="p-4 text-center h-full">
                  <div className="grid place-items-center">
                    <SpeciesAvatar id={s.id} name={s.name} group={s.group} src={s.image} size={72} />
                  </div>
                  <p className="mt-3 font-semibold text-ink text-sm truncate">{s.name}</p>
                  <p className="text-xs text-ink-faint mt-1 line-clamp-2 leading-relaxed">{s.callFeature}</p>
                </Card>
              </Link>
            ))}
          </div>
        </section>
      )}

      <div className="flex justify-center gap-3 pt-2">
        <Link to="/learn"><Button variant="soft">← 回到物种库</Button></Link>
        <Link to="/hall"><Button>去自然大厅找它</Button></Link>
      </div>
    </div>
  )
}
