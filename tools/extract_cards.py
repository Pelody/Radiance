#!/usr/bin/env python3
"""
Radiance PnP -> card database (JSON)

用法:
    pip install pymupdf english-words opencv-python-headless numpy
    python3 extract_cards.py <9Up-NoBleed-A4.pdf> <規則書.pdf> <輸出目錄>

讀取 PnP 卡片 PDF 的文字層 (圖示以 xxName 代碼呈現)，切成單張卡片，
依卡片種類解析欄位，輸出 cards.json。XP 獎勵是印在圖片上的金幣，
用影像偵測計數。
"""
import json, re, sys, os
from collections import defaultdict
import pymupdf
import numpy as np
from PIL import Image

CW, CH = 180.0, 252.0          # 單張卡片尺寸 (pt)，9-up 無出血
DPI = 200                      # 偵測 XP 金幣用的點陣解析度
TOKEN = re.compile(r"xx([A-Za-z0-9]+)")

# 頁面版型：哪些頁是 2 張墊子 / 整頁 / 略過 (指示物)
MAT_PAGES = range(51, 59)      # 每頁上下兩張技能墊 (正面) 或其背面
FULL_PAGES = range(59, 63)     # 成長/腐化軌道墊、參考卡
SKIP_PAGES = range(63, 69)     # 指示物

LUMINARIES = {"Courage", "Justice", "Temperance", "Wisdom"}
PROFESSIONS = {"Hunter", "Mender", "Scorchwright", "Wayfarer"}
ENEMY_CLASS = {"Dusk", "Doom", "Shade", "Shadow"}


# ---------------------------------------------------------------- 文字層
def page_spans(page):
    """回傳頁面所有 span：文字、字型、大小、方向、中心點。"""
    out = []
    for b in page.get_text("dict")["blocks"]:
        for l in b.get("lines", []):
            d = l["dir"]
            for s in l["spans"]:
                t = s["text"]
                if not t.strip():
                    continue
                x0, y0, x1, y1 = s["bbox"]
                font = s["font"].split("+")[-1]
                out.append(dict(text=t, font=font, size=round(s["size"], 1),
                                dir=(round(d[0]), round(d[1])),
                                bbox=(x0, y0, x1, y1),
                                cx=(x0 + x1) / 2, cy=(y0 + y1) / 2,
                                origin=s["origin"]))
    return out


def to_frame(sp, region):
    """把 span 轉成「卡片正立時」的座標 (左上為 0,0)。處理旋轉 90° 的卡。"""
    rx0, ry0, rx1, ry1 = region
    dx, dy = sp["dir"]
    ox, oy = sp["origin"]
    if (dx, dy) == (1, 0):
        return ox - rx0, oy - ry0
    if (dx, dy) == (0, -1):     # 文字朝上 -> 卡片逆時針轉 90°
        return ry1 - oy, ox - rx0
    if (dx, dy) == (0, 1):
        return oy - ry0, rx1 - ox
    return rx1 - ox, ry1 - oy


def clean(t):
    t = t.replace("\u00a0", " ").replace("ﬁ", "fi").replace("ﬂ", "fl")
    t = TOKEN.sub(lambda m: "{" + m.group(1) + "}", t)
    return t


def build_lines(spans, region):
    """把 span 依正立座標分行，回傳 [{y, x, size, italic, text, parts}]。"""
    items = []
    for sp in spans:
        fx, fy = to_frame(sp, region)
        x0, y0, x1, y1 = sp["bbox"]
        ext = (x1 - x0) if sp["dir"][1] == 0 else (y1 - y0)
        if sp["font"] != "Radiance":
            ext = ext - (len(sp["text"]) - len(sp["text"].rstrip())) * sp["size"] * 0.25
        items.append(dict(sp, fx=fx, fy=fy, ext=ext))
    items.sort(key=lambda s: (s["fy"], s["fx"]))
    lines = []
    dedup = []
    for it in items:   # 部分文字有重複的描邊層，去除位置與內容相同者
        if any(o["text"] == it["text"] and abs(o["fx"] - it["fx"]) < 1 and abs(o["fy"] - it["fy"]) < 1 for o in dedup):
            continue
        dedup.append(it)
    items = dedup
    for it in items:
        # 圖示字型的基線比內文高約 2pt，用 4pt 容差合併
        for ln in lines:
            if abs(ln["y"] - it["fy"]) <= 4.0 and _x_overlap_ok(ln, it):
                ln["parts"].append(it)
                break
        else:
            lines.append(dict(y=it["fy"], parts=[it]))
    for ln in lines:
        ln["parts"].sort(key=lambda s: s["fx"])
        txt, prev_end = "", None
        for p in ln["parts"]:
            seg = p["text"]
            if p["font"] == "Radiance":
                seg = " " + seg.strip() + " "
            elif prev_end is not None and p["fx"] - prev_end > 1.5 and not seg.startswith(" "):
                seg = " " + seg
            txt += seg
            prev_end = p["fx"] + p["ext"]
        txt = clean(txt)
        txt = re.sub(r"\s+", " ", txt).strip()
        txt = re.sub(r"\s+([,.;:)])", r"\1", txt)
        txt = re.sub(r"\(\s+", "(", txt)
        ln["text"] = txt
        ln["x"] = ln["parts"][0]["fx"]
        textparts = [p for p in ln["parts"] if p["font"] != "Radiance"]
        ln["size"] = max((p["size"] for p in textparts), default=0)
        ln["italic"] = bool(textparts) and all("Italic" in p["font"] for p in textparts)
        ln["bold"] = any("Bold" in p["font"] or "Semibold" in p["font"] for p in textparts)
    lines.sort(key=lambda l: (round(l["y"]), l["x"]))
    return lines


