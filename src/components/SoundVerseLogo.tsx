/**
 * 听籁 SoundVerse 品牌徽标（矢量）
 * 概念：鸟鸣化耳（负空间双关）
 *  - 左侧为鸣禽（苔绿填充），喙朝右上张开
 *  - 喙喷出的三道声波弧线向右卷曲，其负空间自然围成「耳朵」轮廓
 *  - 鸟在歌唱 → 声音化为耳朵，呼应「听籁 = 听自然之声」
 * 限色：苔绿 #7C9473 / 深苔绿 #617658 / 橘色点睛 #E8A87C；扁平、可任意缩放。
 */
export function LogoMark({ className = 'w-7 h-7' }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} role="img" aria-label="听籁 SoundVerse">
      {/* 鸣禽主体（苔绿填充） */}
      <path
        fill="#7C9473"
        d="M16 41 C11 34 13 25 22 22 C27 20 32 21 34 25 L41 19 L36 27 C37 31 35 36 30 40 C25 43 19 44 16 41 Z"
      />
      {/* 翅膀（深苔绿细弧，增加层次，仍属同一概念） */}
      <path
        fill="none"
        stroke="#617658"
        strokeWidth="2"
        strokeLinecap="round"
        d="M21 31 C25 29 30 30 32 35"
      />
      {/* 眼睛（橘色点睛） */}
      <circle cx="28" cy="27" r="1.8" fill="#E8A87C" />
      {/* 声波 = 耳朵（负空间双关）：三道弧线从喙喷出，卷成耳朵轮廓 */}
      <g fill="none" stroke="#7C9473" strokeWidth="3" strokeLinecap="round">
        <path d="M41 22 C53 19 59 31 54 43 C50 52 43 53 39 50" />
        <path d="M45 26 C53 24 56 32 52 41 C49 47 45 48 42 46" />
        <path d="M48 30 C52 31 53 36 50 39 C48 41 46 40 46 38" />
      </g>
    </svg>
  )
}

export default LogoMark
