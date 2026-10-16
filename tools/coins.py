import numpy as np, cv2, os
_T = None
def _tpl():
    global _T
    if _T is None:
        t = cv2.imread(os.path.join(os.path.dirname(os.path.abspath(__file__)), "coin_template.png"))
        t = cv2.cvtColor(t, cv2.COLOR_BGR2RGB)
        h, w = t.shape[:2]
        mask = np.zeros((h, w), np.uint8)
        cv2.circle(mask, (w // 2, h // 2), int(w * 0.47), 255, -1)
        _T = (t, mask)
    return _T

def count_coins(page_rgb, dpi, region, search=(118, 36, 180, 145), thresh=0.6):
    """以樣板比對數 XP 金幣。region=卡片在頁面上的 pt 範圍；search=卡內搜尋區 (pt)。
    回傳 (數量, 最低分數)，分數接近門檻代表需人工確認。"""
    t, mask = _tpl()
    s = dpi / 72
    X0 = int((region[0] + search[0]) * s); X1 = int((region[0] + search[2]) * s)
    Y0 = int((region[1] + search[1]) * s); Y1 = int((region[1] + search[3]) * s)
    roi = page_rgb[Y0:Y1, X0:X1]
    res = cv2.matchTemplate(roi, t, cv2.TM_CCOEFF_NORMED, mask=mask)
    res = np.nan_to_num(res)
    h, w = t.shape[:2]
    found = []
    r = res.copy()
    while True:
        _, mx, _, loc = cv2.minMaxLoc(r)
        if mx < thresh:
            break
        found.append(mx)
        x, y = loc
        r[max(0, y - h * 3 // 4):y + h * 3 // 4, max(0, x - w * 3 // 4):x + w * 3 // 4] = 0
    nxt = float(r.max())
    return len(found), (min(found) if found else None), nxt
