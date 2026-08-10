# 听籁 SoundVerse · 物种科普卡数据契约（管理员工具 Schema）

> 维护人：林知声（物种知识工程师） · 消费方：`/dev` 本地管理员工具（郝栈桥）、`src/data/species.ts`、`src/lib/recognize.ts`
> 适用文件：`src/data/species.sample.json`（30 条）、`src/data/recognition-map.json`
> 本文档中的每一条规则均已用现有 30 条数据反向校验通过（0 违规），可直接实现为校验器。

---

## 0. 最高优先级约束（先读这一节）

管理员工具在**保存**时必须满足以下 5 条硬约束，违反任意一条即视为数据损坏：

1. **不得丢字段。** 每条记录必须完整写回全部 **13 个字段**，即使值为空也要保留键。禁止「只序列化表单里出现过的字段」。
2. **逐条署名不可破坏。** `audioSource` / `audioLicense` 是**每条独立**的版权署名，不是全局配置。禁止合并为统一默认值、禁止在批量操作中省略、禁止用空串覆盖已有值。这是本项目合规使用 CC 素材的法律依据。
3. **整体读 → 改 → 整体写回。** 以完整数组为单位读写，禁止增量 patch 拼接 JSON 文本。
4. **字段顺序固定**，见第 1 节的序号顺序。写回时按该顺序序列化，保证 git diff 干净可审。
5. **`id` 是主键。** 改 `id` 会同时断开 `recognition-map.json` 的映射与 `/assets/npc-<id>.webp` 的图片引用，必须走第 4 节的联动改名流程。

**文件格式**：UTF-8 **无 BOM**、**LF** 换行、**2 空格**缩进、中文**不转义**（`ensure_ascii=false` / `JSON.stringify(data, null, 2)`）、文件末尾保留一个换行符。

---

## 1. 字段定义（13 个字段）

| # | 字段 | 类型 | 必填 | 可编辑 | 校验规则 |
|---|------|------|:----:|:------:|----------|
| 1 | `id` | string | ✅ | ⚠️ 受控 | kebab-case：`^[a-z0-9]+(-[a-z0-9]+)*$`；全表唯一；改名须联动（见 §4） |
| 2 | `name` | string | ✅ | ✅ | 中文正式名，2–8 字；全表唯一；不含空格/标点 |
| 3 | `scientific` | string | ✅ | ⚠️ 受控 | 拉丁双名法：`^[A-Z][a-z]+ [a-z-]+$`（属名首字母大写 + 空格 + 小写种加词）；全表唯一；改动须同步 `recognition-map.json`（见 §4） |
| 4 | `group` | enum | ✅ | ✅ | **必须**∈ `鸟类` \| `蛙类` \| `昆虫`（下拉选择，禁止自由输入）※ |
| 5 | `callFeature` | string | ✅ | ✅ | 叫声特征，20–120 字（现有 34–48） |
| 6 | `habit` | string | ✅ | ✅ | 习性，20–120 字（现有 34–44） |
| 7 | `distribution` | string | ✅ | ✅ | 地理分布，10–80 字（现有 16–35） |
| 8 | `protectLevel` | string(受限) | ✅ | ✅ | 见 §2 保护级别规则 |
| 9 | `funFact` | string | ✅ | ✅ | 趣味知识点，20–140 字（现有 34–54） |
| 10 | `audioUrl` | string(URL) | ✅ | ✅ | 必须 `https://` 开头；扩展名 ∈ `.mp3` \| `.m4a` \| `.wav` \| `.ogg`；允许 URL 编码字符 |
| 11 | `audioSource` | string | ✅ | ✅ | 署名文本，≥20 字，须含「平台 + 编号 + 录制者 + 日期 + 地点」四要素，见 §3 |
| 12 | `audioLicense` | enum | ✅ | ✅ | **必须**∈ `CC0` \| `CC BY` \| `CC BY-NC` \| `CC BY-NC-SA 4.0`（下拉选择，禁止自由输入） |
| 13 | `image` | string | ✅ | ❌ 派生 | 固定为 `/assets/npc-<id>.webp`，由 `id` 派生，不允许手填 |

> ※ `src/types/species.ts` 的 `SpeciesGroup` 另含 `其他`，那是运行时兜底值（`inferGroup` 推断失败时使用）。
> **管理员工具的下拉框只允许 3 个值**，不得写入 `其他`；数据层出现 `其他` 即视为脏数据。

**必填 12 / 派生 1**：`image` 由 `id` 自动生成，其余 12 个字段均为必填、不得为空串。

