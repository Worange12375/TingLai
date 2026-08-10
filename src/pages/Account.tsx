// 账号：纯 localStorage 模拟（昵称 / 收藏 / 识别记录 / Quiz 战绩），不接后端
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Badge, Button, Card, EmptyState, SectionTitle } from '../components/ui'
import { SpeciesAvatar } from '../components/PlaceholderArt'
import { getSpeciesById } from '../data/species'
import {
  clearHistory,
  getFavorites,
  getHistory,
  getNickname,
  getQuizStats,
  resetAll,
  setNickname,
  toggleFavorite,
  type HistoryItem,
  type QuizStats,
} from '../lib/storage'

export default function Account() {
  const [nick, setNick] = useState('')
  const [draft, setDraft] = useState('')
  const [editing, setEditing] = useState(false)
  const [favs, setFavs] = useState<string[]>([])
  const [history, setHistory] = useState<HistoryItem[]>([])
  const [stats, setStats] = useState<QuizStats>({ played: 0, correct: 0, best: 0 })

  const refresh = () => {
    const n = getNickname()
    setNick(n)
    setDraft(n)
    setFavs(getFavorites())
    setHistory(getHistory())
    setStats(getQuizStats())
  }

  useEffect(refresh, [])

  const save = () => {
    const v = draft.trim()
    if (!v) return
    setNickname(v)
    setNick(v)
    setEditing(false)
  }

  const favSpecies = favs.map(getSpeciesById).filter((s): s is NonNullable<typeof s> => !!s)

  return (
    <div className="space-y-7">
      <SectionTitle title="我的账号" sub="收藏、识别记录与游戏战绩都保存在你自己的浏览器里" />

      {/* 资料卡 */}
      <Card className="p-6 sm:p-8">
        <div className="flex flex-col sm:flex-row sm:items-center gap-6">
          <div className="w-24 h-24 grid place-items-center rounded-full bg-feather/22 sketch-border shadow-soft shrink-0 mx-auto sm:mx-0">
            <span className="text-4xl font-bold text-feather-dark">{nick ? nick.slice(0, 1) : '客'}</span>
          </div>

          <div className="flex-1 min-w-0 text-center sm:text-left">
            {editing ? (
              <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
                <input
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && save()}
                  maxLength={12}
                  autoFocus
                  placeholder="给自己起个昵称"
                  className="flex-1 rounded-full bg-paper-light sketch-border px-5 py-2.5 text-ink placeholder:text-ink-faint focus:outline-none focus:ring-2 focus:ring-moss/50"
                  aria-label="昵称输入框"
                />
                <div className="flex gap-2 justify-center">
                  <Button size="sm" onClick={save} disabled={!draft.trim()}>保存</Button>
                  <Button size="sm" variant="ghost" onClick={() => { setEditing(false); setDraft(nick) }}>
                    取消
                  </Button>
                </div>
              </div>
            ) : (
              <>
                <h2 className="text-2xl font-bold text-ink">{nick || '林间访客'}</h2>
                <p className="text-sm text-ink-soft mt-1.5">
                  {nick ? '欢迎回到听籁' : '还没有昵称，取一个吧'}
                </p>
                <div className="flex gap-2 mt-4 justify-center sm:justify-start">
                  <Button size="sm" variant="soft" onClick={() => setEditing(true)}>
                    {nick ? '修改昵称' : '设置昵称'}
                  </Button>
                </div>
              </>
            )}
          </div>

          <div className="flex gap-6 justify-center shrink-0">
            {[
              { n: favSpecies.length, l: '收藏' },
              { n: history.length, l: '识别记录' },
              { n: stats.correct, l: 'Quiz 答对' },
            ].map((s) => (
              <div key={s.l} className="text-center">
                <p className="text-2xl font-bold text-leaf">{s.n}</p>
                <p className="text-xs text-ink-soft mt-1">{s.l}</p>
              </div>
            ))}
          </div>
        </div>

        <p className="text-xs text-ink-faint mt-6 pt-5 border-t border-wood/25 leading-relaxed">
          听籁当前为纯前端应用，不设服务器、不收集任何个人信息。以上数据仅存储在本机浏览器的
          localStorage 中，清除浏览器数据即会消失。
        </p>
      </Card>

      {/* 收藏 */}
      <section>
        <h2 className="text-lg font-bold text-ink mb-4 flex items-center gap-2">
          <span className="inline-block w-2 h-5 rounded-full bg-blossom" />
          我的收藏
        </h2>
        {favSpecies.length > 0 ? (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {favSpecies.map((s) => (
              <Card key={s.id} hoverable className="p-4 text-center">
                <Link to={`/learn/${s.id}`}>
                  <div className="grid place-items-center">
                    <SpeciesAvatar id={s.id} name={s.name} group={s.group} src={s.image} size={68} />
                  </div>
                  <p className="font-semibold text-ink text-sm mt-3 truncate">{s.name}</p>
                  <p className="text-xs text-ink-faint mt-0.5">{s.group}</p>
                </Link>
                <button
                  onClick={() => {
                    toggleFavorite(s.id)
                    setFavs(getFavorites())
                  }}
                  className="text-xs text-ink-faint hover:text-sunset-dark mt-2 transition"
                >
                  取消收藏
                </button>
              </Card>
            ))}
          </div>
        ) : (
          <Card>
            <EmptyState
              icon="☆"
              title="还没有收藏任何物种"
              desc="在物种详情页点「收藏」，就能把喜欢的小动物存到这里。"
              action={<Link to="/learn"><Button>去逛物种库</Button></Link>}
            />
          </Card>
        )}
      </section>

      {/* 识别记录 */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-ink flex items-center gap-2">
            <span className="inline-block w-2 h-5 rounded-full bg-moss" />
            识别记录
          </h2>
          {history.length > 0 && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                clearHistory()
                setHistory([])
              }}
            >
              清空记录
            </Button>
          )}
        </div>

        {history.length > 0 ? (
          <Card className="divide-y divide-wood/20 overflow-hidden">
            {history.slice(0, 15).map((h, i) => {
              const sp = getSpeciesById(h.speciesId)
              return (
                <div key={`${h.at}-${i}`} className="flex items-center gap-4 p-4">
                  {sp ? (
                    <SpeciesAvatar id={sp.id} name={sp.name} group={sp.group} src={sp.image} size={44} />
                  ) : (
                    <span className="w-11 h-11 grid place-items-center rounded-full bg-wood-light/45 text-lg">🎵</span>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-ink text-sm truncate">{h.speciesName}</p>
                    <p className="text-xs text-ink-faint mt-0.5">
                      {new Date(h.at).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-bold text-leaf tabular-nums">{Math.round(h.confidence * 100)}%</p>
                    {h.source === 'local-fallback' && (
                      <Badge tone="wood" className="mt-1">示例</Badge>
                    )}
                  </div>
                  {sp && (
                    <Link
                      to={`/learn/${sp.id}`}
                      className="text-xs font-semibold text-leaf hover:underline shrink-0"
                    >
                      详情
                    </Link>
                  )}
                </div>
              )
            })}
          </Card>
        ) : (
          <Card>
            <EmptyState
              icon="🎙️"
              title="还没有识别过声音"
              desc="去「识籁」录一段或传一个音频文件，识别结果会自动记在这里。"
              action={<Link to="/recognize"><Button>去识别</Button></Link>}
            />
          </Card>
        )}
      </section>

      {/* 危险操作 */}
      <Card className="p-5">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <p className="font-semibold text-ink text-sm">清除全部本地数据</p>
            <p className="text-xs text-ink-soft mt-1">包括昵称、收藏、识别记录与 Quiz 战绩，操作不可撤销。</p>
          </div>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              if (window.confirm('确定要清除听籁在本机保存的全部数据吗？')) {
                resetAll()
                refresh()
              }
            }}
          >
            清除
          </Button>
        </div>
      </Card>
    </div>
  )
}
