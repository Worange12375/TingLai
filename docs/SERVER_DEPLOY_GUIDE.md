# 听籁 SoundVerse · 服务器部署操作手册（推服务器验证专用）

> 适用对象：你（主理人/运维），手动把项目推到自有服务器 `tinglai.dushiofcourses.cn` 跑真识别验证。
> 本手册是**线性操作清单**，把「前端静态站」和「识别容器」两步合并到一个流程里。
> 深度原理与排错散见：`server/容器部署指导方案.md`、`server/DEPLOY_GUIDE.md`、`docs/RECOGNITION_TEST_PROTOCOL.md`。

---

## 0. 前置确认（本地已就绪，无需再改代码）

| 检查项 | 结论 | 说明 |
|--------|------|------|
| git 分支 | `main`，工作区干净 | 4 个关键 commit：`2866ae4`(识别MVP) `8be414d`(AdminTool) `6eb5f28`(大厅图) `473065b`(物种图) |
| 识别服务代码 | 就绪 | `server/` 含 `Dockerfile` / `docker-compose.yml` / `recognize_service.py` / `birdnet_engine.py` |
| CORS 白名单 | 已含生产域名 | `recognize_service.py` 的 `ALLOWED_ORIGINS` 已写死 `https://tinglai.dushiofcourses.cn` |
| 前端识别地址 | 已留空走同源 | 生产构建默认 `VITE_RECOGNIZE_API=` → 相对路径 `/api/recognize`，无需跨域 |
| `.env.example` | 存在 | 三种变量优先级 + 三种部署场景对照，照抄即可 |

**你只需做两件事**：① `git push` 把最新代码推上去；② 按下面步骤在服务器上部署。
（dist 被 git 忽略，不进仓库，所以服务器上的 dist 要本地 build 后上传，见第 1 步。）

---

## 1. 本地出包（你的机器上）

```bash
# 1) 拉最新
git pull origin main

# 2) 装依赖（仅首次或 package.json 变动时需要）
npm install

# 3) 构建生产产物（输出到 dist/）
npm run build
#    成功标志：✓ built in Xs，出现 dist/index.html / dist/assets/ / dist/photos/ / dist/audio/
```

> ⚠️ 必须 build 一次再上传。直接把源码传上去 nginx 是跑不起来的（那是 Vite 工程，不是静态站）。
> 想自检：打开 `dist/index.html` 看大小应 ~0.4KB，且 `dist/assets/` 里有 `.js`、`.css`，`dist/photos/` 有 46 张 jpg，`dist/audio/` 有 53 个 mp3。

---

## 2. 上传 dist 到服务器（静态站）

把 `dist/` 目录里的**全部内容**上传到服务器 Web 根目录（路径按你服务器实际约定，下面用 `/var/www/tinglai/` 举例）：

```bash
# 方式 A：scp（保持目录结构）
scp -r dist/* user@你的服务器IP:/var/www/tinglai/

# 方式 B：rsync（增量、推荐）
rsync -avz --delete dist/ user@你的服务器IP:/var/www/tinglai/
```

上传后服务器上应是：
```
/var/www/tinglai/
├── index.html
├── assets/      （js / css / npc-*.png|webp）
├── photos/      （46 张物种照片 .jpg）
└── audio/       （53 个 mp3）
```

> 注意：传的是 `dist/*` 内部，不要多套一层 `dist/` 目录。Web 根直接就是这些文件。

---

## 3. 部署识别容器（server/）

`server/` 在 git 里（不被忽略），`git pull` 后服务器上已经有了。在服务器执行：

```bash
cd server
docker compose up -d --build
# 首次会拉取基础镜像 + 下载 BirdNET 模型（约 50MB），日志可见进度
docker compose logs -f        # 观察直到出现「BirdNET 模型加载完成 / engine ready」
```

探活（服务器本机）：

```bash
curl -s http://127.0.0.1:8000/healthz
# 期望：{"status":"ok","engine":"ready","detail":"BirdNET 模型已加载"}
```

- 容器只绑 `127.0.0.1:8000`（不直连公网），外部流量走 nginx 反代 + HTTPS。
- 模型下载/加载较慢，**容器 `healthy` 之前**识别会返回 503 → 前端走兜底，这是预期、不是 bug。
- 常用：`docker compose ps`（看状态）、`docker compose down`（停止）、`docker compose restart`（改配置后重启）。

---

## 4. nginx 配置（关键：静态站 + /api/ 反代合一个 server 块）

在站点 server 块（域名 `tinglai.dushiofcourses.cn`）里配置。下面是可以直接用的完整片段：