def _x_overlap_ok(ln, it):
    return True


def tokens(text):
    return re.findall(r"\{([A-Za-z0-9]+)\}", text)


# ---------------------------------------------------------------- 區域
def regions_for_page(pn, page):
    W, H = page.rect.width, page.rect.height
    if pn in SKIP_PAGES:
        return []
    if pn in FULL_PAGES:
        return [("page", 0, 0, (0, 0, W, H))]
    if pn in MAT_PAGES:
        return [("mat", r, 0, (0, r * H / 2, W, (r + 1) * H / 2)) for r in range(2)]
    x0, y0 = (W - 3 * CW) / 2, (H - 3 * CH) / 2
    return [("cell", r, c, (x0 + c * CW, y0 + r * CH, x0 + (c + 1) * CW, y0 + (r + 1) * CH))
            for r in range(3) for c in range(3)]


def spans_in(spans, region):
    x0, y0, x1, y1 = region
    return [s for s in spans if x0 <= s["cx"] < x1 and y0 <= s["cy"] < y1]


# ---------------------------------------------------------------- XP 金幣
from coins import count_coins     # 樣板比對 (coin_template.png)


# ---------------------------------------------------------------- 分類
def classify(kind, lines, pn, rot):
    alltext = " ".join(l["text"] for l in lines)
    top = [l for l in lines if l["y"] < 32]
    toptoks = set(t for l in top for t in tokens(l["text"]))
    if kind == "mat":
        return "skill_mat" if pn % 2 == 1 else "skill_mat_back"
    if kind == "page":
        return "track_or_reference"
    if rot:
        return "treachery"
    if "Quest Requirement" in alltext:
        return "limited_quest"
    if "Companion" in toptoks:
        return "companion"
    if "Defense" in toptoks and any(re.fullmatch(r"\+\d+", l["text"]) for l in lines):
        return "player_card"
    if lines and lines[0]["text"].startswith("{Shade}"):
        return "shade_back"
    if "Meddle:" in alltext or "Intervene:" in alltext:
        return "shadow_meddler"
    big = [l for l in lines if l["size"] >= 14 and re.fullmatch(r"\d+", l["text"])]
    if (not toptoks & {"Fast", "Slow"}) and any(l["y"] < 32 and l["x"] > 130 for l in big) \
            and any(110 < l["y"] < 165 and l["x"] < 80 for l in big):
        return "location"
    if toptoks & {"Fast", "Slow"}:
        return "enemy"
    if lines and re.search(r"\d+\s*,\s*\d+$", lines[0]["text"]):
        return "baron_encounter"
    if "Special Victory Condition" in alltext:
        return "side_quest"
    if len(lines) > 1 and lines[1]["italic"]:
        return "side_quest"      # 背面配對後可能改判為 baron_reward / limited_quest_reward
    return "other"


# ---------------------------------------------------------------- 欄位解析
def title_of(lines, ymin=0, ymax=999):
    cands = [l for l in lines if ymin <= l["y"] <= ymax and not l["italic"]
             and re.search(r"[A-Za-z]{3}", l["text"]) and l["size"] >= 12]
    return cands[0]["text"] if cands else None


