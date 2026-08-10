import { Link } from 'react-router-dom'

// 首页功能模块（对应设计构想：导航栏 + 头图 + 自然大厅 C 位 + 各功能入口）
const modules = [
  { to: '/recognize', icon: '🔍', title: '识籁', desc: '上传或录制自然声音，AI 识别是什么鸟 / 虫 / 蛙' },
  { to: '/learn', icon: '📖', title: '听籁', desc: '浏览物种知识库，读懂自然之声' },
  { to: '/quiz', icon: '🎮', title: '识声游戏', desc: '听声选物，边玩边学' },
  { to: '/compose', icon: '🎵', title: '自然作曲', desc: '用动物叫声编排你的自然交响' },
  { to: '/account', icon: '👤', title: '账号', desc: '我的收藏与记录' },
]

// 头图轮播内容（MVP 用静态多帧切换即可）
const banners = [
  { title: '听籁 · 让自然之声被听懂', sub: 'AI 向善 · 虽小亦有为' },
  { title: '听见，才看得见自然', sub: '小有可为 2026 · 绿色发展赛道' },
  { title: '每一个叫声，都是生命的语言', sub: '智更鸟队 出品' },
]

export default function Home() {
  return (
    <div className="space-y-6">
      {/* 宣传信息轮播（头图） */}
      <section className="rounded-xl2 bg-gradient-to-r from-leaf-500 to-leaf-700 text-white p-6 shadow">
        {banners.map((b, i) => (
          <div key={i} className={i === 0 ? 'block' : 'hidden'}>
            <h1 className="text-2xl font-bold">{b.title}</h1>
            <p className="mt-2 opacity-90">{b.sub}</p>
          </div>
        ))}
        <p className="mt-3 text-xs opacity-70">（轮播交互待接入，当前展示首帧）</p>
      </section>

      {/* 自然大厅入口（C 位醒目大卡片） */}
      <Link
        to="/hall"
        className="block rounded-xl2 bg-leaf-100 border-2 border-leaf-300 p-8 text-center shadow hover:bg-leaf-200 transition"
      >
        <div className="text-5xl">🌳</div>
        <div className="text-xl font-bold text-leaf-800 mt-2">进入自然大厅</div>
        <div className="text-sm text-leaf-700 mt-1">
          探索可互动的自然场景，点击动物聆听它们的声音
        </div>
      </Link>

      {/* 功能模块网格 */}
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {modules.map((m) => (
          <Link
            key={m.to}
            to={m.to}
            className="rounded-xl2 bg-white border border-leaf-200 p-4 shadow-sm hover:shadow-md transition"
          >
            <div className="text-3xl">{m.icon}</div>
            <div className="font-semibold text-leaf-800 mt-2">{m.title}</div>
            <div className="text-sm text-leaf-700 mt-1">{m.desc}</div>
          </Link>
        ))}
      </section>
    </div>
  )
}
