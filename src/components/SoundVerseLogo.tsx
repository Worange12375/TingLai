/**
 * 听籁 SoundVerse 品牌徽标（矢量 · 用户设计稿转绘）
 *
 * 概念（用户原创）：
 *   小鸟栖于放大镜柄 → AI 识别/观察
 *   三道声波弧从鸟身向外扩散 → 自然之声
 *   合意：听籁 = 用 AI 倾听并识别自然的声音
 *
 * 配色对接站点 token：
 *   鸟背    #8FAEBF  （蓝灰，贴近原稿）
 *   鸟腹    #E8A87C  （橘/蜜桃，tangerine 同系）
 *   放大镜  #7C9473  （moss 主色）
 *   声波外弧 #7C9473 → #D4A76A 渐变（苔绿→蜜桃，呼应原稿双色弧）
 *   描边    #4A5D45  （深墨绿，比 #617658 更沉稳）
 */
export function LogoMark({ className = 'w-7 h-7' }: { className?: string }) {
  return (
    <svg viewBox="0 0 80 80" className={className} role="img" aria-label="听籁 SoundVerse">
      <defs>
        {/* 声波弧渐变：外弧由苔绿过渡到蜜桃 */}
        <linearGradient id="wg" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#7C9473" />
          <stop offset="100%" stopColor="#D4A76A" />
        </linearGradient>
      </defs>

      {/* ════════════════ 三道声波弧（从鸟身向外扩散） ════════════════ */}
      <g fill="none" strokeLinecap="round">
        {/* 外弧 — 最长，带渐变 */}
        <path
          d="M54 14 C72 16 82 36 74 56 C66 73 46 76 30 70"
          stroke="url(#wg)"
          strokeWidth="5.5"
        />
        {/* 中弧 — 苔绿 */}
        <path
          d="M50 22 C64 24 70 38 64 52 C58 63 44 66 34 62"
          stroke="#7C9473"
          strokeWidth="5"
        />
        {/* 内弧 — 蜜桃色 */}
        <path
          d="M46 30 C55 32 58 42 54 50 C50 57 42 58 37 55"
          stroke="#D4A76A"
          strokeWidth="4.5"
        />
      </g>

      {/* ════════════════ 放大镜（鸟站立其上） ════════════════ */}
      <g>
        {/* 镜框圆环 */}
        <circle cx="26" cy="56" r="12" fill="none" stroke="#7C9473" strokeWidth="4.5" />
        {/* 柄（向左下延伸） */}
        <line x1="18" y1="64" x2="6" y2="75" stroke="#7C9473" strokeWidth="5" strokeLinecap="round" />
      </g>

      {/* ════════════════ 小鸟（栖于放大镜上方） ════════════════ */}
      <g>
        {/* 身体主形（蓝灰背 + 腹部留白给橘色层） */}
        <path
          fill="#8FAEBF"
          stroke="#4A5D45"
          strokeWidth="1.8"
          d="
            M14 48
            C10 42 12 33 20 29
            C26 26 33 27 37 31
            L42 26 L38 33
            C40 38 38 44 33 49
            C28 53 19 53 14 48
            Z
          "
        />
        {/* 腹部/胸部（橘蜜桃色） */}
        <path
          fill="#E8A87C"
          d="
            M17 46
            C15 41 18 35 24 33
            C28 32 32 34 34 38
            C32 43 27 48 21 49
            C19 49 17 48 17 46
            Z
          "
        />
        {/* 翅膀（深蓝灰，增加层次） */}
        <path
          fill="#6B8FA3"
          d="M22 36 C28 34 34 36 36 42 C32 44 26 44 22 41 Z"
        />
        {/* 尾羽（向上翘） */}
        <path
          fill="#8FAEBF"
          stroke="#4A5D45"
          strokeWidth="1.5"
          d="M36 34 C40 32 44 34 43 38 C41 37 38 36 36 37 Z"
        />
        {/* 眼睛（深色圆点） */}
        <circle cx="22" cy="34" r="2" fill="#3E342B" />
        {/* 喙（小三角，朝左上） */}
        <path fill="#4A5D45" d="M14 44 L10 42 L15 41 Z" />
      </g>
    </svg>
  )
}

export default LogoMark
