#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
听籁 SoundVerse — 识别接口压测 / 回归验证脚本

用途
----
把本地 public/audio/ 的真实音频 POST 到线上（或本地）识别接口，检查三件事：
  1. BirdNET 引擎是否真的识别出物种（而不是前端在走本地兜底）
  2. 返回的学名能否命中 src/data/recognition-map.json（映射层是否有缺口）
  3. 音频质量劣化时置信度如何衰减（决定 min_conf 阈值该设多少）

为什么需要它
------------
前端在识别服务返回空结果时会切「本地启发式兜底」，UI 上很像"AI 在瞎猜"，
但根因可能在任意一层（容器没起 / nginx 没反代 / 阈值太严 / 学名没映射）。
这个脚本直接打后端接口，跳过前端，一次性把责任层定位清楚。

用法
----
  # 1) 基础巡检：抽样若干鸟鸣，看引擎与映射层是否正常
  python scripts/probe_recognition.py

  # 2) 指定接口与阈值（排查"是不是阈值太严"）
  python scripts/probe_recognition.py --base https://tinglai.dushiofcourses.cn --min-conf 0.10

  # 3) 全量跑完 53 条音频，输出映射缺口报告
  python scripts/probe_recognition.py --all

  # 4) 鲁棒性测试：模拟"对着音箱外放再录一遍"，看置信度衰减曲线
  #    （需要 ffmpeg；没有系统 ffmpeg 时自动用 pip 包 imageio-ffmpeg 自带的二进制）
  python scripts/probe_recognition.py --degrade hoopoe

依赖
----
  curl（系统自带即可）；--degrade 额外需要 ffmpeg 或 `pip install imageio-ffmpeg`
