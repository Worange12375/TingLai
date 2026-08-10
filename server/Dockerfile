# 听籁 SoundVerse · 识别服务镜像
# 构建：docker build -t tinglai-recognize .
# 运行：docker run -p 8000:8000 tinglai-recognize
FROM python:3.11-slim

# ffmpeg：birdnetlib 解码 mp3/m4a/ogg/webm 的硬依赖，没有它只能读 wav
# libsndfile1：librosa/soundfile 读音频用
# curl：给 HEALTHCHECK 用
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        ffmpeg \
        libsndfile1 \
        curl \
    && rm -rf /var/lib/apt/lists/*

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1 \
    PORT=8000

WORKDIR /app

# 先装依赖再拷代码，改代码时能命中 Docker 层缓存
COPY requirements.txt .
RUN pip install --upgrade pip && pip install -r requirements.txt

COPY . .

EXPOSE 8000

# 模型首次加载可能要下载 ~50MB，给足 start-period
HEALTHCHECK --interval=30s --timeout=10s --start-period=180s --retries=3 \
    CMD curl -fsS http://127.0.0.1:8000/healthz || exit 1

# 单 worker：BirdNET 模型占内存且 TFLite 并发不安全，引擎层已做串行化。
# 需要更高吞吐就横向多起几个容器，别加 worker 数。
CMD ["uvicorn", "recognize_service:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1"]
