# 听籁 SoundVerse

> 智更鸟队 · 小有可为 2026 AI 向善创新挑战赛 · 绿色发展赛道 · 自然之声 AI 识别
> 让自然之声被听懂：录一段鸟鸣、蛙声或虫唱，AI 认出它是谁，再讲一个属于它的故事。

## 技术栈

- React 18 + Vite 5 + TypeScript
- React Router 6（`HashRouter`，静态托管零配置、深层链接不 404）
- Tailwind CSS 3（中文绘本风设计系统，见 `tailwind.config.js`）
- 纯前端，无后端；账号态用 localStorage 模拟

## 本地开发

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # 产出 dist/ 静态文件
npm run preview  # 本地预览构建产物
```

Node 使用托管版本：`C:\Users\worange\.workbuddy\binaries\node\versions\22.22.2\node.exe`

## 目录结构

```
src/
├── App.tsx                     # 路由 + 布局（NavBar / Footer 共用）
├── main.tsx                    # HashRouter 挂载
├── index.css                   # Tailwind 基础 + 纸纹肌理 utility
├── types/species.ts            # 【数据契约】Species / RecognitionItem 类型定义
├── data/
│   ├── species.sample.json     # 物种科普库（核心资产，由物种知识官维护）
│   └── species.ts              # 数据访问层：归一化 / 筛选 / 取样
├── components/
│   ├── PlaceholderArt.tsx      # 手绘风美术层（SVG 剪影 / 场景 / 头图 / 图标）
│   ├── SpeciesCard.tsx         # 物种卡片 / 详情面板 / 浮层科普卡
│   ├── NavBar.tsx  Footer.tsx  # 全站导航与页脚
│   └── ui.tsx                  # Card / Button / Badge / Modal / 进度条等原子组件
├── lib/
│   ├── audio.ts                # 播放（含超时兜底）/ 录音（含电平）/ 合成示意音
│   ├── recognize.ts            # 识别编排：远端 API → 本地兜底
│   ├── useCallPlayer.ts        # 叫声播放 hook（播放态 + 友好提示）
│   └── storage.ts              # localStorage：昵称 / 收藏 / 记录 / 战绩
└── pages/                      # Home / Recognize / Learn / LearnDetail / Quiz / Compose / Hall / Account
```

## 数据契约（物种科普卡）

`src/data/species.sample.json` 为数组，单条结构如下（字段名已锁定）：

```json
{
  "id": "oriole",
  "name": "黑枕黄鹂",
  "scientific": "Oriolus chinensis",
  "group": "鸟类",
  "callFeature": "清脆如笛的'咕咕-丽'双音节",
  "habit": "栖息于开阔阔叶林，主食昆虫与果实",
  "distribution": "华东、华南及西南等地",
  "protectLevel": "国家三有保护动物",
  "funFact": "古诗'两个黄鹂鸣翠柳'说的就是它",
  "audioUrl": "https://xeno-canto.org/.../download",
  "image": "/assets/npc-oriole.png"
}
```

- `group` 取值：`鸟类` / `蛙类` / `昆虫`（其它值会归入「其他」）
- **兼容说明**：`src/data/species.ts` 同时兼容早期 snake_case 字段
  （`name_zh` / `name_en` / `taxonomy` / `call_desc` / `habitat` / `protection_level` / `fun_fact` / `audio_ref` / `image_ref`），
  两套命名都能正常渲染，页面层只消费归一化后的 `Species` 类型。
- 页面对缺失字段、图裂、音频失效均有兜底，**任何单条数据异常都不会导致白屏**。

## 插画资源规范（`public/assets/`）

| 命名 | 用途 |
| --- | --- |
| `npc-<物种id>.png` | 动物 NPC / 物种头像，如 `npc-eurasian-tree-sparrow.png` |
| `hall-bg.png` | 自然大厅场景背景 |
| `icon-<功能>.png` | 功能图标，如 `icon-recognize.png` |

**替换方式**：把真图按上表命名放进 `public/assets/` 即可，无需改任何页面代码。

美术兜底为三级：`数据里的 image 路径` → `/assets/npc-<id>.png` → `CSS/SVG 手绘占位（彩色圆形 + 类群剪影 + 物种名首字）`。
未提供真图时界面依然完整可用，占位实现集中在 `src/components/PlaceholderArt.tsx`，后续统一替换只需改这一处。

## 设计系统

中文绘本风（手绘水彩故事书，参考几米 / 熊亮式中国风自然绘本），非儿童卡通贴纸风。

| 语义色 | 色值 | 用途 |
| --- | --- | --- |
| `paper` | `#F5EFE0` | 背景米白 |
| `wood` | `#C8A87C` | 暖木 / 描边 |
| `moss` | `#7C9473` | 苔绿 / 主操作 |
| `sunset` | `#E8A87C` | 夕橘 / 强调 |
| `feather` | `#6CA0C1` | 鸟羽蓝 |
| `blossom` | `#E9C46A` | 花黄 |
| `leaf` | `#4F6B4A` | 叶深绿 |
| `ink` | `#3E342B` | 文字深褐（不用纯黑） |

