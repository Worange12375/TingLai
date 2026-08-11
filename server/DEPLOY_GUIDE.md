# 听籁 SoundVerse · 识别服务部署说明

本文面向部署与运维，讲清楚三件事：怎么把识别服务跑起来、网络与跨域要注意什么、前端怎么对接。
不涉及前端工程本身（前端在仓库根目录，由 `npm run build` 产出静态文件）。

---

## 一、服务是什么

识别服务是一个独立的 Python 后端（FastAPI + birdnetlib），负责把用户上传的音频识别成「可能是哪些自然之声 + 置信度」。

- 对外接口只有两个：
  - `GET  /healthz`        健康检查，永远返回 200（模型没就绪也会回 200，只是指示引擎状态）
  - `POST /api/recognize`  上传音频（multipart），返回 `{ "detections": [ ... ] }`
- 我们**不训练模型**，只做编排：把开源的 BirdNET 推理库包成「懒加载、线程安全、结果已按物种去重聚合」的引擎。
- 设计底线：**服务永远起得来**。模型没下好、缺 ffmpeg、依赖缺失都只是让识别请求返回 503 + 中文原因，前端据此走本地兜底，页面不会崩。

---

## 二、用 Docker 跑起来（推荐）

代码位置：`server/` 目录（含 `Dockerfile`、`docker-compose.yml`、`requirements.txt`、`recognize_service.py`、`birdnet_engine.py`）。

### 1. 构建并启动

```bash
cd server
docker compose up -d --build
```

- 首次启动会下载 BirdNET 模型（约 50MB）到容器内的 `~/.cache`，首次可能要等一两分钟。
- 日志里能看到模型下载进度：`docker compose logs -f`。
- 模型缓存挂在卷 `birdnet-cache` 上，容器重建不会重新下载。

### 2. 确认服务健康

```bash
curl http://127.0.0.1:8000/healthz
# 期望返回：{"status":"ok","engine":"ready" 或 "lazy" 或 "error", ...}
```

`engine` 字段说明：
- `ready`：模型已加载，可以直接识别。
- `lazy`：还没加载，首个识别请求时才会按需加载（会慢几秒）。
- `error`：引擎不可用（多半是模型没下下来 / 缺 ffmpeg），识别请求会返回 503。

### 3. 暂停 / 停止

```bash
docker compose down        # 停止并删除容器（模型缓存卷保留）
```

---

## 三、不用 Docker 也能跑（本地开发 / 裸机）

```bash
cd server
pip install -r requirements.txt
# 系统层面还需要 ffmpeg 和 libsndfile（apt: ffmpeg libsndfile1）
uvicorn recognize_service:app --host 0.0.0.0 --port 8000
```

---

## 四、网络与跨域（CORS）注意事项

### 1. 容器只绑本机回环

`docker-compose.yml` 里端口是 `127.0.0.1:8000:8000`，即容器**不直接暴露公网**。
外部流量应走宿主机的 nginx 反代 + HTTPS，再由反代转发到本机 8000。
如果只是临时外网调试，可临时改成 `"8000:8000"`（注意安全风险）。

### 2. 已放行的来源白名单

服务通过 CORS 只允许下列前端来源访问（见 `recognize_service.py` 的 `ALLOWED_ORIGINS`）：

- `https://tinglai.dushiofcourses.cn`   （生产站）
- `http://tinglai.dushiofcourses.cn`
- `http://localhost:5173`              （前端 dev 服务）
- `http://127.0.0.1:5173`
- `http://localhost:8000` / `http://127.0.0.1:8000` （调试）
- `http://localhost:4173`              （`vite preview`）

如果生产域名变了，或需要加别的来源，用环境变量 `EXTRA_ORIGINS` 追加（逗号分隔），**不需要改代码重新构建**：

```bash
# docker-compose.yml 的 environment 里加一行：
EXTRA_ORIGINS: "https://example.com,https://foo.bar"
```

> 注意：CORS 是针对「浏览器跨域请求识别 API」的。它放行的是**前端页面 → /api/recognize 这个 HTTP 调用**，和下面第 3 点说的「音频播放」是两码事。

### 3. 音频播放本身不需要 CORS（重要红线）

前端播放物种叫声（`public/audio/` 下的音频）是 `<audio>` / WebAudio **直接播放**，不是 fetch 下来再处理，因此**不需要 CORS 头**，也不该设置 `crossOrigin`。

- 当前代码里所有音频播放路径都**没有**设置 `crossOrigin`（只在注释里警告「不要加」）。
- 一旦给音频元素误加 `crossOrigin="anonymous"`，跨域音频会整段静音——这是一条绝对红线，部署和改代码时都不要碰。

---

## 五、前端怎么指向这个服务（VITE_RECOGNIZE_API）

前端在 `src/lib/recognize.ts` 里用 `resolveEndpoint()` 决定识别接口地址：

- **开发环境（本地 `npm run dev`，`import.meta.env.DEV === true`）**：默认指向 `http://localhost:8000`，即直接打本地刚起的服务，无需任何配置。
- **生产环境**：把 `VITE_RECOGNIZE_API` 指到识别服务地址即可（可配成 `/api/recognize` 这种同源反代路径，也可配成完整的 `https://<你的反代域名>/api/recognize`）。

