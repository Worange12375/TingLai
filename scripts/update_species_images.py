#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
根据 public/photos 下实际抓到的照片，回写 species.sample.json：
- 非 NPC 物种：若 public/photos/<id>.jpg 存在(>8KB)，
    * image 改为 /photos/<id>.jpg
    * 追加 photoSource（完整署名行）与 photoLicense（归一化授权）
- NPC 物种：image 保持 /assets/npc-<id>.webp 不变
- 未抓到的物种（pending）：image 与署名保持原状，由前端 onError 退回剪影占位

同时依赖 scripts/fetch_photos.py 产出的 src/data/photo-attribution.json 取署名信息。
用法：python scripts/update_species_images.py
"""
import json
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SPECIES_JSON = os.path.join(ROOT, "src", "data", "species.sample.json")
PHOTO_DIR = os.path.join(ROOT, "public", "photos")
ATTR_JSON = os.path.join(ROOT, "src", "data", "photo-attribution.json")

NPC_IDS = {
    "hoopoe", "oriole", "eurasian-tree-sparrow", "barn-swallow",
    "eurasian-magpie", "common-frog", "cicada",
}


def main():
    with open(SPECIES_JSON, encoding="utf-8") as f:
        species = json.load(f)

    attr = {}
    if os.path.exists(ATTR_JSON):
        with open(ATTR_JSON, encoding="utf-8") as f:
            attr = json.load(f)

    updated_img = 0
    added_attr = 0
    pending = []
    npc_untouched = 0

    for s in species:
        sid = s.get("id")
        if sid in NPC_IDS:
            npc_untouched += 1
            continue
        photo_path = os.path.join(PHOTO_DIR, f"{sid}.jpg")
        if os.path.exists(photo_path) and os.path.getsize(photo_path) > 8000:
            s["image"] = f"/photos/{sid}.jpg"
            updated_img += 1
            a = attr.get(sid)
            if a:
                s["photoSource"] = (
                    f"Wikimedia Commons · {a.get('sourceFile','')} · "
                    f"作者 {a.get('author','')} · {a.get('license','')} · "
                    f"来源 {a.get('sourceUrl','')}"
                )
                s["photoLicense"] = a.get("license", "")
                added_attr += 1
        else:
            pending.append(sid)

    with open(SPECIES_JSON, "w", encoding="utf-8") as f:
        json.dump(species, f, ensure_ascii=False, indent=2)
        f.write("\n")

    print(f"更新 image 字段: {updated_img} 只")
    print(f"追加 photoSource/photoLicense: {added_attr} 只")
    print(f"NPC 物种保持不动: {npc_untouched} 只")
    print(f"pending(无照片): {len(pending)} 只 -> {', '.join(pending) if pending else '无'}")
    print(f"已写回: {os.path.relpath(SPECIES_JSON, ROOT)}")


if __name__ == "__main__":
    main()
