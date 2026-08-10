import { Routes, Route, Link, NavLink } from 'react-router-dom'
import Home from './pages/Home'
import Recognize from './pages/Recognize'
import Learn from './pages/Learn'
import Quiz from './pages/Quiz'
import Compose from './pages/Compose'
import Hall from './pages/Hall'
import Account from './pages/Account'

const navItems = [
  { to: '/', label: '首页' },
  { to: '/recognize', label: '识籁' },
  { to: '/learn', label: '听籁' },
  { to: '/quiz', label: '识声游戏' },
  { to: '/compose', label: '自然作曲' },
  { to: '/hall', label: '自然大厅' },
  { to: '/account', label: '账号' },
]

export default function App() {
  return (
    <div className="min-h-screen flex flex-col">
      <header className="sticky top-0 z-10 bg-leaf-600 text-white shadow">
        <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between gap-3">
          <Link to="/" className="font-bold text-lg whitespace-nowrap">🐦 听籁 SoundVerse</Link>
          <nav className="flex gap-3 text-sm flex-wrap justify-end">
            {navItems.map((i) => (
              <NavLink
                key={i.to}
                to={i.to}
                end={i.to === '/'}
                className={({ isActive }) =>
                  isActive ? 'underline font-semibold' : 'opacity-80 hover:opacity-100'
                }
              >
                {i.label}
              </NavLink>
            ))}
          </nav>
        </div>
      </header>

      <main className="flex-1 max-w-5xl mx-auto w-full px-4 py-6">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/recognize" element={<Recognize />} />
          <Route path="/learn" element={<Learn />} />
          <Route path="/quiz" element={<Quiz />} />
          <Route path="/compose" element={<Compose />} />
          <Route path="/hall" element={<Hall />} />
          <Route path="/account" element={<Account />} />
        </Routes>
      </main>

      <footer className="text-center text-xs text-leaf-700 py-4">
        智更鸟队 · 小有可为 2026 · 绿色发展・自然之声 AI 识别
      </footer>
    </div>
  )
}