> ⚠️ **`VITE_RECOGNIZE_API` 填的是「服务基址」，不是完整接口地址。**
> 代码里是 `` `${base}/api/recognize` ``——`/api/recognize` 由前端自动拼接，你不要自己再写一遍，
> 否则会得到 `/api/recognize/api/recognize` 这种双重路径导致 404。

构建时注入（二选一，写在 `.env` 或构建命令里）：

```bash
# 方式 A：同源反代（推荐，CORS 最省心）—— 留空即可，前端自动用相对路径 /api/recognize
VITE_RECOGNIZE_API=

# 方式 B：识别服务在别的域名/端口上，只填到域名为止
VITE_RECOGNIZE_API=https://tinglai.dushiofcourses.cn
```

> 如果 `VITE_RECOGNIZE_API` 没配，生产构建里前端会自动回退到 `/api/recognize`，由你的 nginx 把 `/api/` 反代到本机 8000 即可。
>
> 如果接口路径不是 `/api/recognize`（比如反代时改成了 `/recognize`），改用 `VITE_BIRDNET_ENDPOINT`——
> 这个变量填**完整接口地址**，前端原样使用不再拼接，且优先级高于 `VITE_RECOGNIZE_API`。

面向「照着做」的完整手动部署步骤（含 nginx 配置样例、离线塞模型、排障表），见 [`容器部署指导方案.md`](./容器部署指导方案.md)。

---

## 六、比赛演示所需资源

比赛演示时，识别服务需要两样东西，容器里都已内置/会自动准备：

1. **ffmpeg**：BirdNET 解码 mp3 / m4a / ogg / webm 的硬依赖。Dockerfile 已 `apt-get install ffmpeg`（裸机部署需手动装）。
2. **BirdNET 模型（约 50MB）**：首次运行时自动下载到 `~/.cache`（容器内挂在 `birdnet-cache` 卷，重建不重下）。
   - 若服务器完全无外网，需提前在有网环境把模型缓存打包带过去，放进对应缓存目录。
   - 即便模型暂时没下好，服务也能起来；只是识别请求会返回 503，前端自动走「离线示例结果」兜底，演示主流程不中断。

---

## 七、识别链路总览（前端 → 后端 → 科普卡）

完整一次「录音识声」的数据流：

1. **前端录音 / 上传**：在「识声」页面用浏览器 `MediaRecorder` 录一段，或上传本地音频。
2. **请求识别服务**：前端把音频 POST 到 `VITE_RECOGNIZE_API`（即 `POST /api/recognize`，可带 lat/lon/date 做地理与季节过滤）。
3. **后端推理**：FastAPI 收到后落临时文件 → `birdnet_engine.analyze_file` 调 birdnetlib 推理 → 引擎层把 BirdNET 按 3 秒窗口滑动输出的几十上百条结果，**按物种去重、取最高置信度、统计命中窗口数**，聚合成干净的 Top-N（前端只用 Top-3，后端默认给 5 留余量）。
4. **返回 Top-3**：后端回 `{ "detections": [物种A, 物种B, 物种C] }`，每条含 `commonName` / `scientificName` / `confidence`。
5. **前端三级匹配科普卡**：`src/lib/recognize.ts` 的 `matchSpecies` 用三级策略把识别结果对到本地物种库：
   - 第一级：识别名直接命中映射表（`recognition-map*.json`）；
   - 第二级：与物种库 `commonName` / `scientificName` 精确相等；
   - 第三级：模糊匹配（含子串 / 别名）。
   命中后渲染对应的物种科普卡（插画或类群剪影 + 叫声 + 介绍）。
6. **兜底**：若识别服务不可达 / 返回错误 / 3 级都没匹配上，前端用 `localFallback` 产生一个**带明确「离线示例结果」标识**的 Top-3，绝不白屏。

---

## 八、常见故障速查

| 现象 | 可能原因 | 处理 |
|------|----------|------|
| `/healthz` 返回 `engine: error` | 模型没下载成功 / 缺 ffmpeg | 看 `docker compose logs`；确认服务器能访问外网下载模型；确认装了 ffmpeg |
| 前端识别一直转圈后给「离线示例结果」 | 后端 8000 没起 / CORS 被拦 / `VITE_RECOGNIZE_API` 配错 | `curl 127.0.0.1:8000/healthz` 确认服务活；检查来源白名单与 `VITE_RECOGNIZE_API` |
| 浏览器控制台报 CORS 错误 | 前端来源不在 `ALLOWED_ORIGINS` | 用 `EXTRA_ORIGINS` 追加来源，或把流量收口到反代同源 |
| 上传后返回 400 bad_format | 传了不支持的音频格式 | 支持 wav/mp3/m4a/ogg/webm/flac/aac/mp4；不支持的先转码 |
| 物种名识别出来了但没科普卡 | 映射表里没有这条 | 在 `recognition-map*.json` 补映射；或用三级模糊匹配兜底 |

---

## 九、一句话部署 checklist

- [ ] `cd server && docker compose up -d --build`
- [ ] `curl 127.0.0.1:8000/healthz` 看到 `status: ok`
- [ ] 生产前端构建时注入 `VITE_RECOGNIZE_API`（或让 nginx 把 `/api/` 反代到本机 8000）
- [ ] 若前端域名不在白名单，用 `EXTRA_ORIGINS` 追加
- [ ] 容器只绑 `127.0.0.1:8000`，外部走 nginx 反代 + HTTPS
- [ ] 确认没给任何音频元素加 `crossOrigin`（音频播放红线）
