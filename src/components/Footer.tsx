import { Link } from 'react-router-dom'

export default function Footer() {
  return (
    <footer className="mt-14 border-t border-wood/35 bg-paper-light/60">
      <div className="max-w-6xl mx-auto px-4 py-9">
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-7">
          <div className="max-w-sm">
            <p className="font-bold text-ink text-[15px]">听籁 SoundVerse</p>
            <p className="text-sm text-ink-soft mt-2 leading-relaxed">
              让每一段自然之声都被听懂。录一段鸟鸣、蛙声或虫唱，AI 帮你认出它是谁，
              再用一张中文科普卡讲清它的故事。
            </p>
          </div>

          <div className="flex gap-10 text-sm">
            <div>
              <p className="font-semibold text-ink mb-2.5">功能</p>
              <ul className="space-y-1.5 text-ink-soft">
                <li><Link to="/recognize" className="hover:text-leaf transition">识籁 · 声音识别</Link></li>
                <li><Link to="/learn" className="hover:text-leaf transition">听籁 · 物种科普</Link></li>
                <li><Link to="/hall" className="hover:text-leaf transition">自然大厅</Link></li>
                <li><Link to="/quiz" className="hover:text-leaf transition">识声游戏</Link></li>
              </ul>
            </div>
            <div>
              <p className="font-semibold text-ink mb-2.5">关于</p>
              <ul className="space-y-1.5 text-ink-soft">
                <li>智更鸟队</li>
                <li>小有可为 2026</li>
                <li>绿色发展赛道</li>
                <li>AI 向善创新挑战赛</li>
              </ul>
            </div>
          </div>
        </div>

        <div className="mt-8 pt-5 border-t border-wood/25 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-ink-faint">
          <p>© 2026 智更鸟队 · 听籁 SoundVerse · 自然之声 AI 识别</p>
          <p>叫声音频来源：iNaturalist（21 条）、xeno-canto（1 条），遵循 CC 系列授权（CC0 / CC BY / CC BY-NC / CC BY-NC-SA），仅用于非商业科普演示</p>
        </div>
      </div>
    </footer>
  )
}