def split_effects(text_lines):
    """把效果文字以效果類型圖示切成多段。"""
    EFFECT_ICONS = {"1x", "Passive", "Unrestricted", "Mandatory1x", "MandatoryUnrestricted",
                    "Eager1x", "EagerUnrestricted", "EagerPassive", "EagerMandatory1x",
                    "EagerMandatoryUnrestricted", "PassiveAlone", "1xAlone", "UnrestrictedAlone",
                    "Exhaust", "Flip", "Destroy"}
    effects, cur = [], None
    for l in text_lines:
        t = l["text"]
        m = re.match(r"\{([A-Za-z0-9]+)\}\s*(.*)", t)
        if m and m.group(1) in EFFECT_ICONS:
            cur = dict(type=m.group(1), italic=l["italic"], text=re.sub(r"^:\s*", "", m.group(2)))
            effects.append(cur)
        elif cur is None:
            cur = dict(type=None, italic=l["italic"], text=t)
            effects.append(cur)
        else:
            cur["text"] = (cur["text"] + " " + t).strip()
    for e in effects:
        e["text"] = fix_words(e["text"])
    return effects


VOCAB, _RB, RB_WORDS = set(), "", set()
LIG = {"fi", "fl", "ff", "th", "ffi", "ffl"}


def load_vocab(rulebook_pdf):
    """英文字典 (english-words 套件) + 規則書用字，用來修復斷字。"""
    global VOCAB, _RB, RB_WORDS
    from english_words import get_english_words_set
    rb = pymupdf.open(rulebook_pdf)
    _RB = re.sub(r"\s+", " ", " ".join(p.get_text() for p in rb))
    RB_WORDS = set(re.findall(r"[A-Za-z]+", _RB))
    VOCAB = get_english_words_set(["web2"], lower=True) | {w.lower() for w in RB_WORDS}


JOIN_LOG = {}


def _known(w):
    w = w.lower()
    if w in VOCAB:
        return True
    for suf, rep in (("ies", "y"), ("ves", "f"), ("es", ""), ("s", ""), ("ed", ""), ("ed", "e"),
                     ("ing", ""), ("ing", "e"), ("er", ""), ("ly", "")):
        if w.endswith(suf) and len(w) > len(suf) + 2 and (w[: -len(suf)] + rep) in VOCAB:
            return True
    return False


def fix_words(t):
    """修正連字 (fi/ff/Th) 與字距造成的斷字，例: "Th e" "eff ect" "Assas sin"。
    規則：兩段合併後是英文單字，且其中一段本身不是單字 (或屬連字/字尾特例)。"""
    words = t.split(" ")
    out, i = [], 0
    while i < len(words):
        w = words[i]
        if i + 1 < len(words):
            n = words[i + 1]
            a = re.sub(r"^[^A-Za-z]+", "", w)
            b = re.match(r"[a-z]+", n)
            if a and b and re.fullmatch(r"[A-Za-z]+", a):
                b = b.group()
                joined = a + b
                ok = False
                if joined in RB_WORDS and (a + " " + b) not in _RB:
                    ok = True
                elif _known(joined) and (not _known(a) or not _known(b) or a.lower() in LIG
                                         or b in ("ion", "ions")):
                    ok = True
                if ok:
                    JOIN_LOG[(a + " " + b)] = JOIN_LOG.get(a + " " + b, 0) + 1
                    words[i + 1] = w + n
                    i += 1
                    continue
        out.append(w)
        i += 1
    return re.sub(r"\s+", " ", " ".join(out)).strip()


def num(t):
    m = re.search(r"[-+]?\d+", t)
    return int(m.group()) if m else None


def parse_player(lines):
    top = [l for l in lines if l["y"] < 32]
    toprow = " ".join(l["text"] for l in sorted(top, key=lambda l: l["x"]))
    # 格式: 攻擊 {類型} 光費 防禦{Defense} 探索
    m = re.match(r"(\d+)\s*\{(Physical|Photonic)\}\s*(\d+)\s*(\d+)\s*\{Defense\}\s*(\d+)", toprow)
    d = dict(attack=None, attack_type=None, light_cost=None, defense=None, explore=None)
    if m:
        d.update(attack=int(m[1]), attack_type=m[2], light_cost=int(m[3]),
                 defense=int(m[4]), explore=int(m[5]))
    else:
        d["_toprow_raw"] = toprow
    side = [l for l in lines if 32 <= l["y"] < 140]
    owner = element = None
    boosters = []
    for l in side:
        tk = tokens(l["text"])
        if l["x"] > 120 and tk and tk[0] in LUMINARIES | PROFESSIONS:
            owner = tk[0]
        elif l["x"] < 40 and tk and not re.search(r"\d", l["text"]):
            element = tk[0]
        elif re.fullmatch(r"\+\d+", l["text"]):
            boosters.append(num(l["text"]))
    d["owner"] = owner
    d["element"] = element
    d["attack_booster"] = boosters[0] if len(boosters) > 0 else None
    d["explore_booster"] = boosters[1] if len(boosters) > 1 else None
    d["name"] = title_of(lines, 140, 165)
    tl = [l for l in lines if 160 <= l["y"] < 178 and l["italic"]]
    d["traits"] = parse_traits(" ".join(l["text"] for l in tl))
    if not tl:   # Wayfarer 的特質是地形圖示
        il = [l for l in lines if 160 <= l["y"] < 182 and l["text"] and
              re.fullmatch(r"(\{\w+\}\s*)+", l["text"])]
        if il:
            d["traits"] = tokens(il[0]["text"])
            tl = il[:1]
    body = [l for l in lines if l["y"] >= 175 and not (l in tl)]
    d["effects"] = split_effects(body)
    return d