---

## 2. `protectLevel` 保护级别规则

采用「**基础级别 + 可选补充说明**」结构，依据《国家重点保护野生动物名录》（2021）与 IUCN 红色名录，**必须可溯源，禁止编造**。

**基础级别（4 选 1，必须精确匹配）**

- `国家一级重点保护野生动物`
- `国家二级重点保护野生动物`
- `国家三有保护动物`
- `未列入国家保护名录`

**补充说明（可选）**：紧跟基础级别，用**中文全角括号**包裹，1–20 字。

校验正则：

```regex
^(国家一级重点保护野生动物|国家二级重点保护野生动物|国家三有保护动物|未列入国家保护名录)（?([^（）]{1,20})?）?$
```

严格版（推荐实现）：

```regex
^(国家一级重点保护野生动物|国家二级重点保护野生动物|国家三有保护动物|未列入国家保护名录)(（[^（）]{1,20}）)?$
```

现有数据中实际出现的 6 种取值（全部合规，可作为下拉预设 + 允许自定义补充）：

| 取值 | 条数 | 出现物种 |
|------|:----:|----------|
| `国家一级重点保护野生动物` | 2 | 朱鹮、丹顶鹤 |
| `国家二级重点保护野生动物` | 2 | 画眉、红角鸮 |
| `国家二级重点保护野生动物（仅限野外种群）` | 1 | 虎纹蛙 |
| `国家三有保护动物` | **20** | 麻雀、黑枕黄鹂、珠颈斑鸠、乌鸫、白头鹎、大山雀、灰喜鹊、戴胜、大杜鹃、四声杜鹃、白胸苦恶鸟（以上 11 种鸟）+ 中华蟾蜍、中国雨蛙（2 种蛙）+ 喜鹊、家燕、普通翠鸟、白鹡鸰、八哥、红嘴蓝鹊、松鸦（本次 +7 种鸟） |
| `国家三有保护动物（IUCN 近危 NT）` | 1 | 黑斑侧褶蛙 |
| `未列入国家保护名录（常见广布种）` | 4 | 黑蚱蝉、蟪蛄、迷卡斗蟋、纺织娘 |
| **合计** | **30** | — |

> 按**基础级别**归并（忽略括号补充说明）则为：三有 21 / 未列入 4 / 一级 2 / 二级 3。
> 上表按**完整字符串精确计数**，两种口径都对，实现校验器时注意区分。

**建议**：管理员工具把「基础级别」做成下拉、「补充说明」做成独立输入框，保存时拼接，从根上杜绝手抖写错。

---

## 3. `audioSource` / `audioLicense` 署名规则（合规红线）

### 3.1 `audioSource` 四要素

必须能凭此字段回溯到原始素材页面：

```
<平台名> <编号>（录制者：<姓名>，<YYYY-MM-DD>，<地点>）
```

现有两种平台的实例：

- iNaturalist：`iNaturalist 声音库 #1595435（录制者：Reed Lindwurm，2025-08-06，广东广州荔湾区）`
- xeno-canto：`xeno-canto XC777570（录制者：何文进，2023-01-28，陕西汉中洋县）`

校验（宽松，只保证四要素在场）：编号部分匹配 `#\d+|XC\d+`，且包含 `录制者：`，且包含 `\d{4}-\d{2}-\d{2}`。

### 3.2 `audioLicense` 枚举

| 值 | 含义 | 商用 | 改编 | 现有条数 |
|----|------|:----:|:----:|:--------:|
| `CC0` | 公共领域奉献 | ✅ | ✅ | 1 |
| `CC BY` | 署名 | ✅ | ✅ | 2 |
| `CC BY-NC` | 署名-非商业性使用 | ❌ | ✅ | 18 |
| `CC BY-NC-SA 4.0` | 署名-非商业-相同方式共享 | ❌ | ✅(需同协议) | 1 |

**禁止**写入 `CC BY-SA`、`CC BY 4.0`、`ARR`、`未知`、空串等枚举外的值。新增物种若找不到明确的 CC 授权，**宁可不收录，也不得留空或臆造**。

### 3.3 工具实现要求

- `audioSource` / `audioLicense` 必须在编辑表单中**可见且默认展示**，不允许折叠进「高级选项」而在保存时丢失。
- 批量操作（批量导入 / 批量改字段 / 自动改名）**一律不得触碰**这两个字段，除非用户显式编辑该条。
- 保存前做一次「署名完整性检查」：任一条记录的 `audioSource` 或 `audioLicense` 为空 → **阻断保存**并高亮该条。

