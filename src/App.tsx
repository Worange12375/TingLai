import { useEffect, lazy, Suspense } from 'react'
import { Routes, Route, useLocation, Link } from 'react-router-dom'
import NavBar from './components/NavBar'
import Footer from './components/Footer'
import Home from './pages/Home'
import Recognize from './pages/Recognize'
import Learn from './pages/Learn'
import LearnDetail from './pages/LearnDetail'
import Quiz from './pages/Quiz'
import Compose from './pages/Compose'
import Hall from './pages/Hall'
import Account from './pages/Account'
import { Button } from './components/ui'
import { stopAudio } from './lib/audio'

/**
 * 本地物种数据管理员工具（/dev）。
 *
 * ⚠️ 生产构建时 Vite 会把 import.meta.env.DEV 静态替换为 false，
 *    Rollup 随即把整个三元分支连同这个 dynamic import 一起 DCE 掉，
 *    ——AdminTool 的代码和它的 chunk 都不会出现在 dist 里，公开站点访问 /dev 会落到 404 页。
 *    改这行前请先 `npm run build` 后 grep 一遍产物确认。
 */
const AdminTool = import.meta.env.DEV ? lazy(() => import('./dev/AdminTool')) : null

/** 路由切换后回到顶部 */
function ScrollToTop() {
  const { pathname } = useLocation()
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior })
  }, [pathname])
  return null
}

/** 切场景时停掉后台叫声：用户从「听籁/识籁」切到别的场景，正在播放的物种叫声立刻停，不再干扰下一场景 */
function RouteAudioCleanup() {
  const { pathname } = useLocation()
  useEffect(() => {
    stopAudio()
  }, [pathname])
  return null
}

function NotFound() {
  return (
    <div className="text-center py-24">
      <p className="text-6xl mb-4">🍂</p>
      <h2 className="text-2xl font-bold text-ink">这片林子里没有这个页面</h2>
      <p className="text-ink-soft mt-3">也许它飞去了别处，我们回大厅看看吧。</p>
      <div className="mt-7 flex justify-center gap-3">
        <Link to="/"><Button variant="soft">回首页</Button></Link>
        <Link to="/hall"><Button>去自然大厅</Button></Link>
      </div>
    </div>
  )
}

export default function App() {
  const { pathname } = useLocation()
  // 自然大厅是沉浸式场景页，管理员工具是宽屏双栏；都要取消主内容区的宽度限制
  const immersive = pathname === '/hall' || pathname === '/dev'

  return (
    <div className="min-h-screen flex flex-col content-layer">
      <ScrollToTop />
      <RouteAudioCleanup />
      <NavBar />

      <main className={immersive ? 'flex-1 w-full' : 'flex-1 w-full max-w-6xl mx-auto px-4 py-8 sm:py-10'}>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/recognize" element={<Recognize />} />
          <Route path="/learn" element={<Learn />} />
          <Route path="/learn/:id" element={<LearnDetail />} />
          <Route path="/quiz" element={<Quiz />} />
          <Route path="/compose" element={<Compose />} />
          <Route path="/hall" element={<Hall />} />
          <Route path="/account" element={<Account />} />
          {AdminTool && (
            <Route
              path="/dev"
              element={
                <Suspense fallback={<div className="py-24 text-center text-ink-soft">正在载入管理员工具…</div>}>
                  <AdminTool />
                </Suspense>
              }
            />
          )}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </main>

      <Footer />
    </div>
  )
}