def parse_traits(t):
    t = fix_words(t)
    return [x.strip() for x in t.split(".") if x.strip()]


def top_parts(lines, ymax=32):
    parts = [p for l in lines if l["y"] < ymax for p in l["parts"]]
    out = []
    for p in sorted(parts, key=lambda p: p["fx"]):
        t = p["text"].strip()
        if t:
            out.append((p["fx"], p["font"], clean(t)))
    return out


def as_val(t):
    return int(t) if t.isdigit() else t


def parse_enemy(lines):
    d = {}
    tp = top_parts(lines)
    vals = [(x, t) for x, f, t in tp if f != "Radiance" and re.fullmatch(r"[\dX]+", t)]
    icons = [(x, t.strip("{}")) for x, f, t in tp if f == "Radiance"]
    d["darkness"] = as_val(vals[0][1]) if vals and vals[0][0] < 50 else None
    d["attack"] = as_val(vals[-1][1]) if vals and vals[-1][0] > 130 else None
    mids = [(x, t) for x, t in vals if 50 <= x <= 130]
    d["defense"] = as_val(mids[0][1]) if mids else None
    names = [t for x, t in icons]
    d["initiative"] = next((t for t in names if t in ("Fast", "Slow")), None)
    dt = next((t for t in names if t in ("PhysicalDefense", "PhotonicDefense")), None)
    d["attack_defense_type"] = dt.replace("Defense", "") if dt else None
    d["faction"] = next((t for t in names if t not in ("Fast", "Slow", "PhysicalDefense",
                                                       "PhotonicDefense")), None)
    cls = [t for l in lines if l["x"] < 25 and 35 < l["y"] < 110 for t in tokens(l["text"]) if t in ENEMY_CLASS]
    d["class"] = cls[0] if cls else None
    hp = [l for l in lines if l["size"] >= 15 and re.fullmatch(r"[\dX]+", l["text"]) and 100 < l["y"] < 175]
    d["hp"] = as_val(hp[0]["text"]) if hp else None
    nl = next((l for l in lines if 150 <= l["y"] < 200 and not l["italic"] and l["size"] >= 12
               and re.search(r"[A-Za-z]{3}", l["text"])), None)
    d["name"] = nl["text"] if nl else None
    after = [l for l in lines if nl and l["y"] > nl["y"]]
    tl = []
    for l in after:
        if l["italic"]:
            tl.append(l)
        else:
            break
    d["traits"] = parse_traits(" ".join(l["text"] for l in tl))
    body = [l for l in after if l not in tl]
    d["effect"] = fix_words(" ".join(l["text"] for l in body)) or None
    if d["class"] is None:
        d["class"] = "Shadow" if "Shadow" in d["traits"] else "Shade"
    return d


def parse_companion(lines):
    d = {}
    tp = top_parts(lines)
    # 版面同玩家卡：攻擊 {類型} {Companion} 強度? {Defense} ...
    toprow = " ".join(t for x, f, t in tp)
    m = re.match(r"(\d+)\s*\{(Physical|Photonic)\}\s*\{Companion\}\s*(\d+)\s*\{Defense\}\s*(\d+)", toprow)
    if m:
        d.update(attack=int(m[1]), attack_type=m[2], defense=int(m[3]), explore=int(m[4]))
    else:
        d["_toprow_raw"] = toprow
    side_nums = [l for l in lines if 32 <= l["y"] < 160 and re.fullmatch(r"\d+", l["text"])]
    small = [l for l in side_nums if l["size"] < 15]     # 小圓圈 = 強度 (難度計算用)
    heart = [l for l in side_nums if l["size"] >= 15]    # 愛心 = HP
    d["strength"] = num(small[0]["text"]) if small else None
    d["hp"] = num(heart[0]["text"]) if heart else None
    d["name"] = title_of(lines, 120, 195)
    body = [l for l in lines if l["y"] > 32 and l["text"] != d["name"] and l not in side_nums]
    d["effects"] = split_effects(body)
    d["side"] = "basic" if any((e["type"] == "Flip") for e in d["effects"]) else "advanced"
    return d


