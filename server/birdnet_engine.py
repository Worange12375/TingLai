"""
听籁 SoundVerse · BirdNET 识别引擎封装层
================================================

本模块是「听籁」自研的编排层，把 birdnetlib（开源推理库）包装成一个
**线程安全、懒加载、结果已聚合** 的引擎，供两个上层同时复用：

    recognize_service.py  →  HTTP API（给 Web 前端用）
    mcp_server.py         →  MCP 工具（给我们自己批量识别 / 调试用）

我们不训练模型，只做编排。引擎层负责的四件事：
    1. 懒加载 + 单例：BirdNET 模型约 50MB，首次调用才加载，之后常驻内存。
    2. 线程安全：TFLite 解释器不保证并发安全，统一用锁串行化推理。
    3. 结果聚合：BirdNET 按 3 秒窗口滑动输出，同一物种会重复出现几十次；
       我们按物种归并、取最高置信度、附带命中窗口数，输出干净的 Top-N。
    4. 优雅降级：缺 tflite-runtime / ffmpeg / 模型下载失败时抛 EngineNotReady，
       由上层转成 503 + 可读中文提示，绝不让服务直接崩掉。
"""

from __future__ import annotations

import logging
import os
import threading
from dataclasses import asdict, dataclass
from datetime import date as date_cls
from datetime import datetime
from typing import Any

logger = logging.getLogger("tinglai.engine")

# BirdNET 需要一个「无位置信息」的哨兵值：-1 表示不做地理过滤
NO_GEO = -1.0

DEFAULT_MIN_CONF = 0.25


class EngineNotReady(RuntimeError):
    """引擎不可用（依赖缺失 / 模型下载失败 / 初始化异常）。上层应转 503。"""


class AudioDecodeError(ValueError):
    """音频无法解码（格式不支持 / 文件损坏 / 缺 ffmpeg）。上层应转 400 或 503。"""


@dataclass(frozen=True)
class Detection:
    """归一化后的单条识别结果（对外 JSON 契约，字段名已锁定，勿改）。"""

    scientificName: str
    commonName: str
    confidence: float
    lat: float | None
    lon: float | None
    date: str | None
    # —— 以下为我们自己补充的编排信息，前端可选用 ——
    startTime: float | None = None   # 首次命中的窗口起点（秒）
    endTime: float | None = None     # 首次命中的窗口终点（秒）
    hitCount: int = 1                # 该物种在整段音频里被命中的 3 秒窗口数

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


# --------------------------------------------------------------------------- #
#                              懒加载单例 Analyzer                              #
# --------------------------------------------------------------------------- #

_analyzer: Any = None
_analyzer_error: str | None = None
_init_lock = threading.Lock()
# TFLite 解释器并发不安全，推理串行化（服务量级很小，够用）
_infer_lock = threading.Lock()


def _load_analyzer() -> Any:
    """首次调用时加载 BirdNET Analyzer（会自动下载 ~50MB 模型到用户目录）。"""
    global _analyzer, _analyzer_error

    if _analyzer is not None:
        return _analyzer
    if _analyzer_error is not None:
        # 已经失败过一次，直接复用错误信息，避免每个请求都重试几十秒
        raise EngineNotReady(_analyzer_error)

    with _init_lock:
        if _analyzer is not None:
            return _analyzer
        if _analyzer_error is not None:
            raise EngineNotReady(_analyzer_error)

        try:
            from birdnetlib.analyzer import Analyzer  # 延迟导入，缺依赖时才报错
        except Exception as exc:  # pragma: no cover - 依赖缺失路径
            _analyzer_error = (
                f"识别引擎依赖未安装（birdnetlib / tflite-runtime 导入失败）：{exc}。"
                "请在服务器执行 pip install -r requirements.txt，"
                "并确认系统已安装 ffmpeg。"
            )
            logger.error(_analyzer_error)
            raise EngineNotReady(_analyzer_error) from exc

        try:
            logger.info("正在加载 BirdNET 模型（首次运行会下载约 50MB，请耐心等待）…")
            _analyzer = Analyzer()
            logger.info("BirdNET 模型加载完成，识别引擎就绪。")
            return _analyzer
        except Exception as exc:
            _analyzer_error = (
                f"BirdNET 模型加载失败：{exc}。"
                "常见原因：容器无法访问外网下载模型、磁盘空间不足、"
                "或缺少系统 ffmpeg。可先手动预热模型后再启动服务。"
            )
            logger.error(_analyzer_error)
            raise EngineNotReady(_analyzer_error) from exc


def warmup() -> None:
    """主动预热模型。容器启动后调一次可以避免首个请求超时。失败只记日志不抛。"""
    try:
        _load_analyzer()
    except EngineNotReady as exc:
        logger.warning("引擎预热失败（服务仍会启动，识别请求将返回 503）：%s", exc)


def engine_status() -> dict[str, Any]:
    """给 /healthz 用的引擎状态快照，不会触发模型加载。"""
    if _analyzer is not None:
        return {"engine": "ready", "detail": "BirdNET 模型已加载"}
    if _analyzer_error is not None:
        return {"engine": "error", "detail": _analyzer_error}
    return {"engine": "lazy", "detail": "模型尚未加载，首次识别请求时按需加载"}


# --------------------------------------------------------------------------- #
#                                  参数归一化                                   #
# --------------------------------------------------------------------------- #


def parse_date(value: str | None) -> date_cls | None:
    """解析 YYYY-MM-DD / YYYY/MM/DD；空值或非法格式返回 None（不报错，退化成不按季节过滤）。"""
    if not value:
        return None
    raw = str(value).strip()
    if not raw:
        return None
    for fmt in ("%Y-%m-%d", "%Y/%m/%d", "%Y%m%d"):
        try:
            return datetime.strptime(raw, fmt).date()
        except ValueError:
            continue
    # 兼容前端直接传 ISO 时间戳
    try:
        return datetime.fromisoformat(raw.replace("Z", "+00:00")).date()
    except ValueError:
        logger.warning("无法解析 date=%r，本次识别不做季节过滤", value)
        return None


