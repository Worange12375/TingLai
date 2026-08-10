// localStorage 轻封装：账号（昵称）/ 收藏 / 识别记录 / Quiz 战绩
// 纯前端模拟，无后端。所有读写都做 try-catch，隐私模式下不会崩。

const KEY = {
  nickname: 'tinglai:nickname',
  favorites: 'tinglai:favorites',
  history: 'tinglai:history',
  quiz: 'tinglai:quizStats',
} as const

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}

function write(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value))
    window.dispatchEvent(new CustomEvent('tinglai:profile'))
  } catch {
    /* 隐私模式 / 配额满：静默降级 */
  }
}

/* --------------------------------- 昵称 --------------------------------- */

export function getNickname(): string {
  return read<string>(KEY.nickname, '')
}
export function setNickname(name: string): void {
  write(KEY.nickname, name.trim().slice(0, 12))
}

/* --------------------------------- 收藏 --------------------------------- */

export function getFavorites(): string[] {
  return read<string[]>(KEY.favorites, [])
}
export function isFavorite(id: string): boolean {
  return getFavorites().includes(id)
}
export function toggleFavorite(id: string): boolean {
  const list = getFavorites()
  const idx = list.indexOf(id)
  if (idx >= 0) list.splice(idx, 1)
  else list.unshift(id)
  write(KEY.favorites, list.slice(0, 200))
  return idx < 0
}

/* ------------------------------- 识别记录 ------------------------------- */

export interface HistoryItem {
  speciesId: string
  speciesName: string
  confidence: number
  at: number
  source: string
}

export function getHistory(): HistoryItem[] {
  return read<HistoryItem[]>(KEY.history, [])
}
export function addHistory(item: HistoryItem): void {
  const list = getHistory()
  list.unshift(item)
  write(KEY.history, list.slice(0, 60))
}
export function clearHistory(): void {
  write(KEY.history, [])
}

/* ------------------------------ Quiz 战绩 ------------------------------ */

export interface QuizStats {
  played: number
  correct: number
  best: number
}

export function getQuizStats(): QuizStats {
  return read<QuizStats>(KEY.quiz, { played: 0, correct: 0, best: 0 })
}
export function recordQuiz(correct: number, total: number): void {
  const s = getQuizStats()
  write(KEY.quiz, {
    played: s.played + total,
    correct: s.correct + correct,
    best: Math.max(s.best, correct),
  })
}
export function resetAll(): void {
  try {
    Object.values(KEY).forEach((k) => localStorage.removeItem(k))
    window.dispatchEvent(new CustomEvent('tinglai:profile'))
  } catch {
    /* ignore */
  }
}
