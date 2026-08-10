/** @type {import('tailwindcss').Config} */
// 听籁 SoundVerse 设计系统 · 中文绘本风（几米 / 熊亮式手绘水彩自然绘本）
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // —— 主色：温暖纸感自然色板 ——
        paper: { DEFAULT: '#F5EFE0', light: '#FBF7EE', dark: '#E9DFC9' }, // 背景米白
        wood: { DEFAULT: '#C8A87C', light: '#DCC5A4', dark: '#A98A61' },  // 暖木
        moss: { DEFAULT: '#7C9473', light: '#9CB093', dark: '#617658' },  // 苔绿
        sunset: { DEFAULT: '#E8A87C', light: '#F2C4A4', dark: '#CE8659' },// 夕橘
        // —— 点缀色 ——
        feather: { DEFAULT: '#6CA0C1', light: '#95BDD6', dark: '#4E809F' },// 鸟羽蓝
        blossom: { DEFAULT: '#E9C46A', light: '#F2D897', dark: '#C9A44B' },// 花黄
        leaf: { DEFAULT: '#4F6B4A', light: '#6B8764', dark: '#3A5136' },   // 叶深绿
        // —— 文字 ——
        ink: { DEFAULT: '#3E342B', soft: '#6B5D4F', faint: '#9A8B7A' },   // 深褐（不用纯黑）
      },
      borderRadius: {
        xl2: '1.25rem',
        '3xl': '1.75rem',
        '4xl': '2.25rem',
        blob: '42% 58% 55% 45% / 48% 42% 58% 52%', // 有机手绘形状
      },
      fontFamily: {
        rounded: [
          'ui-rounded',
          '"Nunito"',
          '"PingFang SC"',
          '"Hiragino Sans GB"',
          '"Microsoft YaHei"',
          'system-ui',
          'sans-serif',
        ],
        serifcn: ['"Songti SC"', '"SimSun"', 'Georgia', 'serif'],
      },
      boxShadow: {
        // 柔和投影，无硬阴影
        soft: '0 6px 20px -6px rgba(62, 52, 43, 0.18)',
        card: '0 10px 30px -12px rgba(62, 52, 43, 0.25)',
        lift: '0 18px 40px -14px rgba(62, 52, 43, 0.32)',
        inset: 'inset 0 1px 0 rgba(255,255,255,0.6)',
      },
      keyframes: {
        fadeUp: {
          '0%': { opacity: '0', transform: 'translateY(14px) scale(0.98)' },
          '100%': { opacity: '1', transform: 'translateY(0) scale(1)' },
        },
        popIn: {
          '0%': { opacity: '0', transform: 'scale(0.9)' },
          '60%': { opacity: '1', transform: 'scale(1.02)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
        sway: {
          '0%,100%': { transform: 'translateY(0) rotate(-1deg)' },
          '50%': { transform: 'translateY(-7px) rotate(1deg)' },
        },
        drift: {
          '0%': { transform: 'translateX(0)' },
          '100%': { transform: 'translateX(28px)' },
        },
        ripple: {
          '0%': { transform: 'scale(0.85)', opacity: '0.55' },
          '100%': { transform: 'scale(1.7)', opacity: '0' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-400px 0' },
          '100%': { backgroundPosition: '400px 0' },
        },
      },
      animation: {
        fadeUp: 'fadeUp .55s cubic-bezier(.22,.9,.34,1) both',
        popIn: 'popIn .35s cubic-bezier(.22,.9,.34,1) both',
        sway: 'sway 5s ease-in-out infinite',
        drift: 'drift 26s ease-in-out infinite alternate',
        ripple: 'ripple 1.6s ease-out infinite',
        shimmer: 'shimmer 1.4s linear infinite',
      },
    },
  },
  plugins: [],
}