def _coerce_coord(value: float | str | None, limit: float) -> float:
    """经纬度归一化：None / 空 / 超范围 → NO_GEO（-1，表示不做地理过滤）。"""
    if value is None or value == "":
        return NO_GEO
    try:
        num = float(value)
    except (TypeError, ValueError):
        return NO_GEO
    if num == NO_GEO:
        return NO_GEO
    if not (-limit <= num <= limit):
        logger.warning("坐标 %s 超出范围 ±%s，忽略地理过滤", num, limit)
        return NO_GEO
    return num


def _coerce_min_conf(value: float | str | None) -> float:
    try:
        num = float(value) if value not in (None, "") else DEFAULT_MIN_CONF
    except (TypeError, ValueError):
        num = DEFAULT_MIN_CONF
    return min(max(num, 0.01), 0.99)


# --------------------------------------------------------------------------- #
#                                   核心推理                                    #
# --------------------------------------------------------------------------- #


def _aggregate(raw_detections: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """
    BirdNET 按 3 秒窗口滑动输出，同一物种往往重复几十条。
    这里按 scientific_name 归并：保留最高置信度那条的时间戳，并统计命中窗口数。
    """
    merged: dict[str, dict[str, Any]] = {}
    for det in raw_detections:
        sci = str(det.get("scientific_name") or "").strip()
        common = str(det.get("common_name") or "").strip()
        key = (sci or common).lower()
        if not key:
            continue
        conf = float(det.get("confidence") or 0.0)
        cur = merged.get(key)
        if cur is None:
            merged[key] = {
                "scientific_name": sci or common,
                "common_name": common or sci,
                "confidence": conf,
                "start_time": det.get("start_time"),
                "end_time": det.get("end_time"),
                "hit_count": 1,
            }
        else:
            cur["hit_count"] += 1
            if conf > cur["confidence"]:
                cur["confidence"] = conf
                cur["start_time"] = det.get("start_time")
                cur["end_time"] = det.get("end_time")

    out = list(merged.values())
    out.sort(key=lambda d: d["confidence"], reverse=True)
    return out


def analyze_file(
    audio_path: str,
    *,
    lat: float | str | None = None,
    lon: float | str | None = None,
    date: str | None = None,
    min_conf: float | str | None = None,
    top_k: int = 5,
) -> list[Detection]:
    """
    识别一个本地音频文件，返回按置信度降序、已按物种去重的 Detection 列表。

    :param audio_path: 本地音频绝对路径（wav/mp3/m4a/ogg/flac/webm，解码依赖系统 ffmpeg）
    :param lat/lon:    录制地经纬度，缺省或非法 → 不做地理过滤
    :param date:       录制日期 YYYY-MM-DD，缺省 → 不做季节过滤
    :param min_conf:   置信度下限，默认 0.25，会被夹到 [0.01, 0.99]
    :param top_k:      最多返回几个物种（我们前端只用 Top-3，默认给 5 留余量）
    :raises EngineNotReady: 引擎/模型不可用
    :raises AudioDecodeError: 音频无法解码
    """
    if not os.path.isfile(audio_path):
        raise AudioDecodeError(f"音频文件不存在：{audio_path}")

    analyzer = _load_analyzer()

    lat_v = _coerce_coord(lat, 90.0)
    lon_v = _coerce_coord(lon, 180.0)
    conf_v = _coerce_min_conf(min_conf)
    date_v = parse_date(date)
    # 经纬度必须成对提供才有意义，只给一个就整体退化
    if lat_v == NO_GEO or lon_v == NO_GEO:
        lat_v = lon_v = NO_GEO

    try:
        from birdnetlib import Recording
    except Exception as exc:  # pragma: no cover
        raise EngineNotReady(f"birdnetlib 导入失败：{exc}") from exc

    kwargs: dict[str, Any] = {"min_conf": conf_v}
    if lat_v != NO_GEO:
        kwargs["lat"] = lat_v
        kwargs["lon"] = lon_v
    if date_v is not None:
        kwargs["date"] = date_v

    with _infer_lock:  # TFLite 解释器串行化
        try:
            # 原样把音频路径交给 birdnetlib 解码分析，不做任何降噪/重采样/格式转换；
            # 用户上传的就是最原始的录音信号（前端也已关闭 AGC/降噪/回声消除）。
            recording = Recording(analyzer, audio_path, **kwargs)
            recording.analyze()
            raw = list(recording.detections or [])
        except EngineNotReady:
            raise
        except Exception as exc:
            msg = str(exc).lower()
            if any(k in msg for k in ("ffmpeg", "audioread", "decode", "soundfile", "format")):
                raise AudioDecodeError(
                    f"音频解码失败：{exc}。请确认文件未损坏，且服务器已安装 ffmpeg。"
                ) from exc
            raise EngineNotReady(f"识别过程异常：{exc}") from exc

    aggregated = _aggregate(raw)[: max(1, top_k)]

    iso_date = date_v.isoformat() if date_v else None
    return [
        Detection(
            scientificName=d["scientific_name"],
            commonName=d["common_name"],
            confidence=round(float(d["confidence"]), 4),
            lat=None if lat_v == NO_GEO else lat_v,
            lon=None if lon_v == NO_GEO else lon_v,
            date=iso_date,
            startTime=d.get("start_time"),
            endTime=d.get("end_time"),
            hitCount=int(d.get("hit_count", 1)),
        )
        for d in aggregated
    ]