def parse_side_quest(lines):
    d = dict(name=lines[0]["text"] if lines else None)
    fl = [l for l in lines[1:] if l["italic"] and l["y"] < lines[1]["y"] + 25]
    d["flavor"] = fix_words(" ".join(l["text"] for l in fl)) or None
    rest = [l for l in lines[1:] if l not in fl]
    # 獎勵名稱：較大字級的單行標題
    idx = next((i for i, l in enumerate(rest) if l["size"] >= 11.5 and not tokens(l["text"])
                and len(l["text"].split()) <= 4 and i > 0), None)
    if idx is None:
        d["text_lines"] = [fix_words(l["text"]) for l in rest]
        return d
    d["objective"] = fix_words(" ".join(l["text"] for l in rest[:idx]))
    d["reward_name"] = rest[idx]["text"]
    d["reward_effects"] = split_effects(rest[idx + 1:])
    return d


def parse_sectioned(lines):
    """以「Label:」切段的卡 (Shade 背面、Baron、Limited Quest、Shadow meddler)。"""
    lines = list(lines)
    d = {}
    if lines and fix_words(lines[0]["text"]).replace(" ", "") in LUMINARIES | PROFESSIONS:
        d["character"] = fix_words(lines[0]["text"]).replace(" ", "")
        lines = lines[1:]
    d["name"] = re.sub(r"^\{\w+\}\s*", "", lines[0]["text"]) if lines else None
    m = re.match(r"(.*?)\s*(\d+)\s*,\s*(\d+)$", d["name"] or "")
    if m:   # Baron 卡名後面的座標
        d["name"], d["coordinates"] = m[1], dict(east=int(m[2]), south=int(m[3]))
    text = fix_words(" ".join(l["text"] for l in lines[1:]))
    labels = r"(Location|When Revealed|When You Travel to a Final Location|Victory|Loss|Upon Arrival|Special|Setup|Post Special|Quest Requirements|Meddle|Intervene)"
    parts = re.split(labels + r":\s*", text)
    d["sections"] = {}
    if parts[0].strip():
        d["sections"]["_text"] = parts[0].strip()
    for i in range(1, len(parts) - 1, 2):
        key = parts[i]
        d["sections"][key] = (d["sections"].get(key, "") + " " + parts[i + 1]).strip()
    fl = [l for l in lines if l["italic"]]
    if fl:
        d["flavor_italic"] = fix_words(" ".join(l["text"] for l in fl))
    return d


def parse_location(lines):
    d = {}
    parts = [(p["fx"], p["fy"], p["font"], clean(p["text"]).strip()) for l in lines for p in l["parts"]]
    parts = [q for q in parts if q[3]]
    def pick(cond):
        q = [p for p in parts if cond(p)]
        return int(q[0][3]) if q else None
    d["explore_value"] = pick(lambda p: p[1] < 40 and p[0] > 130 and p[3].isdigit())
    d["coordinates"] = dict(east=pick(lambda p: 120 < p[1] < 150 and p[0] < 90 and p[3].isdigit()),
                            south=pick(lambda p: 150 <= p[1] < 175 and p[0] < 45 and p[3].isdigit()))
    d["trait_icons"] = [p[3].strip("{}") for p in parts if p[2] == "Radiance" and 150 <= p[1] < 175 and p[0] > 110]
    reminder = [l for l in lines if l["y"] < 22 and not re.fullmatch(r"\d+", l["text"])]
    d["beacon_reminder"] = " ".join(l["text"] for l in reminder) or None
    nl = next((l for l in lines if 175 <= l["y"] < 200 and l["size"] >= 12 and re.search(r"[A-Za-z]{3}", l["text"])), None)
    d["name"] = fix_words(nl["text"]) if nl else None
    body = [l for l in lines if nl and l["y"] > nl["y"]]
    d["effect"] = fix_words(" ".join(l["text"] for l in body)) or None
    return d


def parse_treachery(lines):
    d = {}
    d["name"] = next((l["text"] for l in lines if l["size"] >= 14 and re.search(r"[A-Za-z]{3}", l["text"])), None)
    pvp = [p for l in lines for p in l["parts"] if p["size"] >= 13 and p["text"].strip().isdigit()]
    d["progress_value"] = int(pvp[0]["text"].strip()) if pvp else None
    pv_txt = pvp[0]["text"].strip() if pvp else None
    body = [l for l in lines if l["text"] != d["name"]]
    for l in body:
        if pv_txt and any(p is pvp[0] for p in l["parts"]):
            l["text"] = re.sub(r"(^|\s)" + pv_txt + r"(\s|$)", " ", l["text"], count=1).strip()
    legacy = [l for l in body if l["y"] > 140]
    comp = [l for l in body if l["y"] <= 140]
    ct = fix_words(" ".join(l["text"] for l in comp))
    d["when_completed"] = re.sub(r"^When Completed:\s*", "", ct) or None
    d["legacy"] = fix_words(" ".join(l["text"] for l in legacy)) or None
    return d


