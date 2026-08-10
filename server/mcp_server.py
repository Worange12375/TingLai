"""
听籁 SoundVerse · BirdNET MCP 服务器
================================================

把同一套 birdnet_engine 引擎再包一层 MCP（Model Context Protocol），
这样我们团队自己的 AI 助手可以直接调工具批量识别 / 调试映射表，
不用起 HTTP、不用写 curl。

与 recognize_service.py 共用 birdnet_engine.py，模型只有一份实现，
HTTP 侧和 MCP 侧行为完全一致，不存在两套逻辑对不上的问题。

暴露的工具：
    recognize_audio(audio_path, lat?, lon?, date?, min_conf?, top_k?)
        → 识别单个本地音频文件
    recognize_batch(audio_paths, ...)
        → 批量识别，用于给 recognition-map.json 做回归验证
    engine_health()
        → 查引擎/模型状态

本地运行（stdio 传输，供 MCP 客户端拉起）：
    pip install -r requirements.txt
    python mcp_server.py

在 MCP 客户端（如 Claude Desktop / WorkBuddy）里的配置示例：
    {
      "mcpServers": {
        "tinglai-birdnet": {
          "command": "python",
          "args": ["/绝对路径/SoundVerse/server/mcp_server.py"]
        }
      }
    }
"""

from __future__ import annotations

import logging
import os
import sys
from typing import Any

# MCP 的 stdio 传输会把 stdout 当协议通道，日志必须走 stderr，否则会污染协议
logging.basicConfig(
    level=os.getenv("LOG_LEVEL", "INFO").upper(),
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    stream=sys.stderr,
)
logger = logging.getLogger("tinglai.mcp")

try:
    from mcp.server.fastmcp import FastMCP
except ImportError:  # pragma: no cover
    sys.stderr.write(
        "未安装 MCP SDK。请执行：pip install \"mcp[cli]\"\n"
        "（MCP 包装是加分项，不影响 recognize_service.py 的 HTTP 主流程）\n"
    )
    raise

from birdnet_engine import (
    AudioDecodeError,
    EngineNotReady,
    analyze_file,
    engine_status,
)

mcp = FastMCP("tinglai-birdnet")

# 与 HTTP 侧一致的返回契约
_OK = "ok"
_ERR = "error"


def _run_one(
    audio_path: str,
    lat: float | None,
    lon: float | None,
    date: str | None,
    min_conf: float | None,
    top_k: int,
) -> dict[str, Any]:
    """跑一个文件，把异常收敛成结构化结果，绝不向 MCP 客户端抛裸异常。"""
    try:
        detections = analyze_file(
            audio_path,
            lat=lat,
            lon=lon,
            date=date,
            min_conf=min_conf,
            top_k=top_k,
        )
        return {
            "status": _OK,
            "audioPath": audio_path,
            "detections": [d.to_dict() for d in detections],
        }
    except EngineNotReady as exc:
        return {"status": _ERR, "audioPath": audio_path, "code": "engine_not_ready",
                "message": str(exc), "detections": []}
    except AudioDecodeError as exc:
        return {"status": _ERR, "audioPath": audio_path, "code": "decode_failed",
                "message": str(exc), "detections": []}
    except Exception as exc:  # pragma: no cover
        logger.exception("识别失败：%s", audio_path)
        return {"status": _ERR, "audioPath": audio_path, "code": "internal_error",
                "message": str(exc), "detections": []}


@mcp.tool()
def recognize_audio(
    audio_path: str,
    lat: float | None = None,
    lon: float | None = None,
    date: str | None = None,
    min_conf: float = 0.25,
    top_k: int = 5,
) -> dict[str, Any]:
    """
    识别一个本地音频文件里的鸟类物种（BirdNET 引擎）。

    Args:
        audio_path: 音频文件的绝对路径（wav/mp3/m4a/ogg/flac/webm，需系统 ffmpeg 解码）
        lat: 录制地纬度，可选。与 lon 成对提供才生效，用于按地理位置收窄候选物种
        lon: 录制地经度，可选
        date: 录制日期 YYYY-MM-DD，可选，用于按季节收窄候选物种
        min_conf: 置信度下限，默认 0.25，范围 0.01~0.99
        top_k: 最多返回几个物种，默认 5

    Returns:
        {"status":"ok","audioPath":...,"detections":[
            {"scientificName","commonName","confidence","lat","lon","date",
             "startTime","endTime","hitCount"}, ...]}
        失败时 status="error"，并带 code / message，detections 为空数组。
    """
    return _run_one(audio_path, lat, lon, date, min_conf, top_k)


@mcp.tool()
def recognize_batch(
    audio_paths: list[str],
    lat: float | None = None,
    lon: float | None = None,
    date: str | None = None,
    min_conf: float = 0.25,
    top_k: int = 3,
) -> dict[str, Any]:
    """
    批量识别多个本地音频文件。主要用途：给 recognition-map.json 的
    「拉丁学名 → 我们的 speciesId」映射做回归验证，一次跑完 22 条样本音频。

    Args:
        audio_paths: 音频文件绝对路径列表（建议单次不超过 50 个）
        lat: 录制地纬度，可选
        lon: 录制地经度，可选
        date: 录制日期 YYYY-MM-DD，可选
        min_conf: 置信度下限，默认 0.25
        top_k: 每个文件最多返回几个物种，默认 3（与前端 Top-3 对齐）

    Returns:
        {"total":N,"succeeded":M,"results":[<与 recognize_audio 相同的结构>, ...]}
    """
    paths = [p for p in (audio_paths or []) if str(p).strip()][:50]
    results = [_run_one(p, lat, lon, date, min_conf, top_k) for p in paths]
    return {
        "total": len(results),
        "succeeded": sum(1 for r in results if r["status"] == _OK),
        "results": results,
    }


@mcp.tool()
def engine_health() -> dict[str, Any]:
    """
    查询 BirdNET 引擎状态，不会触发模型加载。

    Returns:
        {"status":"ok","engine":"ready|lazy|error","detail":"..."}
        engine=lazy 表示模型尚未加载（首次识别时按需加载）；
        engine=error 时 detail 里是中文失败原因（通常是缺 ffmpeg 或模型下载失败）。
    """
    return {"status": _OK, **engine_status()}


if __name__ == "__main__":
    logger.info("听籁 BirdNET MCP 服务器启动（stdio 传输）")
    mcp.run()
