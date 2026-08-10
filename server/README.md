# 听籁 SoundVerse · 声音识别服务

基于 [BirdNET](https://github.com/kahst/BirdNET-Analyzer)（开源模型）+ [birdnetlib](https://github.com/joeweiss/birdnetlib)（开源推理封装）搭的识别后端。
**我们不训练模型**，只做自己的编排层：懒加载、线程安全、结果按物种聚合、优雅降级。

同一套引擎（`birdnet_engine.py`）被两个上层复用：

| 文件 | 作用 | 面向谁 |
|---|---|---|
| `recognize_service.py` | FastAPI HTTP 服务 | 前端网页 `src/lib/recognize.ts` |
| `mcp_server.py` | MCP 工具服务器 | 我们自己的 AI 助手（批量识别 / 验证映射表） |

---

## 一、接口契约

### `GET /healthz`

```json
{ "status": "ok", "engine": "ready", "detail": "BirdNET 模型已加载" }
```

`engine` 三种值：`ready`（模型已加载） / `lazy`（还没加载，首次识别时按需加载） / `error`（加载失败，`detail` 里是中文原因）。
**无论引擎状态如何，只要进程活着就返回 200** —— 这样 nginx / docker healthcheck 不会因为模型没下好就把服务判死。

### `POST /api/recognize`

请求 `multipart/form-data`：

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `audio` | 文件 | ✅ | wav / mp3 / m4a / ogg / webm / flac，≤20MB |
| `lat` | 文本 | ❌ | 录制地纬度，与 `lon` **成对**提供才生效 |
| `lon` | 文本 | ❌ | 录制地经度 |
| `date` | 文本 | ❌ | 录制日期 `YYYY-MM-DD`，按季节收窄候选物种 |
| `min_conf` | 文本 | ❌ | 置信度下限，默认 `0.25`，夹到 `[0.01, 0.99]` |
| `top_k` | 文本 | ❌ | 最多返回几个物种，默认 `5` |

成功 `200`：

```json
{
  "detections": [
    {
      "scientificName": "Passer montanus",
      "commonName": "Eurasian Tree Sparrow",
      "confidence": 0.8734,
      "lat": 23.12, "lon": 113.26, "date": "2025-08-06",
      "startTime": 3.0, "endTime": 6.0, "hitCount": 7
    }
  ]
}
```

> `hitCount` 是我们自己加的：BirdNET 按 3 秒窗口滑动输出，同一物种会重复几十条。
> 引擎层按物种归并、取最高置信度，`hitCount` 表示命中了几个窗口 —— 数字越大说明这段音频里它叫得越持续，可以辅助判断可信度。

失败：

| 状态码 | 场景 | 响应体 |
|---|---|---|
| `400` | 没传音频 / 空文件 / 超 20MB / 格式不支持 / 解码失败 | `{"detections":[],"error":"no_audio","message":"中文原因"}` |
| `503` | 引擎未就绪（缺依赖 / 模型下载失败 / 缺 ffmpeg） | `{"detections":[],"error":"engine_not_ready","message":"中文原因"}` |

**任何失败都返回 `detections: []` + 中文 `message`**，前端直接拿 `message` 给用户看，并自动降级到本地兜底结果，页面不会崩。

### CORS

默认放行：

- `https://tinglai.dushiofcourses.cn`（生产站）
- `http://localhost:5173` / `http://127.0.0.1:5173`（vite dev）
- `http://localhost:4173`（vite preview）
- `http://localhost:8000` / `http://127.0.0.1:8000`

需要加别的来源：设环境变量 `EXTRA_ORIGINS="https://a.com,https://b.com"`。

---

## 二、本地开发（Windows / macOS / Linux 都行）

```bash
cd server
python -m venv .venv
# Windows: .venv\Scripts\activate    macOS/Linux: source .venv/bin/activate
pip install -r requirements.txt

# 起服务
uvicorn recognize_service:app --reload --port 8000
```

验证：

```bash
curl http://localhost:8000/healthz
# {"status":"ok","engine":"lazy","detail":"模型尚未加载，首次识别请求时按需加载"}

curl -F "audio=@某段鸟叫.mp3" -F "lat=23.12" -F "lon=113.26" -F "date=2025-08-06" \
     http://localhost:8000/api/recognize
```

### 冒烟测试（不需要模型、不需要真音频）

```bash
pip install httpx            # TestClient 依赖
python smoke_test.py
```

会验证 20 条断言：健康检查、四种参数校验 400（无音频 / 坏格式 / 空文件 / 超限）、
引擎缺失时的 503 降级、CORS 白名单放行与拒绝。最后一行打印 `ALL_PASS` 即通过。

> 本机没装 birdnetlib 也能跑通 —— 那种情况下第 7 项走 503 分支，
> 正好验证「引擎挂了服务照样活着，并返回可读中文原因」这条降级设计。

### 前端联调

在项目根目录建 `.env.local`

```
VITE_RECOGNIZE_API=http://localhost:8000
```

然后 `npm run dev`，识籁页面的徽章会从「本地示例模式」变成「已配置」。

> **首次识别会卡十几秒到几分钟** —— BirdNET 在下载 ~50MB 模型。
> 想提前下好，跑一次 `python -c "from birdnetlib.analyzer import Analyzer; Analyzer()"` 预热即可。
> 服务默认 `WARMUP_ON_START=1`，启动时就会在后台线程预热。

---

## 三、部署到 Linux 服务器（Docker）

### 1. 起容器

```bash
# 把 server/ 目录传到服务器，比如 /opt/tinglai/server
cd /opt/tinglai/server
docker compose up -d --build

# 看日志，等模型下载完（首次约 1~3 分钟）
docker compose logs -f
# 出现「BirdNET 模型加载完成，识别引擎就绪。」即可

# 自测
curl http://127.0.0.1:8000/healthz
```

`docker-compose.yml` 里端口绑的是 `127.0.0.1:8000:8000`，**只监听本机回环**，
公网流量一律走宿主机 nginx 反代 + 已有的 HTTPS 证书，容器不直接暴露到公网。

模型缓存挂在 named volume `birdnet-cache` 上，容器重建不用重新下 50MB。

### 2. nginx 加反代（站点已配好 HTTPS，只需补一个 location）

在 `tinglai.dushiofcourses.cn` 的 `server { ... }` 块里，**加在现有 `location /` 之前**：

```nginx
# —— 听籁识别服务反代 ——
location /api/recognize {
    proxy_pass http://127.0.0.1:8000/api/recognize;

    proxy_http_version 1.1;
    proxy_set_header Host              $host;
    proxy_set_header X-Real-IP         $remote_addr;
    proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;

    # 音频上传：放宽体积上限（前端限 20MB，这里给 32MB 余量）
    client_max_body_size 32m;

    # BirdNET 推理 + 首次模型下载可能很慢，超时给足
    proxy_connect_timeout 15s;
    proxy_send_timeout    300s;
    proxy_read_timeout    300s;

    # 上传大文件时不缓冲到磁盘，直接透传
    proxy_request_buffering off;
}

# 健康检查（可选，方便外部探活）
location /api/healthz {
    proxy_pass http://127.0.0.1:8000/healthz;
    access_log off;
}
```

改完 `nginx -t && systemctl reload nginx`。

> **同源之后 CORS 就不重要了**：前端和 `/api/recognize` 都在 `https://tinglai.dushiofcourses.cn` 下，
> 属于同源请求，浏览器不发预检。服务里的 CORS 配置是给本地 `localhost:5173` 开发用的兜底。

### 3. 前端指向

生产环境构建时设 `VITE_RECOGNIZE_API=""`（空字符串），前端会用相对路径 `/api/recognize`，
自动走同源 nginx 反代 —— 这是推荐做法。

如果识别服务部在**另一台机器**上，就设成完整域名 `VITE_RECOGNIZE_API=https://api.example.com`，
同时要把那个域名加进服务的 `EXTRA_ORIGINS`。

---

## 四、MCP 包装（加分项）

`mcp_server.py` 用官方 MCP Python SDK 把同一个引擎暴露成三个工具：

| 工具 | 签名 | 用途 |
|---|---|---|
| `recognize_audio` | `(audio_path, lat?, lon?, date?, min_conf?, top_k?)` | 识别单个本地音频 |
| `recognize_batch` | `(audio_paths[], ...)` | 批量识别，给 `recognition-map.json` 做回归验证 |
| `engine_health` | `()` | 查引擎状态，不触发模型加载 |

运行（stdio 传输，由 MCP 客户端拉起）：

```bash
pip install "mcp[cli]"
python mcp_server.py
```

MCP 客户端配置：

```json
{
  "mcpServers": {
    "tinglai-birdnet": {
      "command": "python",
      "args": ["/opt/tinglai/server/mcp_server.py"]
    }
  }
}
```

用途举例：把 22 条样本音频路径一次性丢给 `recognize_batch`，
看 BirdNET 实际吐出的拉丁学名，据此校准 `src/data/recognition-map.json` 的映射，
不用手工一个个 curl。

---

## 五、已知限制 / 注意事项

1. **BirdNET 只认鸟。** 蛙类、昆虫（我们库里 22 条中有 8 条）它给不出结果，
   会返回空 `detections`，前端自动走本地启发式兜底。这是模型本身的能力边界，不是 bug。
   后续要覆盖蛙/虫，需要另接模型（如 AmphibiaWeb 声纹库或自建分类头）。
2. **ffmpeg 是硬依赖。** 没装的话只能读 wav，浏览器录音出来的 webm/opus 会解码失败。
   Docker 镜像里已装好；裸机部署务必 `apt-get install ffmpeg`。
3. **首次启动要能联网**下载 ~50MB 模型。完全离线的机器需要预先把模型文件放进
   `birdnet-cache` volume 或镜像里。
4. **单 worker 设计。** TFLite 解释器并发不安全，引擎层用锁串行化推理。
   演示量级完全够用；要更高吞吐请横向多起容器，**不要加 `--workers`**（每个 worker 会各自加载一份模型，吃内存）。
5. **不留用户录音。** 上传文件写到系统临时目录，识别完 `finally` 里立刻删除。
6. 推理是 CPU 密集型，一段 30 秒音频在 2 核小机器上约 2~5 秒。
