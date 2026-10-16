#!/usr/bin/env python3
"""
從 PnP 9-up PDF 切出每張卡的圖片 (UI-04)。

用法:
    pip install pymupdf pillow
    python3 tools/crop_cards.py reference/9Up-NoBleed-A4.pdf public/cards [--dpi 200] [--overview 路徑]

- 讀 data/cards.json，每筆卡片依 page / row / col 切出，存成 <id>.webp。
- 一般頁：3x3 格，每格 180x252 pt，整組置中：x0 = (頁寬-540)/2，y0 = (頁高-756)/2。
- rotated: true 的卡 (Treachery) 在格子裡是轉 90° 印的；依卡內文字方向判斷轉向，轉正成橫向。
- skill_mat / skill_mat_back：每頁上下兩張墊子，row 0 = 上面那張。
- 另外輸出整頁的軌道墊／參考卡 (第 59–62 頁) 為 page59.webp …，成長畫面用。
- 最後做一張總覽圖 (每張卡縮圖 + id + 名稱) 供人工檢查。
"""
import argparse
import json
import os
import sys

import pymupdf
from PIL import Image, ImageDraw, ImageFont

CW, CH = 180.0, 252.0
GRID_W, GRID_H = 3 * CW, 3 * CH                     # 540 x 756
MAT_RECTS = [(45, 103, 550, 421), (45, 421, 550, 739)]  # 技能墊 row 0 / row 1 (pt)
MAT_TYPES = {"skill_mat", "skill_mat_back"}
FULL_PAGES = range(59, 63)                         # 成長/腐化軌道墊、參考卡


def card_rect(page, row, col):
    pw, ph = page.rect.width, page.rect.height
    x0 = (pw - GRID_W) / 2 + col * CW
    y0 = (ph - GRID_H) / 2 + row * CH
    return pymupdf.Rect(x0, y0, x0 + CW, y0 + CH)


def text_direction(page, rect):
    """回傳卡內多數文字的方向 (dx, dy)。(1,0) 正立；(0,-1) 往上讀；(0,1) 往下讀。"""
    votes = {}
    for b in page.get_text("dict", clip=rect)["blocks"]:
        for l in b.get("lines", []):
            d = (round(l["dir"][0]), round(l["dir"][1]))
            n = sum(len(s["text"].strip()) for s in l["spans"])
            votes[d] = votes.get(d, 0) + n
    return max(votes, key=votes.get) if votes else None


def render(page, rect, dpi):
    pix = page.get_pixmap(clip=rect, dpi=dpi, alpha=False)
    return Image.frombytes("RGB", (pix.width, pix.height), pix.samples)


def upright(img, direction):
    """把橫印的卡轉正。PIL rotate 正值為逆時針。"""
    if direction == (0, -1):        # 文字往上讀 = 卡片被逆時針轉 90° 印 -> 順時針轉回
        return img.rotate(-90, expand=True)
    if direction == (0, 1):         # 文字往下讀 = 卡片被順時針轉 90° 印 -> 逆時針轉回
        return img.rotate(90, expand=True)
    if direction == (-1, 0):
        return img.rotate(180, expand=True)
    return img


def overview(items, path, thumb_h=210, cols=16):
    """items: [(id, name, PIL.Image)]，做成總覽圖。"""
    pad, label_h = 8, 30
    cell_w = int(thumb_h * 1.6)                   # 容得下橫向卡與墊子
    cell_h = thumb_h + label_h
    rows = (len(items) + cols - 1) // cols
    sheet = Image.new("RGB", (cols * (cell_w + pad) + pad, rows * (cell_h + pad) + pad), (24, 26, 32))
    draw = ImageDraw.Draw(sheet)
    try:
        font = ImageFont.truetype("DejaVuSans.ttf", 13)
    except OSError:
        font = ImageFont.load_default()
    for i, (cid, name, img) in enumerate(items):
        r, c = divmod(i, cols)
        x, y = pad + c * (cell_w + pad), pad + r * (cell_h + pad)
        t = img.copy()
        t.thumbnail((cell_w, thumb_h))
        sheet.paste(t, (x + (cell_w - t.width) // 2, y + (thumb_h - t.height) // 2))
        draw.text((x + 2, y + thumb_h + 2), cid, fill=(227, 182, 92), font=font)
        draw.text((x + 2, y + thumb_h + 16), (name or "")[:34], fill=(237, 231, 216), font=font)
    sheet.save(path, quality=85)
    return sheet.size


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("pdf")
    ap.add_argument("outdir")
    ap.add_argument("--cards", default="data/cards.json")
    ap.add_argument("--dpi", type=int, default=200)
    ap.add_argument("--quality", type=int, default=86)
    ap.add_argument("--overview", default="docs/cards-overview.jpg")
    args = ap.parse_args()

    cards = json.load(open(args.cards, encoding="utf-8"))
    doc = pymupdf.open(args.pdf)
    os.makedirs(args.outdir, exist_ok=True)

    items, problems = [], []
    for card in cards:
        pno = card["page"]
        if pno > doc.page_count:
            problems.append(f"{card['id']}: PDF 只有 {doc.page_count} 頁")
            continue
        page = doc[pno - 1]                       # page 從 1 起算
        if card["type"] in MAT_TYPES:
            rect = pymupdf.Rect(*MAT_RECTS[card["row"]])
            img = render(page, rect, args.dpi)
        else:
            rect = card_rect(page, card["row"], card["col"])
            img = render(page, rect, args.dpi)
            if card.get("rotated"):
                d = text_direction(page, rect)
                if d is None or d == (1, 0):
                    problems.append(f"{card['id']}: rotated 但讀不到直排文字 (dir={d})，預設順時針轉正")
                    d = (0, -1)
                img = upright(img, d)
        img.save(os.path.join(args.outdir, f"{card['id']}.webp"), quality=args.quality, method=6)
        items.append((card["id"], card.get("name"), img))

    for pno in FULL_PAGES:
        if pno <= doc.page_count:
            img = render(doc[pno - 1], doc[pno - 1].rect, args.dpi)
            img.save(os.path.join(args.outdir, f"page{pno}.webp"), quality=args.quality, method=6)
            items.append((f"page{pno}", "full page", img))

    if args.overview:
        os.makedirs(os.path.dirname(args.overview) or ".", exist_ok=True)
        size = overview(items, args.overview)
        print(f"overview -> {args.overview} {size}")
    print(f"{len(items)} images -> {args.outdir}")
    for p in problems:
        print("WARN", p, file=sys.stderr)


if __name__ == "__main__":
    main()
