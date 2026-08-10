# 听籁 SoundVerse

> 智更鸟队 · 小有可为 2026 · 绿色发展・自然之声 AI 识别
> 让自然之声被识别、被理解、被谱成曲。

## 技术栈
- React 18 + Vite + TypeScript
- React Router（多页面）
- Tailwind CSS（成熟亲子风主题，见 `tailwind.config.js`）

## 本地开发
```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # 产出 dist/ 静态文件
npm run preview  # 本地预览构建产物
```

## 目录结构
```
src/
├── App.tsx            # 路由 + 整体布局（导航栏 + 页脚）
├── index.css          # Tailwind + 主题
├── data/species.sample.json  # 团队自建物种库（核心资产）
├── lib/
│   ├── audio.ts       # Web Audio 播放/录音
│   └── recognize.ts   # BirdNET/ThinkSound 识别封装
└── pages/             # Home/Recognize/Learn/Quiz/Compose/Hall/Account
```

## 部署（拿"可访问链接"）
`npm run build` 后部署到 CloudStudio（WorkBuddy 内置）/ Vercel / Netlify，
得到 URL 填入初赛材料"应用访问链接"。

## 待实现（MVP 重点）
- 识籁：接入 `lib/recognize.ts`（BirdNET/ThinkSound）
- 听籁：扩充 `species.sample.json`（目标 ≥20 物种）
- 识声游戏 / 自然作曲器 / 自然大厅交互
- ImageGen 生成动物 NPC 与场景插画，替换占位 emoji