"""

from __future__ import annotations

import argparse
import json
import os
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
AUDIO_DIR = ROOT / "public" / "audio"
SPECIES_JSON = ROOT / "src" / "data" / "species.sample.json"
MAP_JSON = ROOT / "src" / "data" / "recognition-map.json"
OUT_DIR = ROOT / ".rectest"

DEFAULT_BASE = "https://tinglai.dushiofcourses.cn"

# 默认巡检样本：挑选叫声辨识度高、覆盖不同科属的鸟种，外加蛙/虫各一作为阴性对照
# （BirdNET 只覆盖鸟类，蛙虫返回空属于预期行为，不是故障）
DEFAULT_SAMPLE = [
    "common-cuckoo",          # 大杜鹃：叫声极典型，引擎自检基准
    "hoopoe",                 # 戴胜
    "barn-swallow",           # 家燕
    "eurasian-magpie",        # 喜鹊（注意引擎可能返回 Pica serica 而非 Pica pica）
    "oriole",                 # 黑枕黄鹂
    "chinese-hwamei",         # 画眉
    "common-kingfisher",      # 普通翠鸟
    "cicada",                 # 阴性对照：昆虫，预期空
    "common-frog",            # 阴性对照：蛙类，预期空
]

# 音频劣化档位：模拟用户在不同条件下录音（混响 / 音量衰减 / 手机麦克风频响限制）
# 用于回答"用户二次录音时置信度会掉到多少"，据此决定 min_conf
DEGRADE_PRESETS = {
    "light": (
        "近距离手机直录",
        "aecho=0.9:0.85:40:0.25,highpass=f=120,lowpass=f=11000,volume=0.7",
    ),
    "medium": (
        "1米外音箱外放再录",
        "aecho=0.85:0.9:80|150:0.4|0.28,highpass=f=200,lowpass=f=8500,volume=0.45",
    ),
    "heavy": (
        "房间远距离外放+底噪",
        "aecho=0.8:0.92:100|180|300:0.5|0.38|0.25,highpass=f=280,lowpass=f=7000,volume=0.28",
    ),
}


# --------------------------------------------------------------------------- #
#                                  基础设施                                    #
# --------------------------------------------------------------------------- #


def load_map() -> dict[str, str]:
    """读 recognition-map，返回 {小写学名: speciesId}，便于大小写不敏感比对。"""
    raw = json.loads(MAP_JSON.read_text(encoding="utf-8"))
    entries = raw.get("map", raw) if isinstance(raw, dict) else raw
    out: dict[str, str] = {}
    for key, val in entries.items():
        sid = val if isinstance(val, str) else (val or {}).get("speciesId", "")
        if sid:
            out[key.strip().lower()] = sid
    return out


def load_species_names() -> dict[str, str]:
    """读物种库，返回 {speciesId: 中文名}，用于把结果打印成人能看懂的样子。"""
    data = json.loads(SPECIES_JSON.read_text(encoding="utf-8"))
    return {x["id"]: x.get("name", x["id"]) for x in data if x.get("id")}


def find_ffmpeg() -> str | None:
    """优先系统 ffmpeg；没有则回退到 imageio-ffmpeg 自带的静态二进制。"""
    sys_ff = shutil.which("ffmpeg")
    if sys_ff:
        return sys_ff
    try:
        import imageio_ffmpeg  # type: ignore

        return imageio_ffmpeg.get_ffmpeg_exe()
    except Exception:
        return None


def post_audio(base: str, audio_path: Path, min_conf: float, top_k: int) -> dict:
    """用 curl POST 一段音频到 /api/recognize，返回解析后的 JSON。

    用 curl 而不是 requests，是为了零第三方依赖——这个脚本要能在任何机器上直接跑。
    """
    OUT_DIR.mkdir(exist_ok=True)
    tmp_out = OUT_DIR / "_probe_response.json"
    cmd = [
        "curl", "-s", "-X", "POST", f"{base.rstrip('/')}/api/recognize",
        "-F", f"audio=@{audio_path};type=audio/mpeg",
        "-F", f"min_conf={min_conf}",
        "-F", f"top_k={top_k}",
        "-o", str(tmp_out),
        "-w", "%{http_code}",
    ]
    proc = subprocess.run(cmd, capture_output=True, text=True, timeout=120)
    code = (proc.stdout or "").strip()
    if not tmp_out.exists():
        return {"_http": code, "_error": "no response body", "detections": []}
    try:
        body = json.loads(tmp_out.read_text(encoding="utf-8"))
    except Exception as exc:
        return {"_http": code, "_error": f"bad json: {exc}", "detections": []}
    body["_http"] = code
    return body


def check_health(base: str) -> tuple[bool, str]:
    """探活：识别服务是否在线、模型是否加载完成。"""
    proc = subprocess.run(
        ["curl", "-s", "-m", "15", f"{base.rstrip('/')}/healthz"],
        capture_output=True, text=True,
    )
    raw = (proc.stdout or "").strip()
    if not raw:
        return False, "无响应（容器未起？nginx 未反代？）"
    try:
        data = json.loads(raw)
    except Exception:
        return False, f"响应非 JSON：{raw[:120]}"
    ready = data.get("engine") == "ready"
    return ready, f"engine={data.get('engine')} detail={data.get('detail', '')}"


# --------------------------------------------------------------------------- #
#                                  巡检模式                                    #
# --------------------------------------------------------------------------- #


def run_survey(base: str, ids: list[str], min_conf: float, top_k: int) -> int:
    """对一批音频跑识别，并对照 recognition-map 报告命中情况。"""
    rmap = load_map()
    names = load_species_names()

    print(f"接口     : {base}/api/recognize")
    print(f"min_conf : {min_conf}   top_k: {top_k}")
    print(f"样本数   : {len(ids)}")
    print("-" * 96)
    print(f"{'音频(期望物种)':<34} {'引擎返回学名':<26} {'置信':>6}  映射结果")
    print("-" * 96)

    stat = {"empty": 0, "hit": 0, "miss": 0, "wrong": 0, "error": 0}
    gaps: list[tuple[str, str, float]] = []  # 映射缺口：学名在库外

    for sid in ids:
        path = AUDIO_DIR / f"{sid}.mp3"
        label = f"{sid}({names.get(sid, '?')})"
        if not path.exists():
            print(f"{label:<34} {'-- 音频文件不存在 --':<26}")
            stat["error"] += 1
            continue

        try:
            resp = post_audio(base, path, min_conf, top_k)
        except Exception as exc:
            print(f"{label:<34} 请求失败: {exc}")
            stat["error"] += 1
            continue

        dets = resp.get("detections") or []
        if not dets:
            note = resp.get("message", "") or "（引擎未检出，蛙/虫属预期）"
            print(f"{label:<34} {'[空]':<26} {'':>6}  {note[:34]}")
            stat["empty"] += 1
            continue

        top = dets[0]
        sci = top.get("scientificName", "?")
        conf = float(top.get("confidence") or 0)
        mapped = rmap.get(sci.strip().lower())

        if not mapped:
            verdict = "MISS 库外物种 → 走诚实占位"
            stat["miss"] += 1
            gaps.append((sid, sci, conf))
        elif mapped == sid:
            verdict = f"HIT → {mapped} ✓ 与期望一致"
            stat["hit"] += 1
        else:
            verdict = f"HIT → {mapped}（期望 {sid}，物种判断偏离）"
            stat["wrong"] += 1

        print(f"{label:<34} {sci:<26} {conf:>6.3f}  {verdict}")

    print("-" * 96)
    total = len(ids)
    print(
        f"汇总: 命中且正确 {stat['hit']} | 命中但偏离 {stat['wrong']} | "
        f"库外(诚实占位) {stat['miss']} | 引擎空结果 {stat['empty']} | 异常 {stat['error']} / 共 {total}"
    )

    if gaps:
        print("\n映射缺口（引擎能识别但本地科普库没有，可考虑补物种或补 recognition-map 键）:")
        for sid, sci, conf in gaps:
            print(f"  {sci:<30} conf={conf:.3f}   来自音频 {sid}")

    if stat["empty"] == total:
        print(
            "\n[警告] 全部返回空结果。优先检查：容器是否在跑、模型是否加载完成、"
            "min_conf 是否过高（试 --min-conf 0.05）。"
        )
    return 0


# --------------------------------------------------------------------------- #
#                              鲁棒性（劣化）模式                                #
# --------------------------------------------------------------------------- #


def run_degrade(base: str, sid: str, min_conf: float, top_k: int) -> int:
    """把一段干净音频做多档劣化，测置信度衰减曲线，用于校准 min_conf。"""
    src = AUDIO_DIR / f"{sid}.mp3"
    if not src.exists():
        print(f"[错误] 音频不存在：{src}")
        return 1

    ffmpeg = find_ffmpeg()
    if not ffmpeg:
        print("[错误] 找不到 ffmpeg。装一个：pip install imageio-ffmpeg")
        return 1

    OUT_DIR.mkdir(exist_ok=True)
    names = load_species_names()
    rmap = load_map()

    print(f"基准音频 : {sid}({names.get(sid, '?')})")
    print(f"接口     : {base}/api/recognize    min_conf={min_conf}（建议设 0.05 观察引擎真实感知）")
    print("-" * 92)
    print(f"{'录音条件':<24} {'引擎返回学名':<26} {'置信':>6}  判定")
    print("-" * 92)

    cases: list[tuple[str, Path]] = [("原始文件（基准）", src)]
    for key, (desc, af) in DEGRADE_PRESETS.items():
        dst = OUT_DIR / f"{sid}__sim_{key}.mp3"
        proc = subprocess.run(
            [ffmpeg, "-y", "-v", "error", "-i", str(src), "-af", af,
             "-ac", "1", "-ar", "44100", "-b:a", "128k", str(dst)],
            capture_output=True, text=True,
        )
        if proc.returncode != 0 or not dst.exists():
            print(f"{desc:<24} -- ffmpeg 生成失败：{(proc.stderr or '')[:40]}")
            continue
        cases.append((desc, dst))

    rows: list[tuple[str, float | None]] = []
    for desc, path in cases:
        try:
            resp = post_audio(base, path, min_conf, top_k)
        except Exception as exc:
            print(f"{desc:<24} 请求失败: {exc}")
            continue
        dets = resp.get("detections") or []
        if not dets:
            print(f"{desc:<24} {'[空]':<26} {'':>6}  引擎在此条件下无检出")
            rows.append((desc, None))
            continue
        top = dets[0]
        sci = top.get("scientificName", "?")
        conf = float(top.get("confidence") or 0)
        mapped = rmap.get(sci.strip().lower())
        ok = "物种判断正确" if mapped == sid else f"偏离（映射到 {mapped or '库外'}）"
        print(f"{desc:<24} {sci:<26} {conf:>6.3f}  {ok}")
        rows.append((desc, conf))

    print("-" * 92)
    got = [c for _, c in rows if c is not None]
    if got:
        print(
            f"置信度区间: {min(got):.3f} ~ {max(got):.3f}\n"
            f"阈值建议  : min_conf 应低于最差条件下的置信度（当前最差 {min(got):.3f}），"
            f"否则正确答案会被一刀切掉、前端误判为「没找到」并降级到本地兜底。\n"
            f"            降低阈值必须配合 UI 展示置信度分级，诚实告知可信度。"
        )
    print(f"劣化样本已留在 {OUT_DIR}（该目录已在 .gitignore 中，不入库）")
    return 0


# --------------------------------------------------------------------------- #
#                                    入口                                      #
# --------------------------------------------------------------------------- #


def main() -> int:
    ap = argparse.ArgumentParser(
        description="听籁识别接口压测 / 回归验证",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    ap.add_argument("--base", default=DEFAULT_BASE, help=f"接口基址（默认 {DEFAULT_BASE}）")
    ap.add_argument("--min-conf", type=float, default=0.10, help="置信度下限（默认 0.10）")
    ap.add_argument("--top-k", type=int, default=5, help="每条最多返回几个物种（默认 5）")
    ap.add_argument("--all", action="store_true", help="跑全部 public/audio 音频，输出映射缺口报告")
    ap.add_argument("--only", nargs="+", metavar="ID", help="只跑指定 speciesId（可多个）")
    ap.add_argument("--degrade", metavar="ID", help="对指定音频做多档劣化，测置信度衰减曲线")
    ap.add_argument("--skip-health", action="store_true", help="跳过探活直接压测")
    args = ap.parse_args()

    if not args.skip_health:
        ready, detail = check_health(args.base)
        flag = "在线" if ready else "异常"
        print(f"[探活] {args.base}/healthz → {flag}  {detail}")
        if not ready:
            print(
                "       识别服务不可用，压测无意义。先在服务器上确认：\n"
                "         cd server && docker compose ps\n"
                "         curl -s http://127.0.0.1:8000/healthz\n"
                "       若本机正常但外网 404，检查 nginx 是否配了 /api/ 与 /healthz 反代。"
            )
            return 1
        print()

    if args.degrade:
        return run_degrade(args.base, args.degrade, args.min_conf, args.top_k)

    if args.only:
        ids = args.only
    elif args.all:
        ids = sorted(p.stem for p in AUDIO_DIR.glob("*.mp3"))
    else:
        ids = DEFAULT_SAMPLE

    return run_survey(args.base, ids, args.min_conf, args.top_k)


if __name__ == "__main__":
    sys.exit(main())