def parse_generic(lines):
    title = None
    for l in lines:
        if not l["italic"] and l["size"] >= 12 and re.search(r"[A-Za-z]{3}", l["text"]):
            title = l["text"]; break
    return dict(name=title, text_lines=[
        dict(text=fix_words(l["text"]), italic=l["italic"], size=l["size"]) for l in lines])


PARSERS = dict(player_card=parse_player, enemy=parse_enemy, location=parse_location,
               treachery=parse_treachery, companion=parse_companion, side_quest=parse_side_quest,
               shade_back=parse_sectioned, shadow_meddler=parse_sectioned,
               baron_encounter=parse_sectioned, limited_quest=parse_sectioned,
               skill_mat=lambda lines: {})



# ---------------------------------------------------------------- 技能墊
def parse_skill_mat(spans, region):
    """技能墊：找出角色名稱、HP/信標上限、特殊規則，以及每個技能 (欄、名稱、效果類型、文字)。"""
    rx0, ry0, rx1, ry1 = region
    S = []
    for s in spans:
        S.append(dict(s, x=s["bbox"][0] - rx0, y=s["bbox"][1] - ry0,
                      xc=s["cx"] - rx0, yc=s["cy"] - ry0, t=clean(s["text"]).strip()))
    name = max((s for s in S if s["font"] != "Radiance" and s["size"] >= 15 and re.search(r"[A-Za-z]{3}", s["t"])),
               key=lambda s: s["size"], default=None)
    bar = {"Deck", "Attack", "Explore", "Discard"}
    titles = [s for s in S if s["font"] != "Radiance" and 11.5 <= s["size"] < 13 and s["t"] not in bar
              and re.fullmatch(r"[A-Z][A-Za-z’' -]+", s["t"]) and len(s["t"].split()) <= 3
              and not (name and abs(s["y"] - name["y"]) < 20 and abs(s["xc"] - name["xc"]) < 120)]
    # 名稱面板範圍 (技能以外的區域)
    big_nums = [s for s in S if s["font"] != "Radiance" and s["size"] >= 15 and s["t"].isdigit()]
    panel_x = [name["xc"]] if name else []
    panel_x += [s["xc"] for s in big_nums]
    # 依 x 分欄
    xs = sorted(set(round(t["xc"]) for t in titles))
    cols = []
    for x in xs:
        if cols and x - cols[-1][-1] < 60:
            cols[-1].append(x)
        else:
            cols.append([x])
    centers = [sum(c) / len(c) for c in cols]
    def col_of(x):
        return min(range(len(centers)), key=lambda i: abs(centers[i] - x)) if centers else 0
    bounds = [(centers[i] + centers[i + 1]) / 2 for i in range(len(centers) - 1)]
    def col_by_bounds(x):
        i = 0
        while i < len(bounds) and x > bounds[i]:
            i += 1
        return i
    lo = min(centers) - 85 if centers else 0
    hi = max(centers) + 85 if centers else 0
    skills = []
    for t in sorted(titles, key=lambda t: (col_of(t["xc"]), t["y"])):
        skills.append(dict(column=col_of(t["xc"]), name=t["t"], y=t["y"], parts=[], icons=[]))
    def owner(s):
        if not (lo <= s["x"] <= hi) or s in titles:
            return None
        c = col_by_bounds(s["xc"] if s["font"] != "Radiance" else s["x"] + 4)
        cands = [k for k in skills if k["column"] == c and k["y"] < s["y"] + 2]
        return max(cands, key=lambda k: k["y"]) if cands else None
    other = []
    for s in S:
        if s in titles or (name and s is name):
            continue
        k = owner(s)
        if k is None:
            other.append(s)
        elif s["font"] == "Radiance" and s["size"] >= 13.5:
            k["icons"].append(s["t"].strip("{}"))
        else:
            k["parts"].append(s)
    out = []
    for k in skills:
        # 依行重組文字
        rows = []
        for p in sorted(k["parts"], key=lambda p: (p["yc"], p["x"])):
            for r in rows:
                if abs(r[0]["yc"] - p["yc"]) < 4.5:
                    r.append(p); break
            else:
                rows.append([p])
        txt = " ".join(" ".join(q["t"] for q in sorted(r, key=lambda q: q["x"])) for r in rows)
        txt = re.sub(r"\s+([,.;:)])", r"\1", re.sub(r"\s+", " ", txt)).strip()
        out.append(dict(column=k["column"], name=fix_words(k["name"]), effect_type=k["icons"][0] if k["icons"] else None,
                        text=fix_words(txt)))
    info_rows = sorted([s for s in other if s["t"] not in bar and s not in big_nums
                        and not (s["font"] == "Radiance" and s["size"] >= 13.5)],
                       key=lambda s: (round(s["yc"] / 4), s["x"]))
    info = fix_words(re.sub(r"\s+([,.;:)])", r"\1", " ".join(s["t"] for s in info_rows)))
    nm = name["t"] if name else None
    if nm is None:
        nm = next((w for w in re.findall(r"[A-Za-z]+", info) if w in LUMINARIES | PROFESSIONS), None)
        if nm:
            info = info.replace(nm, "", 1).strip()
    nums = [int(s["t"]) for s in sorted(big_nums, key=lambda s: s["y"])]
    d = dict(name=nm, mat_type="luminary" if nm in LUMINARIES else "profession",
             skills=out, special_rules=info or None)
    if nm in LUMINARIES and len(nums) >= 2:
        d["hp"], d["beacon_limit"] = nums[0], nums[1]
    return d