质感：水彩渐变晕染 + SVG 噪点纸纹（`.paper-texture` / `.watercolor` utility）、柔和投影、大圆角、有机形状。

## 识别链路与降级策略

`src/lib/recognize.ts` 的编排顺序：

1. 若配置了远端识别服务，POST 音频到 BirdNET / ThinkSound 端点，解析 Top-3；
2. 远端未配置 / 超时 / CORS 拦截 / 返回异常 → **自动降级到本地兜底**，
   基于音频字节指纹派生稳定伪随机，从本地物种库取 Top-3 并给出伪置信度；
3. UI 明确标注「本地示例结果」，不冒充真实模型输出。

配置远端服务（可选）：项目根目录新建 `.env.local`

```bash
VITE_BIRDNET_ENDPOINT=https://your-endpoint/analyze
VITE_THINKSOUND_ENDPOINT=
VITE_RECOGNIZE_KEY=your-key
```

同理，物种缺少真实叫声音频时，`playSpeciesCall` 会回落到 WebAudio 合成示意音
（按类群区分音色：鸟=高频滑音颤音 / 蛙=低频脉冲 / 虫=持续振翅音），并在界面提示用户。

## 功能清单

| 页面 | 路由 | 状态 |
| --- | --- | --- |
| 首页 | `/` | ✅ 头图轮播 + 自然大厅 C 位入口 + 功能卡片网格 |
| 识籁 | `/recognize` | ✅ 录音 / 上传 / 拖拽 → Top-3 结果 + 置信度条 |
| 听籁 | `/learn` | ✅ 类群筛选 + 关键词搜索 + 卡片网格 |
| 物种详情 | `/learn/:id` | ✅ 全字段科普 + 播放叫声 + 收藏 + 同类推荐 |
| 自然大厅 | `/hall` | ✅ 场景 + 可点 NPC + 叫声 + 科普卡浮层 |
| 识声 Quiz | `/quiz` | ✅ 5 题听声辨物 + 计分 + 答后科普 |
| 自然作曲 | `/compose` | 🟡 体验版（节拍循环播放），多轨/导出待做 |
| 账号 | `/account` | ✅ 昵称 / 收藏 / 识别记录 / 战绩（localStorage） |

## 部署

```bash
npm run build     # 产出 dist/
```

将 `dist/` 部署到 **CloudStudio（腾讯云 · 国内）**，产出国内可直接访问的链接填入初赛材料。
⚠️ 不使用 Vercel / Netlify（服务器在境外，国内访问不稳定）。

> 构建说明：`vite.config.ts` 中设置了 `build.emptyOutDir = false`，
> 因为部分受控环境禁止删除目录会导致构建中断；产物文件名带 hash，不清空亦不会互相覆盖。

## 合规说明

- 科普文案由团队参考公开资料原创撰写；叫声素材引用公开自然声音库（如 xeno-canto）。
- 识别能力通过调用公开模型 / API 实现，应用架构与交互编排均为团队自研。
- 应用不设服务器、不收集任何个人信息，用户数据仅存于本机 localStorage。
