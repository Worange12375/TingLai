#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
为「听籁 SoundVerse」非大厅物种批量抓取 Wikimedia Commons 的 CC 授权自然照片。

- 数据源：Wikimedia Commons（CC 授权 / 公有领域；与本项目音频一致，接受 CC BY / BY-SA / BY-NC / CC0 / PD）
- 仅处理 species.sample.json 中【非 NPC】的物种（NPC 7 只用 AI 绘本图，不动）
- 下载 900px 缩略图到 public/photos/<id>.jpg
- 输出署名清单到 src/data/photo-attribution.json
- 自带断点续跑：已存在且 >8KB 的照片跳过下载
- 反错配：要求候选图标题至少命中物种的一个名称 token（属名/种加词/中文名/英文名），
  并硬性排除图书图版、标本、地图等明显非目标内容，避免抓到错误物种（如蝴蝶图版）。
- 注：本环境 urllib 的 SSL 握手会超时，故统一用 curl 发起网络请求。

用法：python scripts/fetch_photos.py
"""
import json
import os
import re
import subprocess
import time

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SPECIES_JSON = os.path.join(ROOT, "src", "data", "species.sample.json")
PHOTO_DIR = os.path.join(ROOT, "public", "photos")
ATTR_JSON = os.path.join(ROOT, "src", "data", "photo-attribution.json")
PROGRESS_LOG = os.path.join(ROOT, "scripts", "_fetch_progress.log")

# 自然大厅 NPC（AI 绘本图，本脚本不处理）
NPC_IDS = {
    "hoopoe", "oriole", "eurasian-tree-sparrow", "barn-swallow",
    "eurasian-magpie", "common-frog", "cicada",
}

UA = "SoundVerseBot/1.0 (https://github.com/Worange12375/TingLai; contact: team@soundverse.example)"
API = "https://commons.wikimedia.org/w/api.php"
THUMB_W = 900
DELAY = 0.2  # 礼貌性限速
GSR_LIMIT = 20

# 标题硬排除（无论是否命中 token，一律不要）
TITLE_HARD = [
    "map", "range", "distribution", "skeleton", "skull", "diagram",
    "egg", "footprint", "track", "fossil", "coprolite",
]
# 图书图版 / 标本 / 插画类：命中即重罚，避免错配到非照片/错误物种
BOOK_BAD = [
    "book", "plate", "engraving", "lithograph", "scan", "naturalhistory",
    "handcolour", "hand colour", "woodcut", "herbarium", "butterfl", "moth",
    "beetle", "specimen", "mount", "taxidermy", "fig.", "tab.", "page ",
    "illustration", "drawing", "painting",
]

# 英文名 token（帮助匹配以英文名命名的照片；昆虫多用学名以保证精确）
EN_COMMON = {
    "spotted-dove": "spotted dove",
    "chinese-blackbird": "chinese blackbird",
    "light-vented-bulbul": "light-vented bulbul",
    "cinereous-tit": "cinereous tit",
    "azure-winged-magpie": "azure-winged magpie",
    "common-cuckoo": "common cuckoo",
    "indian-cuckoo": "indian cuckoo",
    "white-breasted-waterhen": "white-breasted waterhen",
    "chinese-hwamei": "hwamei",
    "crested-ibis": "crested ibis",
    "red-crowned-crane": "red-crowned crane",
    "asiatic-toad": "asiatic toad",
    "chinese-tree-frog": "chinese tree frog",
    "chinese-bullfrog": "chinese bullfrog",
    "huigu-cicada": "platypleura kaempferi",
    "field-cricket": "velarifictorus micado",
    "weaver-katydid": "mecopoda niponensis",
    "common-kingfisher": "common kingfisher",
    "white-wagtail": "white wagtail",
    "crested-myna": "crested myna",
    "red-billed-blue-magpie": "red-billed blue magpie",
    "eurasian-jay": "eurasian jay",
    "oriental-scops-owl": "oriental scops owl",
    "long-tailed-shrike": "long-tailed shrike",
    "daurian-redstart": "daurian redstart",
    "swinhoe-white-eye": "swinhoe white-eye",
    "black-drongo": "black drongo",
    "oriental-turtle-dove": "oriental turtle dove",
    "large-billed-crow": "large-billed crow",
    "black-faced-bunting": "black-faced bunting",
    "yellow-bellied-tit": "yellow-bellied tit",
    "black-throated-tit": "black-throated tit",
    "oriental-magpie-robin": "oriental magpie-robin",
    "common-moorhen": "common moorhen",
    "red-whiskered-bulbul": "red-whiskered bulbul",
    "ornate-pygmy-frog": "microhyla fissipes",
    "paddy-frog": "fejervarya multistriata",
    "spot-legged-tree-frog": "polypedates megacephalus",
    "boreal-digging-frog": "kaloula borealis",
    "zhenhai-brown-frog": "rana zhenhaiensis",
    "black-spectacled-toad": "duttaphrynus melanostictus",
    "mongolian-cicada": "meimuna mongolica",
    "robust-cicada": "hyalessa maculaticollis",
    "oriental-mole-cricket": "gryllotalpa orientalis",
    "emma-field-cricket": "teleogryllus emma",
    "chinese-katydid": "gampsocleis gratiosa",
}


def norm(s):
    """归一成无空格无连字符的小写串，便于稳健子串匹配。"""
    return re.sub(r"[\s\-_.]", "", (s or "").lower())


def lic_key(lic):
    return norm(lic)


def lic_ok(lic):
    """接受 CC BY / BY-SA / BY-NC / CC0 / 公有领域 / GFDL；排除 ND（禁止演绎）。"""
    key = lic_key(lic)
    if not key:
        return False
    if "nd" in key:  # 禁止演绎不可用
        return False
    return any(k in key for k in ["ccby", "cc0", "publicdomain", "gfdl", "cczero", "freeart"])


def normalize_lic(lic):
    key = lic_key(lic)
    if "cc0" in key or "publicdomain" in key or "cczero" in key:
        return "CC0 / Public Domain"
    if "ccbysa" in key:
        return "CC BY-SA"
    if "ccby" in key:
        return "CC BY"  # 含 CC BY / CC BY-NC
    if "gfdl" in key:
        return "GFDL"
    return lic or "Unknown"


def tokens_for(sid, sci, zh):
    toks = set()
    parts = (sci or "").split()
    if len(parts) >= 2:
        toks.add(norm(parts[0]))      # 属名
        toks.add(norm(parts[1]))      # 种加词
    toks.add(norm(zh))                # 中文名
    en = EN_COMMON.get(sid)
    if en:
        toks.add(norm(en))            # 英文名
    toks.update(norm(t) for t in TOKEN_EXTRA.get(sid, []))  # 额外俗名/学名 token
    toks.discard("")
    return toks


# 额外搜索词（同物异名 / 俗名），用于补抓主查询缺失的物种
QUERY_FALLBACK = {
    "paddy-frog": ["Fejervarya limnocharis", "泽陆蛙", "Fejervarya multistriata"],
    "chinese-katydid": ["Gampsocleis gratiosa", "优雅蝈螽", "蝈蝈"],
    "common-cuckoo": ["Cuculus canorus", "Common cuckoo"],
}

# 额外名称 token（俗名 / 学名），提高外文标题照片的命中率
TOKEN_EXTRA = {
    "chinese-katydid": ["蝈蝈", "gampsocleisgratiosa"],
}


def score_candidate(cand, toks):
    t = norm(cand["title"])
    s = 0
    for tok in toks:
        if tok and tok in t:
            s += 1
    for bad in BOOK_BAD:
        if bad in t:
            s -= 5
    return s


def log(msg):
    print(msg, flush=True)
    try:
        with open(PROGRESS_LOG, "a", encoding="utf-8") as f:
            f.write(msg + "\n")
    except Exception:
        pass


# Wikimedia TLS 在本环境偶发握手失败（curl exit 35），用 --retry 自动重试解决
CURL_RETRY = ["--retry", "4", "--retry-delay", "1", "--retry-all-errors"]


def curl_json(url, max_time=25):
    try:
        p = subprocess.run(
            ["curl", "-s", *CURL_RETRY, "--max-time", str(max_time), "-A", UA, url],
            capture_output=True, text=True, timeout=max_time + 30,
        )
        if p.returncode != 0 or not p.stdout.strip():
            return None
        return json.loads(p.stdout)
    except Exception as e:
        log(f"    [curl ERR] {e}")
        return None


def strip_tags(html):
    if not html:
        return ""
    return re.sub(r"\s+", " ", re.sub(r"<[^>]+>", "", html)).strip()


def search_images(query, limit=GSR_LIMIT):
    from urllib.parse import urlencode
    params = {
        "action": "query",
        "generator": "search",
        "gsrsearch": query,
        "gsrnamespace": "6",
        "gsrlimit": str(limit),
        "prop": "imageinfo",
        "iiprop": "url|mime|size|extmetadata",
        "iiurlwidth": str(THUMB_W),
        "format": "json",
    }
    url = API + "?" + urlencode(params)
    data = curl_json(url)
    if not data:
        return []
    pages = (data.get("query") or {}).get("pages") or {}
    out = []
    for p in pages.values():
        ii = (p.get("imageinfo") or [{}])[0]
        if not ii:
            continue
        em = ii.get("extmetadata") or {}
        out.append({
            "title": p.get("title", ""),
            "url": ii.get("url", ""),
            "thumburl": ii.get("thumburl", ""),
            "width": ii.get("width", 0),
            "height": ii.get("height", 0),
            "mime": ii.get("mime", ""),
            "lic": (em.get("LicenseShortName") or {}).get("value", ""),
            "artist": strip_tags((em.get("Artist") or {}).get("value", "")),
            "descurl": ii.get("descriptionurl", ""),
        })
    return out


def pick_best(cands, toks):
    """严格按名称 token 命中选取（属名/种加词/中文名/英文名/俗名），
    避免错配到无关图片（如以动物命名的大门、外文标题的近似物种等）。
    无 token 命中则返回 None（交由上层标记 pending 或换查询）。"""
    best = None
    best_score = 0
    for c in cands:
        low = norm(c["title"])
        if any(k in low for k in TITLE_HARD):
            continue
        if c["mime"] != "image/jpeg":
            continue
        if c["width"] < 400:
            continue
        if not lic_ok(c["lic"]):
            continue
        sc = score_candidate(c, toks)
        if sc < 1:  # 必须至少命中一个名称 token
            continue
        # 清晰度加权：宽度越大略加分
        sc2 = sc + min(c["width"], 4000) / 4000.0
        if best is None or sc2 > best_score:
            best = c
            best_score = sc2
    return best


def download(url, dest, max_time=60):
    p = subprocess.run(
        ["curl", "-s", *CURL_RETRY, "--max-time", str(max_time), "-A", UA, "-o", dest, url],
        capture_output=True, timeout=max_time + 30,
    )
    return p.returncode == 0 and os.path.exists(dest) and os.path.getsize(dest) > 8000


def main():
    if os.path.exists(PROGRESS_LOG):
        os.remove(PROGRESS_LOG)
    os.makedirs(PHOTO_DIR, exist_ok=True)
    with open(SPECIES_JSON, encoding="utf-8") as f:
        species = json.load(f)

    targets = [s for s in species if s.get("id") not in NPC_IDS]
    log(f"非 NPC 物种共 {len(targets)} 只，开始抓取…\n")

    attribution = {}
    pending = []
    ok = 0

    for s in targets:
        sid = s["id"]
        sci = s.get("scientific", "")
        zh = s.get("name", "")
        toks = tokens_for(sid, sci, zh)
        # 查询顺序：学名 → 中文名 → 英文名 → 额外同物异名/俗名
        en = EN_COMMON.get(sid, "")
        queries = [q for q in [sci, zh, en] if q]
        queries += [q for q in QUERY_FALLBACK.get(sid, []) if q]
        dest = os.path.join(PHOTO_DIR, f"{sid}.jpg")

        picked = None
        used_query = None
        for q in queries:
            cands = search_images(q)
            best = pick_best(cands, toks)
            if best:
                picked = best
                used_query = q
                break

        if not picked:
            pending.append(sid)
            log(f"  [PENDING] {sid} ({zh}/{sci}) 未找到合适免费授权照片")
            time.sleep(DELAY)
            continue

        if os.path.exists(dest) and os.path.getsize(dest) > 8000:
            size = os.path.getsize(dest)
            log(f"  [SKIP]    {sid} 已存在 ({size//1024}KB) -> {picked['title']}")
        else:
            if not download(picked["thumburl"] or picked["url"], dest):
                pending.append(sid)
                log(f"  [ERR]     {sid} 下载失败")
                time.sleep(DELAY)
                continue
            size = os.path.getsize(dest)

        attribution[sid] = {
            "speciesId": sid,
            "name": zh,
            "scientific": sci,
            "photoUrl": f"/photos/{sid}.jpg",
            "author": picked["artist"] or "Wikimedia Commons contributor",
            "license": normalize_lic(picked["lic"]),
            "licenseRaw": picked["lic"],
            "sourceFile": picked["title"].replace("File:", ""),
            "sourceUrl": picked["descurl"],
            "width": picked["width"],
            "height": picked["height"],
            "queryUsed": used_query,
        }
        ok += 1
        log(f"  [OK]      {sid} ({size//1024}KB) lic={normalize_lic(picked['lic'])} <- {picked['title']}")
        time.sleep(DELAY)

    with open(ATTR_JSON, "w", encoding="utf-8") as f:
        json.dump(attribution, f, ensure_ascii=False, indent=2)

    log(f"\n=== 完成 ===")
    log(f"成功: {ok}  待补(pending): {len(pending)}")
    if pending:
        log("PENDING 列表: " + ", ".join(pending))
    log(f"署名清单已写入: {os.path.relpath(ATTR_JSON, ROOT)}")


if __name__ == "__main__":
    main()
