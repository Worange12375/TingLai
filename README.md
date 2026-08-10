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

## 目录结构

```
src/
├── App.tsx                     # 路由 + 布局（NavBar / Footer 共用）
├── main.tsx                    # HashRouter 挂载
├── index.css                   # Tailwind 基础 + 纸纹肌理 utility
├── types/species.ts            # 【数据契约】Species / RecognitionItem 类型定义
├── data/
│   ├── species.sample.json     # 物种科普库（核心资产，由团队维护）
│   ├── recognition-map.json    # BirdNET 学名 → 本站 speciesId 映射（含同物异名容错）
│   ├── ADMIN_SCHEMA.md         # 【数据契约】字段规则 / 校验清单 / 联动改名流程
│   └── species.ts              # 数据访问层：归一化 / 筛选 / 取样
├── dev/                        # 本地管理员工具（仅 DEV，见下文），生产包不含
│   ├── AdminTool.tsx           # /dev 页面：列表 + 详情编辑 + 批量 + diff 预览
│   └── adminApi.ts             # /__admin/* 接口封装
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

server/                         # BirdNET 识别服务（Python，独立部署，见 server/README.md）
├── recognize_service.py        # FastAPI：POST /api/recognize、GET /healthz
├── birdnet_engine.py           # birdnetlib 引擎层（HTTP 与 MCP 共用）
├── mcp_server.py               # MCP 包装：把识别能力暴露成 Agent 可调工具
└── Dockerfile / docker-compose.yml / requirements.txt

vite-plugin-admin.ts            # 管理员工具的 Node 侧后端（apply:'serve'，仅开发服务器）
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
  "audioSource": "xeno-canto XC777570（录制者：何文进，2023-01-28，陕西汉中洋县）",
  "audioLicense": "CC BY-NC",
  "image": "/assets/npc-oriole.webp"
}
```

> **完整规则以 `src/data/ADMIN_SCHEMA.md` 为准**（13 字段定义、长度区间、保护级别正则、
> 署名四要素、联动改名流程、校验清单）。`/dev` 管理员工具的校验器即按该文档实现。

- `group` 取值：`鸟类` / `蛙类` / `昆虫`（数据层出现「其他」即视为脏数据，仅运行时兜底可用）
- `audioSource` / `audioLicense` 为**逐条**版权署名，是合规使用 CC 素材的法律依据，不得留空或批量覆盖
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

`src/lib/recognize.ts` 的编排顺序（三级，逐级降级、绝不冒充）：

1. **远端命中且已收录** → POST 音频到自建 BirdNET 服务 `/api/recognize`，
   拿回 `scientificName` 后查 `src/data/recognition-map.json` 映射到本站 `speciesId`，展示完整科普卡；
2. **远端命中但未收录** → 提示「识别到 *&lt;拉丁名&gt;*，本站尚无该物种科普卡」，
   **不静默回退成随机卡片**（BirdNET 认得 6522 类，我们只收录了 22 种）；
3. **远端未配置 / 超时 / 不可达 / 音频属蛙类昆虫** → 降级到本地声纹粗匹配，
   基于音频字节指纹派生稳定伪随机取 Top-3，UI 明确标注「本地示例结果」。

> 为什么蛙和虫走不了 BirdNET：该模型的非鸟类别全是北美物种，没有任何中国产蛙类或蝉/蟋蟀/螽斯。
> 我们**刻意不用北美近缘种做代理映射**——那等于伪造识别结果。详见 `src/data/ADMIN_SCHEMA.md` §6.3。

配置远端服务（可选）：项目根目录新建 `.env.local`

```bash
# 识别服务地址；留空则走同源相对路径（生产环境由 nginx 反代 /api/recognize）
VITE_RECOGNIZE_API=http://localhost:8000
```

识别服务本身在 `server/`（FastAPI + birdnetlib，含 Dockerfile 与 MCP 包装），
起法与 nginx 反代配置见 `server/README.md`。

同理，物种缺少真实叫声音频时，`playSpeciesCall` 会回落到 WebAudio 合成示意音
（按类群区分音色：鸟=高频滑音颤音 / 蛙=低频脉冲 / 虫=持续振翅音），并在界面提示用户。

## 本地管理员工具（`/dev`，仅开发环境）

维护 22 条物种科普卡的内部工具，**不进生产包**：`src/App.tsx` 用 `import.meta.env.DEV`
做三元门禁，生产构建时 Rollup 会把整个分支连同 chunk 一起 DCE 掉，公开站点访问 `/dev` 落到 404 页。

```bash
npm run dev
# 打开 http://localhost:5173/#/dev
```

| 能力 | 说明 |
| --- | --- |
| 列表 / 筛选 | 搜索名称·学名·id，按类群过滤，「只看有错」快速定位问题条目 |
| 试听 + 下载 | 直接播放当前 `audioUrl`；远端音频由 Node 代理下载，绕开跨域 |
| 上传修正音频 | 文件名随便取，自动改名为 `<speciesId>.mp3` 落到 `public/audio/` 并同步 `audioUrl` |
| 批量规范化 | ffmpeg 响度归一（EBU R128）+ 120Hz 高通 + 首尾静音裁剪 |
| 批量改字段 / 按源重抓 | 多选后批量改 group·protectLevel·distribution；或从原始外链重新抓取音频 |
| id 联动改名 | 同时改 JSON 的 id、`image`、插画文件名、本地音频文件名、映射表指向，先预览再执行 |
| 数据体检 | 按 `ADMIN_SCHEMA.md` 全量校验，错误级拦截保存，警告级只提示 |

**数据安全四条**（对应 `ADMIN_SCHEMA.md` §0）：

1. 每次写入前自动备份 `species.sample.json.bak.<时间戳>`（已 gitignore）；
2. 保存前弹 diff 预览，逐字段展示 `-旧 / +新`，确认后才写；
3. 按契约固定的 13 字段顺序序列化，**契约外的未知字段原样保留**，绝不静默丢弃；
4. `audioSource` / `audioLicense` 是逐条版权署名，禁止参与任何批量操作。

后端能力由 Vite 开发服务器插件 `vite-plugin-admin.ts` 提供（`apply: 'serve'`，
生产构建根本不加载），接口挂在 `/__admin/*`。纯静态前端写不了磁盘，所以文件读写与
ffmpeg 调用都放在 Node 侧执行。

> 需要 ffmpeg 才能用转码与批量规范化。未安装时工具会在顶栏标注「ffmpeg 缺失」并禁用相关按钮，
> 其余功能不受影响。安装：`winget install Gyan.FFmpeg`（Windows）/ `brew install ffmpeg`（macOS）。

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

将 `dist/` 部署到自有服务器（Nginx 等静态服务器托管），通过子域名 `tinglai.dushiofcourses.cn` 提供访问。
静态资源需以 HTTPS 提供，录音识别功能依赖浏览器的安全上下文。

> 构建说明：`vite.config.ts` 中设置了 `build.emptyOutDir = false`；
> 产物文件名带 hash，不清空输出目录亦不会互相覆盖。

## 合规说明

- 科普文案由团队参考公开资料原创撰写；叫声素材引用公开自然声音库（如 xeno-canto）。
- 识别能力通过调用公开模型 / API 实现，应用架构与交互编排均为团队自研。
- 应用不设服务器、不收集任何个人信息，用户数据仅存于本机 localStorage。
