import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { BannerArt, FeatureIcon, HallScene, SpeciesAvatar, type BannerVariant, type IconName } from '../components/PlaceholderArt'
import { Badge, Card, SectionTitle } from '../components/ui'
import { SpeciesName } from '../components/SpeciesName'
import { pickSpecies, speciesList } from '../data/species'

/* --------------------------------- 头图 --------------------------------- */

const banners: { variant: BannerVariant; title: string; sub: string; tag: string }[] = [
  {
    variant: 'dawn',
    title: '听籁 · 让自然之声被听懂',
    sub: '录一段鸟鸣、蛙声或虫唱，AI 认出它是谁，再讲一个属于它的故事',
    tag: 'AI 向善 · 虽小亦有为',
  },
  {
    variant: 'forest',
    title: '听见，才看得见自然',
    sub: '一座可以走进去的声音大厅，点一点，就能听见林间的居民开口说话',
    tag: '小有可为 2026 · 绿色发展赛道',
  },
  {
    variant: 'dusk',
    title: '每一个叫声，都是生命的语言',
    sub: '把听不懂的声音，变成看得懂的知识——这是我们做听籁的理由',
    tag: '智更鸟队 出品',
  },
]

function BannerCarousel() {
  const [idx, setIdx] = useState(0)
  const [paused, setPaused] = useState(false)

  useEffect(() => {
    if (paused) return
    const t = window.setInterval(() => setIdx((i) => (i + 1) % banners.length), 5200)
    return () => window.clearInterval(t)
  }, [paused])

  return (
    <section
      className="relative rounded-4xl overflow-hidden shadow-card sketch-border h-[280px] sm:h-[340px]"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      aria-roledescription="carousel"
      aria-label="听籁宣传头图"
    >
      {banners.map((b, i) => (
        <div
          key={i}
          className={`absolute inset-0 transition-opacity duration-[900ms] ${i === idx ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
          aria-hidden={i !== idx}
        >
          <BannerArt variant={b.variant} />
          <div className="relative h-full flex flex-col justify-center px-7 sm:px-14 max-w-2xl">
            <span className="inline-flex self-start rounded-full bg-paper-light/80 px-3.5 py-1 text-xs font-bold text-ink-soft mb-4 shadow-soft">
              {b.tag}
            </span>
            <h1 className="text-2xl sm:text-4xl font-bold text-ink leading-snug drop-shadow-sm">{b.title}</h1>
            <p className="mt-3.5 text-sm sm:text-base text-ink-soft leading-relaxed max-w-lg">{b.sub}</p>
          </div>
        </div>
      ))}

      {/* 指示点 */}
      <div className="absolute bottom-5 left-7 sm:left-14 flex gap-2.5 z-10">
        {banners.map((_, i) => (
          <button
            key={i}
            onClick={() => setIdx(i)}
            aria-label={`切换到第 ${i + 1} 张头图`}
            aria-current={i === idx}
            className={`h-2.5 rounded-full transition-all duration-300 ${
              i === idx ? 'w-8 bg-ink/70' : 'w-2.5 bg-ink/28 hover:bg-ink/45'
            }`}
          />
        ))}
      </div>
    </section>
  )
}

/* ------------------------------ 自然大厅 C 位 ------------------------------ */

function HallHero() {
  const npcs = pickSpecies(4)
  return (
    <Link
      to="/hall"
      className="group relative block rounded-4xl overflow-hidden shadow-card hover:shadow-lift sketch-border h-[300px] sm:h-[360px] transition duration-500 hover:-translate-y-1"
    >
      <HallScene className="transition-transform duration-700 group-hover:scale-[1.04]" />

      {/* 场景中的小动物预览 */}
      <div className="absolute inset-0 pointer-events-none">
        {npcs.map((s, i) => (
          <div
            key={s.id}
            className="absolute animate-sway"
            style={{
              left: `${16 + i * 21}%`,
              top: `${56 + (i % 2 === 0 ? 0 : 12)}%`,
              animationDelay: `${i * 0.6}s`,
            }}
          >
            <SpeciesAvatar id={s.id} name={s.name} group={s.group} src={s.image} size={i % 2 === 0 ? 58 : 48} />
          </div>
        ))}
      </div>

      {/* 文案 */}
      <div className="relative h-full flex flex-col justify-center px-7 sm:px-14">
        <span className="inline-flex self-start items-center gap-1.5 rounded-full bg-sunset/90 px-3.5 py-1 text-xs font-bold text-ink shadow-soft mb-4">
          ★ 核心体验
        </span>
        <h2 className="text-3xl sm:text-5xl font-bold text-ink leading-tight drop-shadow-sm">
          走进自然大厅
        </h2>
        <p className="mt-3.5 text-sm sm:text-lg text-ink-soft max-w-md leading-relaxed">
          一座画出来的林子。点击林间的小动物，听它开口，读它的故事。
        </p>
        <span className="mt-6 inline-flex self-start items-center gap-2 rounded-full bg-ink px-7 py-3.5 text-paper-light font-bold shadow-lift transition group-hover:gap-3.5 group-hover:bg-leaf">
          立即进入
          <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 12h14M13 6l6 6-6 6" />
          </svg>
        </span>
      </div>
    </Link>
  )
}

/* ------------------------------- 功能卡片 -------------------------------- */

const features: {
  to: string
  icon: IconName
  title: string
  desc: string
  accent: string
  soon?: boolean
}[] = [
  {
    to: '/recognize',
    icon: 'recognize',
    title: '识籁',
    desc: '上传或现场录一段声音，AI 给出 Top-3 候选物种与置信度',
    accent: 'from-moss/25 to-moss/5',
  },
  {
    to: '/learn',
    icon: 'learn',
    title: '听籁',
    desc: '中文原创物种科普库，读懂叫声、习性、分布与保护现状',
    accent: 'from-feather/25 to-feather/5',
  },
  {
    to: '/quiz',
    icon: 'quiz',
    title: '识声 Quiz',
    desc: '听声辨物小游戏，适合亲子一起玩，边听边记住它们',
    accent: 'from-blossom/30 to-blossom/5',
  },
  {
    to: '/compose',
    icon: 'compose',
    title: '自然作曲',
    desc: '把鸟鸣、蛙声、虫唱编排成一段属于你的自然交响',
    accent: 'from-sunset/25 to-sunset/5',
    soon: true,
  },
  {
    to: '/account',
    icon: 'account',
    title: '我的账号',
    desc: '收藏喜欢的物种，回看识别记录与 Quiz 战绩',
    accent: 'from-wood/25 to-wood/5',
  },
]

function FeatureGrid() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
      {features.map((f, i) => (
        <Link key={f.to} to={f.to} className="animate-fadeUp" style={{ animationDelay: `${i * 70}ms` }}>
          <Card hoverable className="h-full p-6 relative overflow-hidden">
            <div className={`absolute inset-0 bg-gradient-to-br ${f.accent} pointer-events-none`} />
            <div className="relative">
              <div className="w-14 h-14 grid place-items-center rounded-2xl bg-paper-light/85 shadow-soft mb-4">
                <FeatureIcon name={f.icon} />
              </div>
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-bold text-ink">{f.title}</h3>
                {f.soon && <Badge tone="sunset">敬请期待</Badge>}
              </div>
              <p className="text-sm text-ink-soft mt-2 leading-relaxed">{f.desc}</p>
              <span className="inline-flex items-center gap-1 text-sm font-semibold text-leaf mt-4">
                进入
                <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
                  <path d="M9 6l6 6-6 6" />
                </svg>
              </span>
            </div>
          </Card>
        </Link>
      ))}
    </div>
  )
}

/* --------------------------------- 页面 --------------------------------- */

export default function Home() {
  const preview = pickSpecies(6)
  const stats = [
    { num: speciesList.length, unit: '种', label: '中文科普卡' },
    { num: 3, unit: '类', label: '鸟 / 蛙 / 昆虫' },
    { num: 'Top-3', unit: '', label: '识别候选结果' },
  ]

  return (
    <div className="space-y-12">
      <BannerCarousel />

      {/* 数据条 */}
      <div className="grid grid-cols-3 gap-3 sm:gap-5">
        {stats.map((s) => (
          <Card key={s.label} className="py-5 px-3 text-center">
            <p className="text-2xl sm:text-3xl font-bold text-leaf">
              {s.num}
              <span className="text-base ml-0.5">{s.unit}</span>
            </p>
            <p className="text-xs sm:text-sm text-ink-soft mt-1.5">{s.label}</p>
          </Card>
        ))}
      </div>

      {/* C 位：自然大厅 */}
      <section>
        <HallHero />
      </section>

      {/* 功能入口 */}
      <section>
        <SectionTitle title="你可以这样玩" sub="从识别一段声音开始，到读懂一个物种" />
        <FeatureGrid />
      </section>

      {/* 物种预览 */}
      {preview.length > 0 && (
        <section>
          <SectionTitle
            title="林中住客"
            sub="听籁科普库里的部分成员"
            right={
              <Link to="/learn" className="text-sm font-semibold text-leaf hover:underline shrink-0">
                查看全部 →
              </Link>
            }
          />
          <div className="flex gap-4 overflow-x-auto pb-3 no-scrollbar">
            {preview.map((s) => (
              <Link key={s.id} to={`/learn/${s.id}`} className="shrink-0 w-[132px] text-center group">
                <div className="grid place-items-center">
                  <SpeciesAvatar
                    id={s.id}
                    name={s.name}
                    group={s.group}
                    src={s.image}
                    size={96}
                    className="transition duration-300 group-hover:scale-105 group-hover:shadow-lift"
                  />
                </div>
                <p className="mt-2.5 text-sm font-semibold text-ink">
                  <SpeciesName species={s} stacked />
                </p>
                <p className="text-xs text-ink-faint truncate">{s.group}</p>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* 项目理念 */}
      <Card className="p-7 sm:p-10 text-center">
        <p className="text-sm font-bold text-sunset-dark tracking-widest">OUR MISSION</p>
        <h3 className="text-xl sm:text-2xl font-bold text-ink mt-3 leading-relaxed">
          城市里的孩子，认得出一百个卡通角色，
          <br className="hidden sm:block" />
          却叫不出窗外那只鸟的名字。
        </h3>
        <p className="text-ink-soft mt-4 max-w-2xl mx-auto leading-relaxed">
          听籁想做的很简单：让「听见」变成「认识」，让「认识」变成「在意」。
          保护自然的第一步，是先知道它们是谁。
        </p>
      </Card>
    </div>
  )
}
