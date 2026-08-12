#!/usr/bin/env python3
# 排名测试音频的识别成功率：对每个物种的参考音频，打生产 /api/recognize，
# 看 BirdNET 是否把它正确识别为"它本身"（mapped==自身）以及置信度高低。
# 输出可直接用于"识籁页·评委测试音频下载"的候选清单。
import json, os, sys, urllib.request, urllib.error

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ENDPOINT = "https://tinglai.dushiofcourses.cn/api/recognize"
MIN_CONF = "0.10"

def norm(s: str) -> str:
    return s.strip().lower().replace("\s+", " ")

def build_map():
    raw = json.load(open(os.path.join(BASE, "src/data/recognition-map.json"), encoding="utf-8"))
    entries = raw.get("map", raw) if isinstance(raw, dict) else raw
    m = {}
    for k, v in entries.items():
        if k in ("version", "map", "$schema"):
            continue
        kk = norm(k)
        if not kk:
            continue
        if isinstance(v, str):
            m[kk] = v.strip()
        elif isinstance(v, dict):
            sid = v.get("speciesId", "")
            m[kk] = sid if isinstance(sid, str) else ""
            for a in v.get("aliases", []) or []:
                if isinstance(a, str) and a.strip():
                    m[norm(a)] = m[kk]
    return m

def post(audio_path: str):
    import io
    boundary = "----tinglai_rank"
    with open(audio_path, "rb") as f:
        data = f.read()
    body = (
        f"--{boundary}\r\n"
        f'Content-Disposition: form-data; name="audio"; filename="clip.mp3"\r\n'
        f"Content-Type: audio/mpeg\r\n\r\n"
    ).encode() + data + (
        f"\r\n--{boundary}\r\n"
        f'Content-Disposition: form-data; name="min_conf"\r\n\r\n{MIN_CONF}\r\n'
        f"--{boundary}\r\n"
        f'Content-Disposition: form-data; name="top_k"\r\n\r\n1\r\n'
        f"--{boundary}--\r\n"
    ).encode()
    req = urllib.request.Request(ENDPOINT, data=body, method="POST")
    req.add_header("Content-Type", f"multipart/form-data; boundary={boundary}")
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            return json.loads(r.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        return {"_error": e.read().decode("utf-8", "ignore")[:200]}
    except Exception as e:
        return {"_error": str(e)[:200]}

def top1(resp):
    if not isinstance(resp, dict):
        return None
    arr = resp.get("detections") or resp.get("results") or resp.get("predictions") or []
    if not arr:
        return None
    o = arr[0]
    sci = str(o.get("scientificName") or o.get("scientific_name") or o.get("sci_name") or "").strip()
    conf = float(o.get("confidence") or o.get("score") or 0)
    return (sci.split("_")[0], conf)

def main():
    species = json.load(open(os.path.join(BASE, "src/data/species.sample.json"), encoding="utf-8"))
    rmap = build_map()
    rows = []
    for s in species:
        sid = s.get("id")
        ap = os.path.join(BASE, "public/audio", f"{sid}.mp3")
        if not os.path.exists(ap):
            continue
        resp = post(ap)
        t = top1(resp)
        if not t:
            rows.append((sid, s.get("name"), s.get("group"), 0.0, None, "NO_HIT"))
            continue
        sci, conf = t
        mapped = rmap.get(norm(sci))
        flag = "SELF" if mapped == sid else ("KNOWN" if mapped else "UNCAT")
        rows.append((sid, s.get("name"), s.get("group"), conf, sci, flag))

    # 优先：鸟类 + 正确识别为自身 + 置信度高
    def score(r):
        sid, name, grp, conf, sci, flag = r
        if grp != "鸟类":
            return -1
        if flag == "SELF":
            return conf
        return -1

    birds = [r for r in rows if r[2] == "鸟类"]
    birds.sort(key=score, reverse=True)
    print(f"# 鸟类音频识别排名（共 {len(birds)} 个），按'正确识别为自身'且置信度降序")
    print(f"{'id':24} {'中文名':10} {'conf':6} {'flag':6} top1_scientific")
    for r in birds:
        sid, name, grp, conf, sci, flag = r
        print(f"{sid:24} {name:10} {conf:6.3f} {flag:6} {sci}")
    # 非鸟类的命中情况（仅供参考）
    print("\n# 非鸟类（蛙/虫）识别情况（BirdNET 不覆盖，预期空或误报）")
    for r in rows:
        if r[2] != "鸟类":
            print(f"{r[0]:24} {r[1]:10} {r[2]:6} {r[3]:6.3f} {r[5]:6} {r[4]}")

if __name__ == "__main__":
    main()