```nginx
server {
    listen 443 ssl;
    server_name tinglai.dushiofcourses.cn;

    # —— 前端静态站（第 2 步上传的 dist 内容）——
    root /var/www/tinglai;
    index index.html;

    # 前端是 HashRouter（/#/...），任意路径都回 index.html 即可
    location / {
        try_files $uri $uri/ /index.html;
    }

    # —— 识别服务反代（前端相对路径 /api/recognize 落到这里）——
    location /api/ {
        proxy_pass http://127.0.0.1:8000/api/;   # 注意 location 与 proxy_pass 都带 /api/
        proxy_set_header Host              $host;
        proxy_set_header X-Real-IP         $remote_addr;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        client_max_body_size 25m;          # 音频可能十几 MB，别被默认 1MB 卡掉
        proxy_read_timeout  120s;          # 模型冷启动 + 推理可能要几十秒
        proxy_send_timeout  120s;
    }

    # 健康检查（可选，方便浏览器直接看状态）
    location /healthz {
        proxy_pass http://127.0.0.1:8000/healthz;
    }

    # SSL 证书按你服务器现有方式配（certbot / 已有证书均可）
}
```

```bash
sudo nginx -t && sudo systemctl reload nginx
```

> ⚠️ **路径对齐的关键**：`proxy_pass` 末尾**必须**带 `/api/`（与 `location /api/` 一致）。
> 若误写成 `proxy_pass http://127.0.0.1:8000/;`（末尾只有 `/`），nginx 会把前缀 `/api/` 剥掉，
> 后端实际收到 `/recognize` → 404。后端已为这种误配加了 `/recognize` 别名兜底，但**仍建议按上面写对**。

---

## 5. 推完服务器后验证（人测）

1. 浏览器打开 `https://tinglai.dushiofcourses.cn`。
2. 进入「识籁 / 录音」页，看右上角**服务状态徽章**：
   - `online` → 真识别可用；
   - `checking` → 正在探活（3s 超时）；
   - `offline` → 见第 6 步。
3. 点「上传」选一段清晰鸟鸣 mp3/wav，或「开始录音」录 5–15 秒鸟叫 → 点「识别」。
4. 预期三种结果之一（详见 `docs/RECOGNITION_TEST_PROTOCOL.md` §4）：
   - **命中科普卡**：识别到的物种在听籁库内 → 出可点详情的物种卡（带真实置信度）。
   - **诚实占位**：识别到但库内没收录、且置信 ≥0.5 → 标「暂未收录进听籁科普库」。
   - **离线示例结果**：蛙/虫/环境音无结果，或服务不可达/超时 → 明确标注「离线示例」（非真模型输出，属预期降级）。

---

## 6. 排错速查

| 现象 | 原因 | 处理 |
|------|------|------|
| 页面能开但识别一直转圈 → 给「离线示例/暂不可用」 | 容器 8000 没起 | `docker compose ps`；`curl 127.0.0.1:8000/healthz` |
| 徽章 `offline` 但本机 curl 正常 | 跨域被拦 | 来源应已在白名单；若用别的域名在 `docker-compose.yml` 加 `EXTRA_ORIGINS` 后重建 |
| 前端请求 404，路径里有两个 `/api/recognize` | `VITE_RECOGNIZE_API` 多写了后缀 | 只填到域名；改完**重新 build 再上传** |
| 后端日志 404（`/recognize`） | nginx `proxy_pass` 末尾误写 `/` | 改成 `proxy_pass http://127.0.0.1:8000/api/;` |
| 识别很慢（几十秒） | 模型冷启动/首次下载 | 已设 `WARMUP_ON_START=1`；`proxy_read_timeout` 已给 120s |
| 后端 503 `engine_not_ready` | 模型没下好/缺 ffmpeg | `docker compose logs` 看原因；Dockerfile 已含 ffmpeg |
| 上传 413 / 空结果 | nginx `client_max_body_size` 太小 | 第 4 步已设 25m，确认已 reload |

---

## 7. 推服务器需要的文件清单

| 文件/目录 | 来源 | 是否进 git | 用途 |
|-----------|------|-----------|------|
| `dist/` | 本地 `npm run build` 生成 | ❌ 忽略 | 前端静态站，上传到 Web 根 |
| `server/` | `git pull` 即得 | ✅ | 识别 Docker 容器，在服务器 `docker compose up` |
| `.env.example` | `git pull` 即得 | ✅ | 前端变量参考（生产同源场景不用改，留空即可） |

**最小操作步骤回顾**：本地 `git push` → 服务器 `git pull` → 本地/服务器 `npm run build` 拿 dist → 上传 dist 到 Web 根 → 服务器 `cd server && docker compose up -d --build` → 配 nginx（第 4 步）→ reload → 浏览器验证。

---

## 8. 关于 CloudStudio 预览（与服务器验证的关系）

- CloudStudio 是**纯静态站**，跑不了 Python 后端，所以那里永远走「本地启发式兜底」，UI 会标「离线示例结果」——这是预期，不是 bug。
- **真识别效果只能在你的服务器上验证**（按本手册部署容器后）。两者互不冲突，CloudStudio 仅作演示页，服务器才是真链路。
