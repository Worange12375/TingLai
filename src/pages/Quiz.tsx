// 识声 Quiz：听一段叫声 → 从 4 个选项里选出物种 → 计分 + 展示科普卡
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Badge, Button, Card, EmptyState, SectionTitle } from '../components/ui'
import { GroupBadge, NoticeBar, PlayCallButton } from '../components/SpeciesCard'
import { SpeciesAvatar } from '../components/PlaceholderArt'
import { speciesList } from '../data/species'
import { useCallPlayer } from '../lib/useCallPlayer'
import { getQuizStats, recordQuiz } from '../lib/storage'
import type { Species } from '../types/species'

const ROUNDS = 5
const OPTIONS = 4

interface Question {
  answer: Species
  options: Species[]
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

function buildQuiz(): Question[] {
  if (speciesList.length < 2) return []
  const picked = shuffle(speciesList).slice(0, Math.min(ROUNDS, speciesList.length))
  return picked.map((answer) => {
    const distractors = shuffle(speciesList.filter((s) => s.id !== answer.id)).slice(0, OPTIONS - 1)
    return { answer, options: shuffle([answer, ...distractors]) }
  })
}

export default function Quiz() {
  const [questions, setQuestions] = useState<Question[]>([])
  const [idx, setIdx] = useState(0)
  const [picked, setPicked] = useState<string | null>(null)
  const [score, setScore] = useState(0)
  const [done, setDone] = useState(false)
  const [started, setStarted] = useState(false)
  const { playingId, notice, play, stop } = useCallPlayer()
  const stats = useMemo(() => getQuizStats(), [done, started])

  const start = useCallback(() => {
    const qs = buildQuiz()
    setQuestions(qs)
    setIdx(0)
    setScore(0)
    setPicked(null)
    setDone(false)
    setStarted(true)
  }, [])

  const current = questions[idx]

  // 出新题时自动播放叫声
  useEffect(() => {
    if (started && current && !picked) {
      const t = window.setTimeout(() => play(current.answer), 350)
      return () => window.clearTimeout(t)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idx, started])

  const choose = (id: string) => {
    if (picked) return
    setPicked(id)
    stop()
    if (id === current.answer.id) setScore((s) => s + 1)
  }

  const next = () => {
    stop()
    if (idx + 1 >= questions.length) {
      const finalScore = score
      recordQuiz(finalScore, questions.length)
      setDone(true)
    } else {
      setIdx((i) => i + 1)
      setPicked(null)
    }
  }

  /* ------------------------------ 数据不足 ------------------------------ */

  if (speciesList.length < 2) {
    return (
      <Card>
        <EmptyState
          title="题库还不够出题"
          desc="识声 Quiz 需要至少 2 个物种才能开局，科普库正在录入中，稍后再来玩吧。"
          action={<Link to="/learn"><Button>先去看看物种库</Button></Link>}
        />
      </Card>
    )
  }

  /* ------------------------------- 开始页 ------------------------------- */

  if (!started) {
    return (
      <div className="space-y-7">
        <SectionTitle title="识声 Quiz" sub="听一段叫声，猜猜它的主人是谁——适合和孩子一起玩" />
        <Card className="p-8 sm:p-12 text-center">
          <div className="mx-auto w-24 h-24 grid place-items-center rounded-full bg-blossom/30 text-5xl mb-6">
            🎧
          </div>
          <h2 className="text-2xl font-bold text-ink">准备好了吗？</h2>
          <p className="text-ink-soft mt-3 max-w-md mx-auto leading-relaxed">
            共 {Math.min(ROUNDS, speciesList.length)} 道题，每题会播放一段叫声，
            从 {OPTIONS} 个候选里选出正确的物种。答完可以看到每一题的科普卡。
          </p>

          {stats.played > 0 && (
            <div className="flex justify-center gap-8 mt-7 pt-6 border-t border-wood/25">
              {[
                { n: stats.played, l: '累计答题' },
                { n: stats.correct, l: '答对' },
                { n: `${stats.played ? Math.round((stats.correct / stats.played) * 100) : 0}%`, l: '正确率' },
                { n: stats.best, l: '单局最佳' },
              ].map((s) => (
                <div key={s.l}>
                  <p className="text-2xl font-bold text-leaf">{s.n}</p>
                  <p className="text-xs text-ink-soft mt-1">{s.l}</p>
                </div>
              ))}
            </div>
          )}

          <Button size="lg" className="mt-8" onClick={start}>
            开始挑战
          </Button>
        </Card>
      </div>
    )
  }

  /* ------------------------------- 结算页 ------------------------------- */

  if (done) {
    const rate = Math.round((score / questions.length) * 100)
    const medal = rate >= 80 ? '🏆' : rate >= 50 ? '🌿' : '🍂'
    const word = rate >= 80 ? '了不起，你是林间的好耳朵！' : rate >= 50 ? '不错，再听几遍就更熟了。' : '别急，多听几次就认得出了。'
    return (
      <div className="space-y-7">
        <SectionTitle title="识声 Quiz · 本局结果" />
        <Card className="p-8 sm:p-12 text-center">
          <p className="text-6xl mb-4">{medal}</p>
          <p className="text-4xl font-bold text-leaf">
            {score}
            <span className="text-xl text-ink-soft"> / {questions.length}</span>
          </p>
          <p className="text-ink-soft mt-3">{word}</p>

          <div className="mt-8 space-y-3 text-left">
            {questions.map((q, i) => (
              <Link key={q.answer.id} to={`/learn/${q.answer.id}`}>
                <div className="flex items-center gap-3 rounded-2xl bg-wood-light/20 sketch-border p-3.5 hover:bg-wood-light/35 transition">
                  <SpeciesAvatar id={q.answer.id} name={q.answer.name} group={q.answer.group} src={q.answer.image} size={48} />
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-ink text-sm truncate">
                      第 {i + 1} 题 · {q.answer.name}
                    </p>
                    <p className="text-xs text-ink-soft truncate mt-0.5">{q.answer.callFeature}</p>
                  </div>
                  <span className="text-xs text-leaf font-semibold shrink-0">科普 →</span>
                </div>
              </Link>
            ))}
          </div>

          <div className="flex justify-center gap-3 mt-8">
            <Button onClick={start}>再来一局</Button>
            <Link to="/learn"><Button variant="soft">去物种库复习</Button></Link>
          </div>
        </Card>
      </div>
    )
  }

  /* ------------------------------- 答题页 ------------------------------- */

  const correct = picked === current.answer.id

  return (
    <div className="space-y-6">
      {/* 进度 */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex-1">
          <div className="flex items-center justify-between text-sm text-ink-soft mb-2">
            <span className="font-semibold">第 {idx + 1} / {questions.length} 题</span>
            <span>得分 <strong className="text-leaf">{score}</strong></span>
          </div>
          <div className="h-2 rounded-full bg-wood-light/45 overflow-hidden">
            <div
              className="h-full rounded-full bg-moss transition-[width] duration-500"
              style={{ width: `${((idx + (picked ? 1 : 0)) / questions.length) * 100}%` }}
            />
          </div>
        </div>
      </div>

      {/* 听声区 */}
      <Card className="p-8 text-center">
        <p className="text-sm text-ink-soft mb-5">听听这是谁在叫？</p>
        <div className="flex justify-center">
          <PlayCallButton
            playing={playingId === current.answer.id}
            onClick={() => play(current.answer)}
            label="再听一次"
          />
        </div>
        {notice && (
          <div className="mt-5 max-w-md mx-auto">
            <NoticeBar text={notice} />
          </div>
        )}
      </Card>

      {/* 选项 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {current.options.map((o) => {
          const isAnswer = o.id === current.answer.id
          const isPicked = picked === o.id
          let tone = 'bg-paper-light/85 hover:bg-wood-light/45'
          if (picked) {
            if (isAnswer) tone = 'bg-moss/30 ring-2 ring-moss'
            else if (isPicked) tone = 'bg-sunset/30 ring-2 ring-sunset'
            else tone = 'bg-paper-light/50 opacity-60'
          }
          return (
            <button
              key={o.id}
              onClick={() => choose(o.id)}
              disabled={!!picked}
              className={`flex items-center gap-4 rounded-3xl sketch-border shadow-soft p-4 text-left transition duration-200 ${tone} ${!picked ? 'hover:-translate-y-0.5' : ''}`}
            >
              <SpeciesAvatar id={o.id} name={o.name} group={o.group} src={o.image} size={56} />
              <div className="min-w-0 flex-1">
                <p className="font-bold text-ink truncate">{o.name}</p>
                <p className="text-xs text-ink-faint truncate mt-0.5">{o.scientific}</p>
              </div>
              {picked && isAnswer && <span className="text-xl shrink-0">✅</span>}
              {picked && isPicked && !isAnswer && <span className="text-xl shrink-0">❌</span>}
            </button>
          )
        })}
      </div>

      {/* 答后科普卡 */}
      {picked && (
        <Card className="p-6 animate-fadeUp">
          <div className="flex items-start gap-4">
            <SpeciesAvatar
              id={current.answer.id}
              name={current.answer.name}
              group={current.answer.group}
              src={current.answer.image}
              size={68}
            />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <Badge tone={correct ? 'moss' : 'sunset'}>{correct ? '答对了' : '正确答案'}</Badge>
                <h3 className="font-bold text-ink text-lg">{current.answer.name}</h3>
                <GroupBadge group={current.answer.group} />
              </div>
              <p className="text-sm text-ink-soft mt-2.5 leading-relaxed">
                <strong className="text-leaf">叫声 · </strong>{current.answer.callFeature}
              </p>
              {current.answer.funFact && (
                <p className="text-sm text-ink-soft mt-1.5 leading-relaxed">
                  <strong className="text-leaf">趣味 · </strong>{current.answer.funFact}
                </p>
              )}
            </div>
          </div>
          <div className="flex justify-end gap-3 mt-5">
            <Link to={`/learn/${current.answer.id}`}>
              <Button variant="ghost" size="sm">查看完整科普</Button>
            </Link>
            <Button onClick={next}>
              {idx + 1 >= questions.length ? '查看结果' : '下一题'}
            </Button>
          </div>
        </Card>
      )}
    </div>
  )
}
