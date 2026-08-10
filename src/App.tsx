import { useEffect } from 'react'
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

/** 路由切换后回到顶部 */
function ScrollToTop() {
  const { pathname } = useLocation()
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior })
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
  // 自然大厅是沉浸式场景页，取消主内容区的宽度限制与内边距
  const immersive = pathname === '/hall'

  return (
    <div className="min-h-screen flex flex-col content-layer">
      <ScrollToTop />
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
          <Route path="*" element={<NotFound />} />
        </Routes>
      </main>

      <Footer />
    </div>
  )
}
