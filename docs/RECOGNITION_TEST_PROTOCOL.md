# 听籁 SoundVerse · 真识别 MVP 人机测试协议

> 面向：**已部署 server/ 识别容器的真实服务器环境**（如 `tinglai.dushiofcourses.cn`）。
> 目的：手把手验证「录音/上传 → 真实 BirdNET 识别 → 科普卡/诚实占位/兜底」整链路。
> 关联代码：`server/recognize_service.py`、`server/birdnet_engine.py`、`src/lib/recognize.ts`。
> 部署前置请先看 `server/DEPLOY_GUIDE.md`（英文）或 `server/容器部署指导方案.md`（中文）。

---

## 0. 链路总览（心里有数）

```
浏览器（识籁页）──录音/上传──▶ POST /api/recognize ──▶ nginx 反代 ──▶ 容器 :8000
                                                  ◀── {detections:[...]} ──┘
   ↓ src/lib/recognize.ts 编排
   ├─ 命中 recognition-map + 本地物种库  → 渲染科普卡（source=birdnet）
   ├─ 识别到、但不在科普库、且置信≥0.5  → 诚实占位卡「暂未收录」
   └─ 无结果 / 服务不可达 / 超时         → 本地兜底「离线示例结果」（明确标注，不冒充）
```

前端**永不崩溃**：任何失败都降级到本地兜底，并在结果区说明原因（见 §4）。

---

## 1. 部署识别容器

在服务器上（已装好 Docker / Docker Compose）：

```bash
cd server
docker compose up -d --build        # 首次会下载 birdnet 模型（约 50MB），日志可见进度
docker compose logs -f              # 观察模型下载与「BirdNET 模型加载完成」
```

- 容器只绑 `127.0.0.1:8000`（不直连公网），外部流量走 nginx 反代 + HTTPS。
- 模型下载/加载较慢，**容器 `healthy` 之前**识别会返回 503 → 前端走兜底，这是预期内，不是 bug。

### 1.1 本地起（开发联调，可选）

```bash
cd server
pip install -r requirements.txt
uvicorn recognize_service:app --host 0.0.0.0 --port 8000
# 浏览器开 http://127.0.0.1:8000/docs 看 Swagger，/healthz 看引擎状态
```

### 1.2 探活（部署后必做）

```bash
curl -s http://127.0.0.1:8000/healthz
# 期望：{"status":"ok","engine":"ready","detail":"BirdNET 模型已加载"}
#       若 engine 为 "lazy"/"error"，见 §5 排查
```

---

## 2. 配置 nginx 反代（同源，推荐）

把前端静态站和识别接口放到**同一域名**，浏览器就不触发跨域检查，最省心。

在站点 server 块里加：

```nginx
# 识别服务反代（前端请求的相对路径 /api/recognize 落到这里）
location /api/ {
    proxy_pass http://127.0.0.1:8000/api/;   # 注意：location 与 proxy_pass 都带 /api/，路径才能对上
    proxy_set_header Host              $host;
    proxy_set_header X-Real-IP         $remote_addr;
    proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    client_max_body_size 25m;          # 音频可能十几 MB，别被默认 1MB 卡掉
    proxy_read_timeout  120s;          # 模型冷启动 + 推理可能要几十秒
    proxy_send_timeout  120s;
}

# 健康检查（可选，方便在浏览器直接看状态）
location /healthz {
    proxy_pass http://127.0.0.1:8000/healthz;
}
```

```bash
sudo nginx -t && sudo systemctl reload nginx
```

> ⚠️ **路径对齐的关键**：`proxy_pass` 末尾**必须**带 `/api/`（与 `location /api/` 一致）。
> 若误写成 `proxy_pass http://127.0.0.1:8000/;`（末尾只有 `/`），nginx 会把前缀 `/api/` 剥掉，
> 后端实际收到 `/recognize` → 404。后端已为这种误配加了 `/recognize` 别名兜底，但**仍建议按上面写对**。

### 2.1 前端构建时如何指向服务

生产同源反代场景下，前端**不用配地址**，留空走相对路径即可：

```bash
# 仓库根目录 .env（或 .env.local / CI 注入）
VITE_RECOGNIZE_API=
# 改完必须重新构建：
npm run build
```

其它几种情况：

| 场景 | VITE_RECOGNIZE_API | 最终请求 |
|------|--------------------|----------|
| 生产同源反代（推荐） | （空） | `/api/recognize`（相对） |
| 开发本机容器 | `http://localhost:8000` | `http://localhost:8000/api/recognize` |
| 识别服务在另一台机器 | `https://api.你的域名.com` | `https://api.你的域名.com/api/recognize` |
| 反代路径不是 /api/recognize | 改用 `VITE_BIRDNET_ENDPOINT=https://host/recognize`（**完整地址**，优先级最高） | 原样使用 |

（`VITE_API_BASE_URL` 也可填，优先级更低，可带 `/api` 后缀，前端会自动归一化。详见 `.env.example`。）

---

## 3. 打开识籁页并录制

1. 浏览器打开部署好的站点（如 `https://tinglai.dushiofcourses.cn`）。
2. 进入「识籁 / 录音」页面（识别入口）。
3. 看页面右上角（或识别区）的**服务状态徽章**，应显示：
   - `online`（引擎 ready）→ 真识别可用；
   - `checking` → 正在探活（3 秒超时）；
   - `offline` 或 `unconfigured` → 见 §5。
4. 点「开始录音」，对着鸟叫录 5–15 秒；或点「上传」选一段清晰的鸟鸣 mp3/wav。
5. 点「识别」。

---

## 4. 观察结果：三种预期行为

