// 智更鸟队 · 团队介绍页
import { Link } from 'react-router-dom'
import { Badge, Button, Card, SectionTitle } from '../components/ui'

interface Member {
  name: string
  role: string
  school: string
  grade: string
  lead?: boolean
}

const MEMBERS: Member[] = [
  { name: '吴天成', role: '队长', school: '清华大学笃实书院', grade: '2024 级本科生' },
  { name: '许瀚元', role: '队员', school: '清华大学笃实书院', grade: '2025 级本科生' },
  { name: '李博', role: '队员', school: '清华大学笃实书院', grade: '2025 级本科生' },
  { name: '龚伯熙', role: '队员', school: '清华大学笃实书院', grade: '2025 级本科生' },
]

export default function Team() {
  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between gap-4">
        <SectionTitle title="智更鸟队" sub="小有可为 2026 · 绿色发展 · 自然之声 AI 识别赛道" />
        <Link to="/" className="shrink-0">
          <Button variant="soft" size="sm">
            ← 返回首页
          </Button>
        </Link>
      </div>

      {/* 团队简介 */}
      <Card className="p-7 sm:p-10">
        <div className="flex items-center gap-3 mb-4">
          <span className="w-12 h-12 grid place-items-center rounded-full bg-moss/20 sketch-border text-2xl" aria-hidden="true">
            🐦
          </span>
          <div>
            <p className="font-bold text-ink text-lg">听籁 SoundVerse</p>
            <p className="text-xs text-ink-faint">让每一段自然之声都被听懂</p>
          </div>
        </div>
        <p className="text-ink-soft leading-relaxed">
          我们是一支来自清华大学笃实书院的小队。我们在城市里长大，却常常叫不出窗外那只鸟的名字——
          于是想做点什么：用 AI 把「听见」变成「认识」，把「认识」变成「在意」。
        </p>
        <p className="text-ink-soft leading-relaxed mt-3">
          听籁是一款面向自然教育的声音识别小工具：录一段鸟鸣、蛙声或虫唱，AI 帮你认出它是谁，
          再用一张中文科普卡讲清它的故事。我们相信，保护自然的第一步，是先知道它们是谁。
        </p>
        <div className="flex flex-wrap gap-2 mt-5">
          <Badge tone="moss">小有可为 2026</Badge>
          <Badge tone="feather">绿色发展赛道</Badge>
          <Badge tone="blossom">AI 向善创新挑战赛</Badge>
        </div>
      </Card>

      {/* 成员 */}
      <section>
        <h2 className="text-lg font-bold text-ink mb-4 flex items-center gap-2">
          <span className="inline-block w-2 h-5 rounded-full bg-sunset" />
          团队成员
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {MEMBERS.map((m) => (
            <Card key={m.name} className={`p-5 text-center ${m.lead ? 'ring-2 ring-moss/40' : ''}`} hoverable>
              <div className="mx-auto w-16 h-16 grid place-items-center rounded-full bg-paper-light shadow-soft text-2xl">
                {m.lead ? '🦉' : '🦜'}
              </div>
              <p className="font-bold text-ink text-lg mt-3">{m.name}</p>
              <p className="mt-1">
                <Badge tone={m.lead ? 'moss' : 'wood'}>{m.role}</Badge>
              </p>
              <p className="text-sm text-ink-soft mt-3 leading-relaxed">{m.school}</p>
              <p className="text-xs text-ink-faint mt-0.5">{m.grade}</p>
            </Card>
          ))}
        </div>
      </section>

      <div className="flex justify-center pt-2">
        <Link to="/recognize">
          <Button>去体验识籁 →</Button>
        </Link>
      </div>
    </div>
  )
}
