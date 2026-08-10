// 叫声播放 hook：统一管理"播放中 / 提示信息"状态，供大厅、科普卡、Quiz 复用
import { useCallback, useEffect, useRef, useState } from 'react'
import { playSpeciesCall, stopAudio, type PlayHandle } from './audio'
import type { Species } from '../types/species'

export interface CallPlayer {
  /** 当前正在播放的物种 id，未播放为 null */
  playingId: string | null
  /** 友好提示（音频失败 / 已切换合成音），页面应展示 */
  notice: string
  play: (species: Species) => void
  stop: () => void
  clearNotice: () => void
}

export function useCallPlayer(): CallPlayer {
  const [playingId, setPlayingId] = useState<string | null>(null)
  const [notice, setNotice] = useState('')
  const handleRef = useRef<PlayHandle | null>(null)
  const noticeTimer = useRef<number | null>(null)

  const stop = useCallback(() => {
    handleRef.current?.stop()
    handleRef.current = null
    stopAudio()
    setPlayingId(null)
  }, [])

  const showNotice = useCallback((msg: string) => {
    setNotice(msg)
    if (noticeTimer.current) window.clearTimeout(noticeTimer.current)
    noticeTimer.current = window.setTimeout(() => setNotice(''), 4200)
  }, [])

  const play = useCallback(
    (species: Species) => {
      // 再次点击同一物种 = 停止
      if (playingId === species.id) {
        stop()
        return
      }
      stop()
      setPlayingId(species.id)
      handleRef.current = playSpeciesCall({
        audioUrl: species.audioUrl,
        id: species.id,
        group: species.group,
        onEnded: () => setPlayingId((cur) => (cur === species.id ? null : cur)),
        onFallback: showNotice,
      })
    },
    [playingId, stop, showNotice],
  )

  // 卸载时清理，避免离开页面后声音还在响
  useEffect(() => {
    return () => {
      handleRef.current?.stop()
      stopAudio()
      if (noticeTimer.current) window.clearTimeout(noticeTimer.current)
    }
  }, [])

  return { playingId, notice, play, stop, clearNotice: () => setNotice('') }
}