# ---------------------------------------------------------------- 待確認清單
# ---------------------------------------------------------------- 人工覆寫
# PnP 中以圖片呈現、程式讀不到的值，由人工看卡圖判讀後寫在這裡，重新產生資料時會自動套用。
MANUAL_OVERRIDES = {
    # 攻防類型圖示 (規格 P7-01a、SD-07)：兩個盾並列 = Both
    "p33r2c1": {"attack_defense_type": "Both"},       # Greed
    "p35r0c1": {"attack_defense_type": "Both"},       # Wrath
    "p35r0c2": {"attack_defense_type": "Both"},       # Greedling
    "p35r1c2": {"attack_defense_type": "Both"},       # Ravager
    "p35r1c0": {"attack_defense_type": "Photonic"},   # Covetous Flail
    "p35r1c1": {"attack_defense_type": "Physical"},   # Vanity Wisps
}
HUNTER_RULE = "*An enemy is tracked while it has at least as much {Progress} as its {Darkness}."


def apply_overrides(cards):
    byid = {c["id"]: c for c in cards}
    for cid, fields in MANUAL_OVERRIDES.items():
        assert cid in byid, f"覆寫目標不存在: {cid}"
        byid[cid].update(fields)
        byid[cid]["_manual"] = sorted(fields)
    for c in cards:   # Hunter 特殊規則句尾的兩個圖示 (依 KC-30 Tracked 定義補上)
        if c["type"] == "skill_mat" and c["name"] == "Hunter":
            c["special_rules"] = HUNTER_RULE
            c["_manual"] = ["special_rules"]


def write_review(cards, outdir):
    import csv
    rows = []
    for c in cards:
        if c["type"] == "enemy" and c.get("attack_defense_type") is None:
            rows.append((c["id"], c["name"], "attack_defense_type", "", "防禦類型圖示是圖片，請補 Physical 或 Photonic"))
        if c["type"] in ("enemy", "location") and c.get("xp_reward") == 0 and c.get("class") != "Shade" \
                and c["name"] not in ("Sheer Valley",):   # 已人工確認無 XP
            rows.append((c["id"], c["name"], "xp_reward", 0, "偵測到 0 枚 XP 金幣，請確認"))

    for what, note in [("成長軌道墊 (Growth Mat) 兩面", "特別確認：困難面角色成長第 8 格只有手牌 8、沒有休息值"),
                       ("腐化軌道墊 (Corruption Mat) 兩面", ""), ("Shade 影響墊兩面", ""), ("任務板兩面", "")]:
        rows.append(("-", what, "data/tracks.json", "", ("已由 Claude 從 PnP 圖片判讀，請對照實體墊確認。" + note).strip()))
    for c in cards:
        if c.get("_manual"):
            for f in c["_manual"]:
                rows.append((c["id"], c["name"], f, c.get(f), "人工判讀的值 (MANUAL_OVERRIDES)，請對照實體卡確認"))
    with open(os.path.join(outdir, "review.csv"), "w", encoding="utf-8-sig", newline="") as f:
        w = csv.writer(f)
        w.writerow(["卡片ID", "名稱", "欄位", "目前值", "說明"])
        w.writerows(rows)


