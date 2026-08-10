"""压缩 public/assets 插画资源：PNG -> WebP，控制首屏体积。"""
import os
from PIL import Image

ASSETS = os.path.join(os.path.dirname(os.path.abspath(__file__)), "public", "assets")

# 目标最长边：背景图大一些，NPC/图标小一些
TARGETS = {
    "hall-bg.png": 1600,
    "icon-recognize.png": 512,
}
DEFAULT_MAX = 640  # NPC 精灵在页面上实际显示约 100-200px，640 足够 2x 高清

total_before = 0
total_after = 0
rows = []

for fname in sorted(os.listdir(ASSETS)):
    if not fname.lower().endswith(".png"):
        continue
    src = os.path.join(ASSETS, fname)
    before = os.path.getsize(src)
    total_before += before

    im = Image.open(src).convert("RGBA")
    max_side = TARGETS.get(fname, DEFAULT_MAX)
    w, h = im.size
    if max(w, h) > max_side:
        scale = max_side / max(w, h)
        im = im.resize((round(w * scale), round(h * scale)), Image.LANCZOS)

    out = os.path.join(ASSETS, fname[:-4] + ".webp")
    im.save(out, "WEBP", quality=82, method=6)
    after = os.path.getsize(out)
    total_after += after

    rows.append((fname, before, after, im.size))

print(f"{'文件':<34}{'原始':>10}{'压后':>10}{'降幅':>8}  尺寸")
for fname, before, after, size in rows:
    pct = (1 - after / before) * 100
    print(f"{fname:<34}{before/1024:>9.0f}K{after/1024:>9.0f}K{pct:>7.1f}%  {size[0]}x{size[1]}")

print("-" * 72)
print(f"合计: {total_before/1024/1024:.2f}MB -> {total_after/1024/1024:.2f}MB "
      f"(降 {(1-total_after/total_before)*100:.1f}%)")