前端按下面规则判定并**明确标注**，不会混淆：

### ① 命中科普卡（source = birdnet）
- 条件：BirdNET 返回的学名/俗名，被 `src/data/recognition-map.json` 或本地物种库匹配到。
- 表现：结果区出现**可点击进入详情的物种卡**（真实 BirdNET 置信度）。
- 判定依据：`recognize.ts` 的 `matchSpecies()` 命中 → `inLibrary=true`。

### ② 诚实占位（识别到、但暂未收录）
- 条件：服务返回了一个物种，**但不在听籁科普库内**，且**置信度 ≥ 0.5**（阈值 `NOTABLE_CONF`）。
- 表现：结果区出现占位卡，标注「暂未收录进听籁科普库」，列出识别到的俗名/学名；**不可跳详情**。
- 含义：这是真实模型输出，只是我们科普库还没收录它——诚实告知，不假装是成品卡。

### ③ 兜底（离线示例结果）
满足以下任一即走本地兜底，且**一定带「离线示例结果」字样和原因说明**：
- 服务返回 **0 个**检测结果（BirdNET 目前主要覆盖鸟类，蛙/虫/环境音常为空）；
- 服务**不可达**（容器没起 / nginx 没配 / 网络受限）→ 原因「识别服务暂不可用…」；
- 请求**超时**（默认 30s）→ 原因「识别服务响应超时…」；
- 服务返回 **503**（模型没下好 / 缺 ffmpeg）→ 显示后端中文原因后兜底。

> 兜底结果来自本地启发式（基于音频指纹稳定伪随机选物种），**仅用于演示，绝不冒充真实模型输出**。
> 评委/用户应能在 UI 上明显区分「真识别」与「离线示例」。

### 状态徽章含义（`probeService`）

| 状态 | 含义 |
|------|------|
| `checking` | 正在探测 /healthz（3s 超时） |
| `online` | 探活成功，`engine` 字段为 ready/lazy/error 会一并展示 |
| `offline` | 探活失败（服务没起 / 跨域被拦 / 地址错） |
| `unconfigured` | 前端完全没配识别地址（基本不会发生，生产已走同源） |

---

## 5. 常见问题排查

| 现象 | 可能原因 | 处理 |
|------|----------|------|
| 录完一直转圈 → 给「离线示例结果 / 识别服务暂不可用」 | 容器 8000 没起 | `docker compose ps`；`curl 127.0.0.1:8000/healthz` |
| 状态徽章 `offline` 但 `curl` 本机正常 | 浏览器跨域被拦（来源不在白名单） | 在 `docker-compose.yml` 加 `EXTRA_ORIGINS: "https://你的站"` 后重建；或确保同源 |
| 前端请求 404，路径里有两个 `/api/recognize` | `VITE_RECOGNIZE_API` 多写了 `/api/recognize` | 只填到域名为止；改完**重新 build** |
| 后端日志 404（`/recognize`） | nginx `proxy_pass` 末尾误写 `/` 把前缀剥了 | 按 §2 改成 `proxy_pass http://127.0.0.1:8000/api/;`；后端已加 `/recognize` 别名兜底 |
| 结果区显示「离线示例结果」但服务其实是好的 | 录的是蛙/虫/纯环境音 | BirdNET 主要认鸟；换清晰的鸟鸣再试 |
| 识别很慢（几十秒） | 模型冷启动 / 首次下载 | 已设 `WARMUP_ON_START=1`；之后会快；nginx `proxy_read_timeout` 已给 120s |
| 后端返回 503 `engine_not_ready` | 模型没下好 / 缺 ffmpeg / 缺依赖 | `docker compose logs` 看原因；裸机部署确认 `apt install ffmpeg` |
| 后端返回 400 `decode_failed` | 音频损坏 / 容器缺 ffmpeg | 换一段干净录音；确认容器装了 ffmpeg（Dockerfile 已含） |
| 上传被截断（413 / 空结果） | nginx `client_max_body_size` 太小 | §2 已设 25m，确认已 reload |

### 后端错误码速查（`{detections:[], error, message}`）

- `400 no_audio` 没收到文件；`400 bad_format` 格式不支持；`400 too_large` 超 20MB；`400 empty_audio` 文件过小
- `503 engine_not_ready` 引擎不可用（模型/依赖/ffmpeg）；`503 internal_error` 未预期异常
- `400 decode_failed` 音频解码失败

---

## 6. 验收清单（人测通过即可认为 MVP 打通）

- [ ] `docker compose up -d` 后容器 `healthy`，`/healthz` 返回 `engine:"ready"`
- [ ] nginx 反代配置好并 reload，前端状态徽章显示 `online`
- [ ] 上传一段清晰鸟鸣 → 出现**真识别**结果（命中科普卡 或 诚实占位，带真实置信度）
- [ ] 上传一段环境白噪音 → 走兜底且标注「离线示例结果」+ 原因（符合预期）
- [ ] 容器停止时，前端不崩，稳定降级到兜底并说明原因

---

## 7. 备注：CloudStudio 预览与「轻量 fallback」（非阻塞）

- CloudStudio 是纯静态站点，跑不了 Python 后端，故 MVP 主打服务器真实环境。
- 可选加分项：接入 Cornell 公共 BirdNET API 作为 CloudStudio 预览用轻量 fallback。
  **注意**：公共端点通常有 CORS 限制 + 限速，浏览器直连多半会被拦，需要自建一个极轻代理
  （把 CloudStudio 的请求转发到 Cornell 端点并返回）。若评估下来复杂度高，可跳过——
  已有「本地启发式兜底」保证 CloudStudio 预览页不空，不阻塞主链路验收。
