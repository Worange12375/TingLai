/**
 * 听籁 SoundVerse 品牌徽标（矢量 · 用户设计稿转绘 + 小鸟造型精修）
 *
 * 概念（用户原创）：
 *   小鸟栖于放大镜柄 → AI 识别/观察
 *   三道声波弧从鸟身向外扩散 → 自然之声
 *   合意：听籁 = 用 AI 倾听并识别自然的声音
 *
 * 本次精修（绘本风 · 圆润可爱）：
 *   - 圆胖蛋形身体 + 大圆眼带高光 + 短圆喙
 *   - 翅膀分层羽毛纹、双片流畅尾羽
 *   - 头顶两缕冠羽（灵动，呼应大厅"戴胜"）
 *   - 腮红增加亲和度
 *
 * 配色对接站点 token：
 *   鸟背    #8FAEBF  （蓝灰，贴近原稿）
 *   鸟腹    #E8A87C  （橘/蜜桃，tangerine 同系）
 *   翅膀    #6B8FA3 / 羽纹 #5A7D90
 *   放大镜  #7C9473  （moss 主色）
 *   声波外弧 #7C9473 → #D4A76A 渐变（苔绿→蜜桃，呼应原稿双色弧）
 *   描边    #4A5D45  （深墨绿，比 #617658 更沉稳）
 */
export function LogoMark({ className = 'w-7 h-7' }: { className?: string }) {
  return (
    <svg viewBox="0 0 84 80" className={className} role="img" aria-label="听籁 SoundVerse">
      <defs>
        {/* 声波弧渐变：外弧由苔绿过渡到蜜桃 */}
        <linearGradient id="wg" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#7C9473" />
          <stop offset="100%" stopColor="#D4A76A" />
        </linearGradient>
      </defs>

      {/* ════════════════ 三道声波弧（从鸟身向右上扩散） ════════════════ */}
      <g fill="none" strokeLinecap="round">
        {/* 外弧 — 最长，带渐变 */}
        <path d="M54 10 C70 12 78 28 74 48 C70 66 54 74 38 72" stroke="url(#wg)" strokeWidth="6" />
        {/* 中弧 — 苔绿 */}
        <path d="M50 18 C64 20 71 33 67 49 C63 63 50 69 36 67" stroke="#7C9473" strokeWidth="5.5" />
        {/* 内弧 — 蜜桃色 */}
        <path d="M46 26 C57 28 62 38 59 49 C56 59 46 63 35 61" stroke="#D4A76A" strokeWidth="5" />
      </g>

      {/* ════════════════ 放大镜（鸟站立其上的「观察/识别」基座） ════════════════ */}
      <g>
        {/* 镜框圆环 */}
        <circle cx="26" cy="61" r="11" fill="none" stroke="#7C9473" strokeWidth="4.5" />
        {/* 柄（向左下延伸） */}
        <line x1="18" y1="69" x2="7" y2="79" stroke="#7C9473" strokeWidth="5" strokeLinecap="round" />
      </g>

      {/* ════════════════ 小鸟（圆润绘本风 · 朝右上鸣唱） ════════════════ */}
      <g>
        {/* 冠羽（头顶两缕呆毛，灵动 + 呼应戴胜） */}
        <g fill="none" stroke="#4A5D45" strokeWidth="1.6" strokeLinecap="round">
          <path d="M30 22 C29 18 30 15 32 13" />
          <path d="M33 22 C33 18 35 16 37 14" />
        </g>

        {/* 身体主形（蓝灰背） */}
        <path
          fill="#8FAEBF"
          stroke="#4A5D45"
          strokeWidth="1.8"
          d="
            M25 47
            C17 46 14 39 17 32
            C19 26 25 21 32 22
            C37 23 41 26 43 30
            L50 31 L43 34
            C42 38 39 42 33 45
            C30 46.5 27 47 25 47
            Z
          "
        />

        {/* 腹部（蜜桃色） */}
        <path
          fill="#E8A87C"
          d="
            M24 46
            C19 45 17 40 19 35
            C21 31 26 29 31 31
            C34 33 34 39 29 43
            C27 45 25 46 24 46
            Z
          "
        />

        {/* 翅膀（深蓝灰 + 羽毛纹） */}
        <path fill="#6B8FA3" d="M20 34 C27 31 35 33 40 40 C34 43 26 42 20 39 Z" />
        <g fill="none" stroke="#5A7D90" strokeWidth="1.2" strokeLinecap="round">
          <path d="M23 36 C28 35 33 37 37 41" />
          <path d="M22 39 C27 38 31 40 35 43" />
        </g>

        {/* 尾羽（两片，向左下流畅展开） */}
        <g fill="#8FAEBF" stroke="#4A5D45" strokeWidth="1.4">
          <path d="M18 41 C12 42 7 45 5 50 C9 49 13 48 17 46 Z" />
          <path d="M20 44 C15 46 11 50 10 55 C14 53 18 51 21 48 Z" />
        </g>

        {/* 喙（蜜桃色覆盖，避免蓝灰填充） */}
        <path fill="#E8A87C" stroke="#4A5D45" strokeWidth="1.2" d="M42 30 L50 31.5 L42 34 Z" />

        {/* 眼睛（深色 + 高光） */}
        <circle cx="37" cy="29" r="2.6" fill="#2E2620" />
        <circle cx="37.9" cy="28.2" r="0.9" fill="#FBF7EE" />

        {/* 腮红（可爱感） */}
        <circle cx="33" cy="34" r="2.4" fill="#E8A87C" opacity="0.4" />

        {/* 脚（搭在放大镜环顶） */}
        <g stroke="#4A5D45" strokeWidth="2" strokeLinecap="round">
          <line x1="24" y1="47" x2="24" y2="50" />
          <line x1="28" y1="47" x2="28" y2="50" />
        </g>
      </g>
    </svg>
  )
}

export default LogoMark
