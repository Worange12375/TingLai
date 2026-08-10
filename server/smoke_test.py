"""
听籁 SoundVerse · 识别服务冒烟测试
================================================

不依赖 birdnetlib、不下载模型、不需要真音频，纯验证 HTTP 服务骨架：
健康检查、四种参数校验 400、引擎缺失 503 降级、CORS 白名单。

跑法（在 server/ 目录，装完 fastapi / uvicorn / python-multipart / httpx 后）：
    python smoke_test.py

预期最后一行输出 ALL_PASS，退出码 0。
本机没装 birdnetlib 时第 7 项会走 503 分支 —— 这正是要验证的降级行为：
引擎挂了服务也得活着，并给前端一句能直接显示给用户的中文原因。
"""
import io
import sys

from fastapi.testclient import TestClient

import recognize_service as svc

ok = True


def check(name, cond, extra=""):
    global ok
    print(f"{'PASS' if cond else 'FAIL'}  {name} {extra}")
    if not cond:
        ok = False


with TestClient(svc.app) as c:
    # 1. healthz
    r = c.get("/healthz")
    check("GET /healthz -> 200", r.status_code == 200, r.status_code)
    body = r.json()
    check("healthz status==ok", body.get("status") == "ok", body)
    check("healthz 带 engine 字段", "engine" in body, body.get("engine"))
    print("     engine detail:", body.get("detail", "")[:120])

    # 2. root
    r = c.get("/")
    check("GET / -> 200", r.status_code == 200)

    # 3. 无音频 -> 400
    r = c.post("/api/recognize", data={"lat": "23.1"})
    check("无音频 -> 400", r.status_code == 400, r.status_code)
    check("错误体含 message", bool(r.json().get("message")), r.json())
    check("错误体 detections=[]", r.json().get("detections") == [], r.json())

    # 4. 不支持的格式 -> 400
    r = c.post("/api/recognize", files={"audio": ("x.txt", io.BytesIO(b"a" * 4096), "text/plain")})
    check("坏格式 -> 400", r.status_code == 400, r.status_code)
    check("坏格式 code=bad_format", r.json().get("error") == "bad_format", r.json())

    # 5. 空/过小文件 -> 400
    r = c.post("/api/recognize", files={"audio": ("x.wav", io.BytesIO(b"RIFF"), "audio/wav")})
    check("过小文件 -> 400", r.status_code == 400, r.status_code)
    check("过小 code=empty_audio", r.json().get("error") == "empty_audio", r.json())

    # 6. 超大文件 -> 400
    big = io.BytesIO(b"\0" * (svc.MAX_UPLOAD_BYTES + 2048))
    r = c.post("/api/recognize", files={"audio": ("big.wav", big, "audio/wav")})
    check("超大文件 -> 400", r.status_code == 400, r.status_code)
    check("超大 code=too_large", r.json().get("error") == "too_large", r.json())

    # 7. 合法体积音频（本机无 birdnetlib）-> 503 engine_not_ready，且带中文 message
    r = c.post(
        "/api/recognize",
        files={"audio": ("clip.webm", io.BytesIO(b"\0" * 8192), "audio/webm")},
        data={"lat": "23.12", "lon": "113.26", "date": "2025-08-06", "min_conf": "0.3"},
    )
    check("引擎缺失 -> 503", r.status_code == 503, r.status_code)
    check("503 code=engine_not_ready", r.json().get("error") == "engine_not_ready", r.json().get("error"))
    check("503 带中文 message", bool(r.json().get("message")), "")
    check("503 detections=[]", r.json().get("detections") == [], "")
    print("     503 message:", r.json().get("message", "")[:140])

    # 8. CORS 预检
    r = c.options(
        "/api/recognize",
        headers={
            "Origin": "https://tinglai.dushiofcourses.cn",
            "Access-Control-Request-Method": "POST",
        },
    )
    allow = r.headers.get("access-control-allow-origin")
    check("生产站 CORS 放行", allow == "https://tinglai.dushiofcourses.cn", allow)

    r = c.options(
        "/api/recognize",
        headers={"Origin": "http://localhost:5173", "Access-Control-Request-Method": "POST"},
    )
    check("localhost:5173 CORS 放行", r.headers.get("access-control-allow-origin") == "http://localhost:5173",
          r.headers.get("access-control-allow-origin"))

    r = c.options(
        "/api/recognize",
        headers={"Origin": "https://evil.example.com", "Access-Control-Request-Method": "POST"},
    )
    check("陌生来源 CORS 拒绝", r.headers.get("access-control-allow-origin") is None,
          r.headers.get("access-control-allow-origin"))

print()
print("ALL_PASS" if ok else "HAS_FAILURE")
sys.exit(0 if ok else 1)
