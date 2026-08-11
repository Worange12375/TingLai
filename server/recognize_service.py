"""
听籁 SoundVerse · 声音识别 HTTP 服务
================================================

对外接口（前端 src/lib/recognize.ts 直接对接）：

    GET  /healthz          健康检查 → {"status":"ok", ...}
    POST /api/recognize    multipart 上传音频 → {"detections":[...]}

设计原则：
    · 服务永远起得来。模型没下好 / 缺 ffmpeg 都不影响进程启动，
      只是识别请求返回 503 + 中文原因，前端据此走本地兜底，页面不崩。
    · 推理是 CPU 密集型阻塞操作，丢到线程池执行，不卡住事件循环。
    · 上传文件落临时盘，识别完立刻删除，不在服务器留用户录音。

本地起服务：
    pip install -r requirements.txt
    uvicorn recognize_service:app --host 0.0.0.0 --port 8000
"""

from __future__ import annotations

import logging
import os
import tempfile
from contextlib import asynccontextmanager

from fastapi import FastAPI, File, Form, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.concurrency import run_in_threadpool

from birdnet_engine import (
    DEFAULT_MIN_CONF,
    AudioDecodeError,
    EngineNotReady,
    analyze_file,
    engine_status,
    warmup,
)

logging.basicConfig(
    level=os.getenv("LOG_LEVEL", "INFO").upper(),
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("tinglai.api")

# --------------------------------------------------------------------------- #
#                                    配置                                      #
# --------------------------------------------------------------------------- #

# 单次上传上限，与前端 audio.ts 的 MAX_SIZE 保持一致（20MB）
MAX_UPLOAD_BYTES = int(os.getenv("MAX_UPLOAD_MB", "20")) * 1024 * 1024

ALLOWED_SUFFIX = {".wav", ".mp3", ".m4a", ".ogg", ".webm", ".flac", ".aac", ".mp4"}

# 允许的前端来源。生产站 + 本地开发。额外来源用 EXTRA_ORIGINS 环境变量逗号分隔追加。
ALLOWED_ORIGINS = [
    "https://tinglai.dushiofcourses.cn",
    "http://tinglai.dushiofcourses.cn",
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:8000",
    "http://127.0.0.1:8000",
    "http://localhost:4173",  # vite preview
]
_extra = os.getenv("EXTRA_ORIGINS", "").strip()
if _extra:
    ALLOWED_ORIGINS += [o.strip() for o in _extra.split(",") if o.strip()]


@asynccontextmanager
async def lifespan(_app: FastAPI):
    """启动时后台预热模型；失败只告警，服务照常起（识别请求会返回 503）。"""
    logger.info("识别服务启动，允许来源：%s", ", ".join(ALLOWED_ORIGINS))
    if os.getenv("WARMUP_ON_START", "1") != "0":
        await run_in_threadpool(warmup)
    yield
    logger.info("识别服务已停止")


app = FastAPI(
    title="听籁 SoundVerse 识别服务",
    description="基于 BirdNET 的自然之声识别 API（智更鸟队自研编排层）",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=False,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
    max_age=86400,
)


# --------------------------------------------------------------------------- #
#                                  健康检查                                     #
# --------------------------------------------------------------------------- #


# 三个路径都指向同一个探针：
#   /healthz      标准路径（前端 probeService 默认探这个）
#   /api/healthz  当 nginx 只反代 /api/ 前缀、且不剥离前缀时可用
#   /health       习惯性写法，避免运维按经验写错导致探活失败
@app.get("/healthz")
@app.get("/api/healthz")
@app.get("/health")
async def healthz() -> dict:
    """存活探针。无论模型是否就绪都返回 200 + status ok，engine 字段体现模型状态。"""
    return {"status": "ok", **engine_status()}


@app.get("/")
async def root() -> dict:
    return {
        "service": "听籁 SoundVerse 识别服务",
        "endpoints": {"health": "GET /healthz", "recognize": "POST /api/recognize"},
    }


# --------------------------------------------------------------------------- #
#                                  识别接口                                     #
# --------------------------------------------------------------------------- #


def _err(status: int, message: str, code: str) -> JSONResponse:
    """统一错误体：前端只需读 message 就能直接显示给用户。"""
    return JSONResponse(
        status_code=status,
        content={"detections": [], "error": code, "message": message},
    )


# 两个路径都指向同一个识别处理：
#   /api/recognize     标准路径（前端默认 POST 这个）
#   /recognize         当 nginx 反代 /api/ 时误把前缀剥离掉了（proxy_pass 末尾带 /），
#                      后端实际收到 /recognize，这个别名能兜底，避免 404。
@app.post("/api/recognize")
@app.post("/recognize")
async def recognize(
    audio: UploadFile | None = File(default=None, description="音频文件，必填"),
    lat: str | None = Form(default=None, description="录制地纬度，可选"),
    lon: str | None = Form(default=None, description="录制地经度，可选"),
    date: str | None = Form(default=None, description="录制日期 YYYY-MM-DD，可选"),
    min_conf: str | None = Form(default=None, description=f"置信度下限，默认 {DEFAULT_MIN_CONF}"),
    top_k: str | None = Form(default=None, description="最多返回几个物种，默认 5"),
) -> JSONResponse:
    """
    识别上传音频里的物种。

    请求：multipart/form-data
        audio     文件      必填
        lat/lon   数字文本  可选，成对提供才生效（BirdNET 按地理位置过滤候选species）
        date      YYYY-MM-DD 可选（按季节过滤）
        min_conf  0~1       可选，默认 0.25

    响应 200：
        {"detections":[{"scientificName","commonName","confidence","lat","lon","date",
                        "startTime","endTime","hitCount"}, ...]}
    响应 400：未上传音频 / 空文件 / 超限 / 格式不支持
    响应 503：引擎未就绪（模型没下好、缺 ffmpeg、依赖缺失），message 里有中文原因
    """
    if audio is None or not audio.filename:
        return _err(400, "没有收到音频文件，请在 audio 字段上传一段录音。", "no_audio")

    suffix = os.path.splitext(audio.filename)[1].lower()
    if suffix and suffix not in ALLOWED_SUFFIX:
        return _err(
            400,
            f"暂不支持 {suffix} 格式，请上传 wav / mp3 / m4a / ogg / webm / flac。",
            "bad_format",
        )
    if not suffix:
        suffix = ".wav"

    tmp_path = ""
    try:
        # 落临时文件（birdnetlib 只吃文件路径），边写边统计大小
        fd, tmp_path = tempfile.mkstemp(suffix=suffix, prefix="tinglai_")
        written = 0
        with os.fdopen(fd, "wb") as fp:
            while chunk := await audio.read(1024 * 256):
                written += len(chunk)
                if written > MAX_UPLOAD_BYTES:
                    return _err(
                        400,
                        f"音频文件过大（上限 {MAX_UPLOAD_BYTES // 1024 // 1024}MB），请截取一段再上传。",
                        "too_large",
                    )
                fp.write(chunk)

        if written < 1024:
            return _err(400, "音频文件太小或为空，可能没有录到声音。", "empty_audio")

        logger.info(
            "识别请求：file=%s size=%.1fKB lat=%s lon=%s date=%s min_conf=%s",
            audio.filename, written / 1024, lat, lon, date, min_conf,
        )

        try:
            k = int(float(top_k)) if top_k else 5
        except (TypeError, ValueError):
            k = 5

        # 阻塞推理丢线程池
        detections = await run_in_threadpool(
            analyze_file,
            tmp_path,
            lat=lat,
            lon=lon,
            date=date,
            min_conf=min_conf,
            top_k=k,
        )

        logger.info("识别完成：命中 %d 个物种", len(detections))
        return JSONResponse(
            status_code=200,
            content={"detections": [d.to_dict() for d in detections]},
        )

    except EngineNotReady as exc:
        logger.error("引擎未就绪：%s", exc)
        return _err(503, str(exc), "engine_not_ready")
    except AudioDecodeError as exc:
        logger.warning("音频解码失败：%s", exc)
        return _err(400, str(exc), "decode_failed")
    except Exception as exc:  # 兜底，绝不让 500 裸奔
        logger.exception("识别服务未预期异常")
        return _err(503, f"识别服务内部异常：{exc}", "internal_error")
    finally:
        if tmp_path and os.path.exists(tmp_path):
            try:
                os.remove(tmp_path)  # 用户录音不留存
            except OSError:
                pass
        try:
            await audio.close()
        except Exception:
            pass


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "recognize_service:app",
        host=os.getenv("HOST", "0.0.0.0"),
        port=int(os.getenv("PORT", "8000")),
        reload=bool(os.getenv("RELOAD")),
    )