---

## 4. 联动改名与删除流程

### 4.1 修改 `id`

`id` 被三处引用，必须原子性联动：

1. `species.sample.json` 本条的 `id`
2. `species.sample.json` 本条的 `image` → 同步改为 `/assets/npc-<新id>.webp`
3. `public/assets/npc-<旧id>.webp` → 物理重命名为 `npc-<新id>.webp`
4. `recognition-map.json` 中所有 value == 旧 id 的条目 → 改为新 id（**可能不止一条**，本条物种通常有 1–3 个别名键）
5. `src/data/species.ts` 的 `ILLUSTRATED_IDS` 若含旧 id → 需人工提醒（该文件属前端，工具不自动改，仅告警）

### 4.2 修改 `scientific`

必须同步 `recognition-map.json`：旧学名键改为新学名键（value 不变）。**不要删除旧键**——旧学名往往仍是 BirdNET 的实际返回名，保留即为同物异名容错（见 §6）。

### 4.3 删除物种

删除前必须检查 `recognition-map.json` 是否仍有键指向该 `speciesId`，有则一并删除，否则会产生悬空映射（识别命中后查不到卡片 → 前端空白）。

### 4.4 `image` 字段与插画文件的关系（重要，勿误判为数据缺陷）

**`image` 字段对全部 30 条恒有值**（派生自 `id`），但 **`public/assets/` 下的 webp 文件只对部分物种存在**。二者不是一回事：

- `image` = 「**约定的**图片路径」，由 `id` 推导，永远不为空
- `src/data/species.ts` 的 **`ILLUSTRATED_IDS`** = 「**实际已配插画**的白名单」，是前端决定 NPC/首页展示哪些物种的**唯一依据**

当前状态（截至本次校验）：`ILLUSTRATED_IDS` 共 5 项，`public/assets/` 下恰好存在对应的 5 个 webp，**一一吻合，无断图**：

| speciesId | 中文名 | 文件 |
|---|---|---|
| `hoopoe` | 戴胜 | `npc-hoopoe.webp` ✅ |
| `oriole` | 黑枕黄鹂 | `npc-oriole.webp` ✅ |
| `eurasian-tree-sparrow` | 麻雀 | `npc-eurasian-tree-sparrow.webp` ✅ |
| `common-frog` | 黑斑侧褶蛙 | `npc-common-frog.webp` ✅ |
| `weaver-katydid` | 纺织娘 | `npc-weaver-katydid.webp` ✅ |

**其余 25 条无插画是当前的既定状态，不是数据缺陷。** 前端不会引用它们的 `image`（因为不在 `ILLUSTRATED_IDS` 里），因此**不会产生 404**。

校验器请按**三态**判断，不要一律报警告：

| 情形 | 级别 | 处理 |
|---|---|---|
| `id` ∈ `ILLUSTRATED_IDS` **且** 文件存在 | ✅ 正常 | 静默 |
| `id` ∈ `ILLUSTRATED_IDS` **但** 文件缺失 | ❌ **错误** | 阻断保存——白名单声明了却没图，前端必 404 |
| `id` ∉ `ILLUSTRATED_IDS` **且** 文件缺失 | ℹ️ 信息 | 计入「待配插画 N 条」汇总即可，**不要逐条刷警告** |
| `id` ∉ `ILLUSTRATED_IDS` **但** 文件存在 | ℹ️ 信息 | 提示「已有插画未启用，建议加入 `ILLUSTRATED_IDS`」 |

> `ILLUSTRATED_IDS` 位于 `src/data/species.ts`（前端文件），补图后需**人工**追加 id。
> 管理员工具**不应自动改写**该数组，仅在 §4.1 改名涉及其中的 id 时给出显式告警。

---

## 5. 数据完整性检查清单（给 `/dev` 工具的校验器）

建议在工具里做成一键「体检」，输出错误/警告两级：

**错误级（阻断保存）**

- [ ] `id` 重复 / 不符合 kebab-case
- [ ] `name` 重复 / 为空
- [ ] `scientific` 重复 / 不符合双名法正则
- [ ] `group` 不在 3 值枚举内
- [ ] `audioLicense` 不在 4 值枚举内
- [ ] `audioSource` 为空
- [ ] 任一必填字段为空串或键缺失
- [ ] `image` != `/assets/npc-<id>.webp`
- [ ] `audioUrl` 非 https 或扩展名不在白名单
- [ ] `protectLevel` 不匹配 §2 正则
- [ ] `recognition-map.json` 存在指向不存在 `speciesId` 的键（悬空映射）
- [ ] `id` ∈ `ILLUSTRATED_IDS` 但 `public/assets/npc-<id>.webp` **不存在**（断图，前端会 404）