# ---------------------------------------------------------------- 主流程
def main(pdf_path, rulebook_pdf, outdir):
    load_vocab(rulebook_pdf)
    os.makedirs(outdir, exist_ok=True)
    doc = pymupdf.open(pdf_path)
    cards = []
    for pn in range(1, doc.page_count + 1):
        page = doc[pn - 1]
        spans = page_spans(page)
        regs = regions_for_page(pn, page)
        if not regs or not spans:
            continue
        img = None
        for kind, r, c, reg in regs:
            sp = spans_in(spans, reg)
            if not sp:
                continue
            rot = any(s["dir"] != (1, 0) for s in sp)
            lines = build_lines(sp, reg)
            typ = classify(kind, lines, pn, rot)
            rec = dict(id=f"p{pn:02d}r{r}c{c}", page=pn, row=r, col=c, type=typ,
                       rotated=rot, _kind=kind)
            if typ == "skill_mat":
                rec.update(parse_skill_mat(sp, reg))
            else:
                rec.update(PARSERS.get(typ, parse_generic)(lines))
            if typ in ("enemy", "location"):
                if img is None:
                    pix = page.get_pixmap(dpi=DPI)
                    img = np.frombuffer(pix.samples, dtype=np.uint8).reshape(pix.h, pix.w, pix.n)[:, :, :3].copy()
                n, lo, nxt = count_coins(img, DPI, reg)
                rec["xp_reward"] = n
                rec["_xp_confidence"] = dict(weakest_match=round(lo, 3) if lo else None,
                                             best_rejected=round(nxt, 3))
            rec["raw_text"] = "\n".join(l["text"] for l in lines)
            cards.append(rec)
    # 雙面配對：奇數頁 (r,c) 的背面是下一頁 (r, 2-c)
    by_pos = {(c["page"], c["row"], c["col"]): c for c in cards}
    for c in cards:
        if c["page"] % 2 == 1:
            mirror = 2 - c["col"] if c["_kind"] == "cell" else c["col"]
            b = by_pos.get((c["page"] + 1, c["row"], mirror))
            if b:
                c["back_id"] = b["id"]; b["front_id"] = c["id"]
    # 依正面種類重新判定背面
    byid = {c["id"]: c for c in cards}
    for c in cards:
        f = byid.get(c.get("front_id"))
        if not f:
            continue
        if f["type"] == "baron_encounter" and c["type"] != "baron_encounter":
            c["type"] = "baron_reward"
        elif f["type"] == "limited_quest":
            c["type"] = "limited_quest_reward"
    # 玩家卡歸屬：5 個角色的圖示是圖片而非文字。基礎面依 PnP 排列順序每 6 張一組，
    # 組別順序已用圖示人工比對確認；能讀到文字圖示的組別會自動驗證。
    OWNER_ORDER = ["Courage", "Hunter", "Justice", "Mender", "Scorchwright", "Temperance", "Wayfarer", "Wisdom"]
    basics = sorted([c for c in cards if c["type"] == "player_card" and c["page"] % 2 == 1],
                    key=lambda c: (c["page"], c["row"], c["col"]))
    for i, c in enumerate(basics):
        exp = OWNER_ORDER[i // 6]
        if c["owner"] and c["owner"] != exp:
            raise SystemExit(f"歸屬順序不符: {c['id']} {c['owner']} != {exp}")
        c["owner"] = exp
        c["owner_type"] = "luminary" if exp in LUMINARIES else "profession"
        if c.get("back_id"):
            byid[c["back_id"]]["owner"] = exp
            byid[c["back_id"]]["owner_type"] = c["owner_type"]
    # 玩家卡：奇數頁=基礎面 (Basic)，偶數頁=進階面 (Advanced)
    for c in cards:
        if c["type"] == "player_card":
            c["side"] = "basic" if c["page"] % 2 == 1 else "advanced"
        elif f["type"] == "enemy" and c["type"] == "shadow_meddler":
            f["class"] = "Shadow"
    for c in cards:
        if c["type"] == "enemy" and c.get("back_id") and byid[c["back_id"]]["type"] == "shade_back":
            c["class"] = "Shade"
        c.pop("_kind", None)
        if c.get("name"):
            c["name"] = fix_words(c["name"])
    # Shadow 干擾面沒有自己的標題文字：名稱取自戰鬥面
    for c in cards:
        if c["type"] == "shadow_meddler" and c.get("front_id"):
            c["name"] = byid[c["front_id"]]["name"]
    apply_overrides(cards)
    with open(os.path.join(outdir, "cards.json"), "w", encoding="utf-8") as f:
        json.dump(cards, f, ensure_ascii=False, indent=1)
    write_review(cards, outdir)
    with open(os.path.join(outdir, "word_joins.txt"), "w", encoding="utf-8") as f:
        f.write("# 自動修復的斷字 (合併前 -> 次數)，可人工抽查是否有誤合併\n")
        for k, v in sorted(JOIN_LOG.items()):
            f.write(f"{k}\t{v}\n")
    cnt = defaultdict(int)
    for c in cards:
        cnt[c["type"]] += 1
    print(dict(cnt), "total", len(cards))


if __name__ == "__main__":
    if len(sys.argv) != 4:
        print(__doc__); sys.exit(1)
    main(sys.argv[1], sys.argv[2], sys.argv[3])
