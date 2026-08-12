// 自然作曲器（体验版）：选择若干物种 → 按节奏依次播放它们的叫声，编成一小段"自然交响"
// 完整版（多轨叠加 / 导出音频 / AI 编曲）为赛后规划，此处标注"敬请期待"。
import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Badge, Button, Card, DevBanner, EmptyState, SectionTitle } from '../components/ui'
import { SpeciesAvatar, SoundWave } from '../components/PlaceholderArt'
import { playSynthCall, stopAudio, type PlayHandle } from '../lib/audio'
import { speciesList } from '../data/species'

const MAX_TRACKS = 6

export default function Compose() {
  const [track, setTrack] = useState<string[]>([])
  const [playing, setPlaying] = useState(false)
  const [cursor, setCursor] = useState(-1)
  const [tempo, setTempo] = useState(700) // 每步毫秒
  const timerRef = useRef<number | null>(null)
  const handleRef = useRef<PlayHandle | null>(null)

  const stopAll = () => {
    if (timerRef.current) {
      window.clearInterval(timerRef.current)
      timerRef.current = null
    }
    handleRef.current?.stop()
    handleRef.current = null
    stopAudio()
    setPlaying(false)
    setCursor(-1)
  }

  useEffect(() => stopAll, [])

  const toggleSpecies = (id: string) => {
    stopAll()
    setTrack((t) => {
      if (t.includes(id)) return t.filter((x) => x !== id)
      if (t.length >= MAX_TRACKS) return t
      return [...t, id]
    })
  }

  const playTrack = () => {
    if (track.length === 0) return
    stopAll()
    setPlaying(true)
    let step = 0
    const fire = () => {
      const id = track[step % track.length]
      const sp = speciesList.find((s) => s.id === id)
      setCursor(step % track.length)
      if (sp) {
        handleRef.current?.stop()
        // 统一用合成音，保证节奏可控、无网络依赖
        handleRef.current = playSynthCall(sp.id, sp.group)
      }
      step++
      if (step >= track.length * 2) {
        window.setTimeout(stopAll, tempo)
        if (timerRef.current) {
          window.clearInterval(timerRef.current)
          timerRef.current = null
        }
      }
    }
    fire()
    timerRef.current = window.setInterval(fire, tempo)
  }

  if (speciesList.length === 0) {
    return (
      <Card>
        <EmptyState
          title="作曲器还没有素材"
          desc="需要先有物种叫声素材才能编曲，科普库正在录入中。"
          action={<Link to="/learn"><Button>去物种库看看</Button></Link>}
        />
      </Card>
    )
  }

  return (
    <div className="space-y-7">
      <div>
        <SectionTitle
          title="自然作曲器"
          sub="把鸟鸣、蛙声与虫唱排进节拍，编一段属于你的自然交响"
        />
        <div className="flex gap-2 flex-wrap">
          <Badge tone="sunset">体验版</Badge>
          <Badge tone="wood">多轨叠加 / 导出音频 · 敬请期待</Badge>
        </div>
        <DevBanner title="自然作曲器为体验版">
          为保证在任何网络环境下都能演示，当前用合成示意音按节拍循环播放两轮。
          真实录音切片、多轨同时发声、导出音频与 AI 自动编曲为赛后规划，正在开发中。
        </DevBanner>
      </div>

      {/* 编排区 */}
      <Card className="p-6">
        <p className="text-sm font-bold text-ink mb-3">我的音轨（{track.length}/{MAX_TRACKS}）</p>

        {track.length === 0 ? (
          <div className="rounded-3xl border-2 border-dashed border-wood/55 bg-wood-light/15 py-10 text-center">
            <p className="text-3xl mb-2">🎼</p>
            <p className="text-sm text-ink-soft">从下面的素材库里点选动物，把它们排进音轨</p>
          </div>
        ) : (
          <div className="flex gap-3 overflow-x-auto pb-2 no-scrollbar">
            {track.map((id, i) => {
              const sp = speciesList.find((s) => s.id === id)
              if (!sp) return null
              const active = cursor === i
              return (
                <div
                  key={`${id}-${i}`}
                  className={`shrink-0 w-[104px] rounded-3xl p-3 text-center sketch-border transition duration-200 ${
                    active ? 'bg-sunset/35 scale-105 shadow-lift' : 'bg-paper-light/70'
                  }`}
                >
                  <div className="grid place-items-center">
                    <SpeciesAvatar id={sp.id} name={sp.name} group={sp.group} src={sp.image} size={56} />
                  </div>
                  <p className="text-xs font-semibold text-ink mt-2 truncate">{sp.name}</p>
                  <button
                    onClick={() => toggleSpecies(id)}
                    className="text-[11px] text-ink-faint hover:text-sunset-dark mt-1 transition"
                  >
                    移出
                  </button>
                </div>
              )
            })}
          </div>
        )}

        {/* 控制条 */}
        <div className="flex flex-wrap items-center gap-4 mt-6 pt-5 border-t border-wood/25">
          <Button onClick={playing ? stopAll : playTrack} disabled={track.length === 0}>
            {playing ? (
              <>
                <SoundWave active className="w-5 text-paper-light" />
                停止
              </>
            ) : (
              <>
                <svg viewBox="0 0 24 24" className="w-4 h-4" fill="currentColor" aria-hidden="true">
                  <path d="M8 5.5v13a1 1 0 001.54.84l10-6.5a1 1 0 000-1.68l-10-6.5A1 1 0 008 5.5z" />
                </svg>
                播放我的曲子
              </>
            )}
          </Button>

          <label className="flex items-center gap-3 text-sm text-ink-soft">
            节奏
            <input
              type="range"
              min={320}
              max={1200}
              step={40}
              value={1520 - tempo}
              onChange={(e) => {
                stopAll()
                setTempo(1520 - Number(e.target.value))
              }}
              className="w-36 accent-moss"
              aria-label="调整节奏快慢"
            />
            <span className="tabular-nums text-xs text-ink-faint w-16">{(60000 / tempo).toFixed(0)} BPM</span>
          </label>

          {track.length > 0 && (
            <Button variant="ghost" size="sm" onClick={() => { stopAll(); setTrack([]) }}>
              清空
            </Button>
          )}
        </div>

        <p className="text-xs text-ink-faint mt-4 leading-relaxed">
          体验版使用 Web Audio 合成的示意音按节拍循环播放两轮，便于在任何网络环境下演示。
          正式版计划接入真实录音切片、多轨叠加与 AI 编曲。
        </p>
      </Card>

      {/* 素材库 */}
      <section>
        <h2 className="text-lg font-bold text-ink mb-4 flex items-center gap-2">
          <span className="inline-block w-2 h-5 rounded-full bg-feather" />
          声音素材库
        </h2>
        <div className="grid grid-cols-3 sm:grid-cols-5 lg:grid-cols-7 gap-3">
          {speciesList.map((s) => {
            const selected = track.includes(s.id)
            return (
              <button
                key={s.id}
                onClick={() => toggleSpecies(s.id)}
                className={`rounded-2xl p-2.5 text-center sketch-border transition duration-200 hover:-translate-y-0.5 ${
                  selected ? 'bg-moss/30 ring-2 ring-moss' : 'bg-paper-light/65 hover:bg-wood-light/40'
                }`}
                aria-pressed={selected}
              >
                <div className="grid place-items-center">
                  <SpeciesAvatar id={s.id} name={s.name} group={s.group} src={s.image} size={44} />
                </div>
                <p className="text-[11px] font-semibold text-ink mt-1.5 truncate">{s.name}</p>
              </button>
            )
          })}
        </div>
      </section>
    </div>
  )
}