**警告级（提示但不阻断）**

- [ ] 该物种的 `scientific` 未作为键出现在 `recognition-map.json` 中（识别链路够不到它）
- [ ] `audioUrl` HEAD 请求不可达 / 非音频 Content-Type
- [ ] 文本字段长度超出 §1 建议区间
- [ ] `group` 与 `name`/`scientific` 的类群推断不一致（如名字含「蛙」但 group 为「昆虫」）

---

## 6. 附录：`recognition-map.json` 识别映射说明

### 6.1 文件结构

**纯扁平对象**，可直接 `import` 后当 `Record<string, string>` 用，无需任何解包：

```jsonc
{
  "<BirdNET 返回的 scientificName>": "<我们的 speciesId>"
}
```

```ts
import recognitionMap from '../data/recognition-map.json'
const speciesId: string | undefined = (recognitionMap as Record<string, string>)[sciName]
```

- 共 **44 个键 → 30 个 speciesId**，30 条物种卡 **100% 覆盖**，无悬空映射。
- 一个 speciesId 允许被多个键指向（正名 + 同物异名 + 拼写变体）。
- 文件中把**别名紧挨着正名**排列（用空行分组），便于人工审阅。

**键的来源**：BirdNET-Analyzer V2.4 标签文件 `BirdNET_GLOBAL_6K_V2.4_Labels.txt`（6522 类）中的学名部分。birdnetlib 的 `Detection.scientific_name` 即 `label.split("_")[0]`，与本表的键**完全同源**，可直接查表。

> 若直接调用 BirdNET-Analyzer 的 HTTP server（返回形如 `"Parus minor_Japanese Tit"` 的合并串），**先 `split('_')[0]` 再查表**。
> 建议在加载时额外建一份 lowercase 索引做大小写/空格容错：`Object.fromEntries(Object.entries(map).map(([k,v])=>[k.toLowerCase().replace(/\s+/g,' ').trim(), v]))`。

### 6.2 已核实的学名分歧与修正映射

BirdNET V2.4（2023-06，eBird/Clements taxonomy）与本项目采用的中文语境命名存在 3 处**实质分歧**，均已在映射表中修正：

| 我们的 `scientific` | BirdNET V2.4 **实际返回名** | 修正映射 | 说明 |
|---|---|---|---|
| `Spilopelia chinensis`（珠颈斑鸠） | **`Streptopelia chinensis`** | 两个键都 → `spotted-dove` | BirdNET 沿用旧属 *Streptopelia*，`Spilopelia` 在标签表中**不存在**。不加此别名则珠颈斑鸠**永远匹配不上** |
| `Parus cinereus`（大山雀） | **`Parus minor`**（远东山雀，中国东部实际种群）<br>亦可能 `Parus major` / `Parus cinereus` | 三个键都 → `cinereous-tit` | BirdNET V2.4 把山雀拆为 3 种，其中文名对应关系与我们相反：BirdNET 里 `Parus major`=大山雀、`Parus minor`=远东山雀、`Parus cinereus`=**苍背山雀**。我们的卡片跟随 AviList 2025 的并合处理（*minor* 并入 *cinereus*，中文名恢复「大山雀」）。**中国境内录音最可能返回 `Parus minor`** |
| `Turdus mandarinus`（乌鸫） | `Turdus mandarinus` ✅ 一致 | 另加 `Turdus merula` → `chinese-blackbird` | *Turdus merula*（欧乌鸫）同在标签表中，声音高度相似易误判，作为容错别名 |
| `Pica serica`（喜鹊） | **`Pica pica`**（欧亚喜鹊，BirdNET V2.4 常用名）亦可能 `Pica serica` | 两个键都 → `eurasian-magpie` | BirdNET 常用 *pica* 合并东西方喜鹊；本卡片用 *serica*（东方喜鹊）。为兼容两种返回名，两键并列（自愈合，冗余无害） |

⚠️ **`Parus monticolus`（绿背山雀）、`Cyanopica cooki`（伊比利亚灰喜鹊）、`Pycnonotus taivanus`（台湾鹎）、`Streptopelia orientalis`（山斑鸠）** 是**不同物种**，已刻意**不**加入映射，避免错标。

### 6.3 BirdNET 覆盖率（重要，影响识别链路设计）

