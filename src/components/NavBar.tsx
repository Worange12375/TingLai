import { useEffect, useState } from 'react'
import { Link, NavLink, useLocation } from 'react-router-dom'
import { getNickname } from '../lib/storage'

const navItems = [
  { to: '/', label: '首页', end: true },
  { to: '/recognize', label: '识籁' },
  { to: '/learn', label: '听籁' },
  { to: '/hall', label: '自然大厅' },
  { to: '/quiz', label: '识声游戏' },
  { to: '/compose', label: '自然作曲' },
]

/** 队徽：内联 SVG 手绘小鸟 */
function BrandMark() {
  return (
    <span className="grid place-items-center w-10 h-10 rounded-full bg-moss/20 sketch-border shrink-0">
      <svg viewBox="0 0 40 40" className="w-7 h-7" aria-hidden="true">
        <path d="M9 23c-2-4-1-9 3-11 4-2 8-1 10 1l6-2-3 5c2 3 2 7-1 10-4 4-10 4-14 1-.6-.5-1-1.6-1-4z" fill="#4F6B4A" />
        <circle cx="21" cy="17" r="1.4" fill="#FBF7EE" />
        <path d="M28 15l5-2-4 4z" fill="#E8A87C" />
      </svg>
    </span>
  )
}

export default function NavBar() {
  const [open, setOpen] = useState(false)
  const [nick, setNick] = useState(getNickname())
  const location = useLocation()

  // 路由变化时收起移动端菜单 + 同步昵称
  useEffect(() => {
    setOpen(false)
    setNick(getNickname())
  }, [location.pathname])

  // 账号页更新昵称后广播同步
  useEffect(() => {
    const sync = () => setNick(getNickname())
    window.addEventListener('tinglai:profile', sync)
    window.addEventListener('storage', sync)
    return () => {
      window.removeEventListener('tinglai:profile', sync)
      window.removeEventListener('storage', sync)
    }
  }, [])

  const linkCls = ({ isActive }: { isActive: boolean }) =>
    [
      'px-3 py-1.5 rounded-full text-sm font-semibold transition duration-200',
      isActive ? 'bg-moss text-paper-light shadow-soft' : 'text-ink-soft hover:bg-wood-light/50 hover:text-ink',
    ].join(' ')

  return (
    <header className="sticky top-0 z-40">
      <div className="bg-paper-light/85 backdrop-blur-md border-b border-wood/35 shadow-soft">
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between gap-3">
          {/* 品牌 */}
          <Link to="/" className="flex items-center gap-2.5 shrink-0 group">
            <BrandMark />
            <span className="leading-tight">
              <span className="block font-bold text-ink text-[17px] tracking-tight group-hover:text-leaf transition">
                听籁 SoundVerse
              </span>
              <span className="block text-[11px] text-ink-faint tracking-wide">智更鸟队 · 自然之声 AI 识别</span>
            </span>
          </Link>

          {/* 桌面导航 */}
          <nav className="hidden lg:flex items-center gap-1">
            {navItems.map((i) => (
              <NavLink key={i.to} to={i.to} end={i.end} className={linkCls}>
                {i.label}
              </NavLink>
            ))}
          </nav>

          {/* 右侧账号入口 */}
          <div className="flex items-center gap-2">
            <NavLink
              to="/account"
              className={({ isActive }) =>
                [
                  'flex items-center gap-2 rounded-full pl-1.5 pr-3.5 py-1.5 text-sm font-semibold transition sketch-border',
                  isActive ? 'bg-sunset text-ink' : 'bg-paper hover:bg-wood-light/50 text-ink-soft hover:text-ink',
                ].join(' ')
              }
              title="我的账号"
            >
              <span className="grid place-items-center w-7 h-7 rounded-full bg-feather/25 text-[13px] font-bold text-feather-dark">
                {nick ? nick.slice(0, 1) : '客'}
              </span>
              <span className="hidden sm:inline max-w-[86px] truncate">{nick || '登录'}</span>
            </NavLink>

            {/* 移动端菜单按钮 */}
            <button
              className="lg:hidden grid place-items-center w-10 h-10 rounded-full sketch-border bg-paper hover:bg-wood-light/50 transition"
              onClick={() => setOpen((v) => !v)}
              aria-label="展开导航菜单"
              aria-expanded={open}
            >
              <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="#3E342B" strokeWidth="2" strokeLinecap="round">
                {open ? <path d="M6 6l12 12M18 6L6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
              </svg>
            </button>
          </div>
        </div>

        {/* 移动端展开菜单 */}
        {open && (
          <nav className="lg:hidden border-t border-wood/30 bg-paper-light/95 px-4 py-3 flex flex-wrap gap-2 animate-fadeUp">
            {navItems.map((i) => (
              <NavLink key={i.to} to={i.to} end={i.end} className={linkCls}>
                {i.label}
              </NavLink>
            ))}
          </nav>
        )}
      </div>
    </header>
  )
}