对 6522 类标签逐条比对结果：

- ✅ **21 / 30 可被 BirdNET 识别**（除朱鹮外的全部 21 种鸟；本次扩展 +8 鸟，均 BirdNET 覆盖）
- ❌ **9 / 30 BirdNET 完全无法识别**：
  - `crested-ibis` 朱鹮 *Nipponia nippon* —— **不在** 6522 类中（极危物种，训练数据不足）
  - 蛙类 4 种：黑斑侧褶蛙、中华蟾蜍、中国雨蛙、虎纹蛙
  - 昆虫 4 种：黑蚱蝉、蟪蛄、迷卡斗蟋、纺织娘

**根因**：BirdNET V2.4 的非鸟类别**全部是北美物种**——两栖仅 `Acris / Anaxyrus / Dryophytes / Gastrophryne / Lithobates / Pseudacris / Scaphiopus` 7 属，直翅目仅 `Gryllus / Oecanthus / Neoconocephalus / Conocephalus / Scudderia` 等 14 属，**没有任何中国产蛙类或蝉/蟋蟀/螽斯**。

**明确不做的事**：不把北美近缘种（如 `Lithobates catesbeianus` → 黑斑侧褶蛙）当作代理映射。那是伪造识别结果，违背「数据可溯源、禁止编造」原则，评审一问即穿。

**建议的链路降级策略**（供 `recognize.ts` 参考）：

1. BirdNET 返回 → 查表命中 → 展示科普卡，标注「来源：BirdNET (Cornell)」+ 置信度
2. BirdNET 返回但查表未命中 → 展示「识别到 *<拉丁名>*，本站尚无该物种科普卡」，**不要静默回退到随机卡片**
3. BirdNET 无有效返回 / 音频属蛙类昆虫 → 走本地兜底匹配，UI 明确标注「本地声纹粗匹配，仅供参考」

映射表中蛙类/昆虫的 9 个 speciesId 仍保留了正名与同物异名键，是为**将来接入自训练分类器或人工标注**时可直接复用，无需改结构。

### 6.4 同物异名 / 拼写变体清单（BirdNET 之外的容错键）

| 别名键 | → speciesId | 依据 |
|---|---|---|
| `Oriolus diffusus` | `oriole` | 黑枕黄鹂大陆种群的拆分名（部分分类系统采用） |
| `Leucodioptron canorum` | `chinese-hwamei` | 画眉旧属名（HBW/BirdLife 曾用） |
| `Rana nigromaculata` | `common-frog` | 黑斑侧褶蛙原组合名 |
| `Dryophytes chinensis` | `chinese-tree-frog` | 中国雨蛙，Duellman 等 2016 起亚洲雨蛙移入 *Dryophytes* |
| `Hoplobatrachus rugulosus` / `Rana rugulosa` | `chinese-bullfrog` | 虎纹蛙常用异名（*H. chinensis* 为优先名） |
| `Cryptotympana pustulata` | `cicada` | 黑蚱蝉异名 |
| `Gryllus micado` | `field-cricket` | 迷卡斗蟋基名 |
| `Mecopoda nipponensis` | `weaver-katydid` | 纺织娘常见**拼写变体**（正确拼写为 *niponensis*，单 p） |

---

## 7. 数据来源与许可

| 数据 | 来源 | 许可 |
|---|---|---|
| 物种叫声音频 | [iNaturalist](https://www.inaturalist.org/)（29 条）、[xeno-canto](https://xeno-canto.org/)（1 条） | 逐条记录于 `audioLicense`，均为 CC0 / CC BY / CC BY-NC / CC BY-NC-SA 4.0 |
| 识别模型与标签表 | [BirdNET-Analyzer V2.4](https://github.com/birdnet-team/BirdNET-Analyzer)，Cornell Lab of Ornithology & Chemnitz University of Technology | CC BY-NC-SA 4.0 |
| BirdNET 标签中文名参照 | BirdNET-Pi `model/l18n/labels_zh_CN.json` | 随 BirdNET 发布 |
| 保护级别 | 《国家重点保护野生动物名录》（2021 年 2 月）、国家「三有」名录、IUCN 红色名录 | 公开发布 |
| 分类学处理 | eBird/Clements（BirdNET 侧）、AviList 2025（本项目卡片侧） | 公开发布 |

> 引用 BirdNET 时须注明：Kahl, S., Wood, C. M., Eibl, M., & Klinck, H. (2021). *BirdNET: A deep learning solution for avian diversity monitoring.* Ecological Informatics, 61, 101236.
