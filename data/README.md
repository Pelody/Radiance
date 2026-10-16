# Radiance 卡片資料庫

從 PnP 卡片 PDF (`A4/9Up-NoBleed-A4.pdf`) 自動解析出的卡片資料，作為遊戲引擎的資料來源。

## 檔案

| 檔案 | 用途 |
|---|---|
| `data/cards.json` | 320 張卡面的結構化資料 |
| `data/review.csv` | 需要對照實體卡人工確認的項目 (人工判讀的值、軌道墊數值) |
| `data/word_joins.txt` | 程式自動修復的斷字紀錄 (例：`Th e` → `The`)，可抽查 |
| `data/tracks.json` | 軌道墊與任務板數值 (人工從 PnP 圖片判讀，說明見 `spec/01-state-and-data.md`) |
| `tools/extract_cards.py` | 解析程式，修正後重跑即可重新產生資料 |
| `tools/coins.py`、`tools/coin_template.png` | XP 金幣偵測 (樣板比對) |

## 重新產生

```
pip install pymupdf english-words opencv-python-headless numpy scipy
python3 tools/extract_cards.py reference/9Up-NoBleed-A4.pdf reference/Rulebook-Base-Radiance-FINAL_pnp.pdf data
```

注意：重新產生只會覆蓋 `cards.json`、`review.csv`、`word_joins.txt`。`review.csv` 中已人工補登的內容要另外保存。

```
```

## 資料慣例

- 卡片上的圖示一律寫成 `{名稱}`，例如 `{Light}`、`{Player}`、`{Wound}`。
- `id` 是 PnP 檔中的位置：`p13r0c0` 代表第 13 頁、第 0 列、第 0 欄。
- 雙面卡以 `back_id` / `front_id` 互相連結。PnP 雙面列印時欄位左右鏡像，程式已處理。
- 效果的 `type` 對應規則書 p.26 的效果類型：`1x` (每回合一次)、`Passive`、`Unrestricted`、
  `Mandatory1x`、`MandatoryUnrestricted`、`Eager…`，以及夥伴的 `Exhaust` / `Flip` / `Destroy`。
- 欄位名稱以 `_` 開頭的是除錯資訊 (例：`_xp_confidence`)，引擎不需要使用。

## 卡片種類 (type)

| type | 數量 | 主要欄位 |
|---|---|---|
| `player_card` | 96 (48 張 × 基礎/進階) | attack, attack_type, light_cost, defense, explore, element, attack_booster, explore_booster, owner, traits, effects, side |
| `enemy` | 56 (Dusk 28、Doom 20、Shade 4、Shadow 4) | darkness, attack, defense, attack_defense_type, initiative, faction, class, hp, traits, effect, xp_reward |
| `location` | 36 | explore_value, coordinates{east,south}, trait_icons, effect, xp_reward |
| `treachery` | 15 | progress_value, when_completed, legacy |
| `companion` | 16 (8 張 × 兩面) | attack, attack_type, defense, explore, strength, hp, effects, side |
| `skill_mat` | 8 | mat_type, hp, beacon_limit (Luminary)、special_rules、skills[column, name, effect_type, text] |
| `shade_back` / `shadow_meddler` | 各 4 | Shade 揭示面 / Shadow 干擾面，sections 依 `Location:`、`Victory:`、`Meddle:` 等標籤切段 |
| `side_quest` | 37 | objective, reward_name, reward_effects |
| `baron_encounter` / `baron_reward` | 各 12 | 遭遇面 (含座標) / 擊敗後的獎勵面 |
| `limited_quest` / `limited_quest_reward` | 各 8 | character, sections (Setup / Special / Quest Requirements) |
| `skill_mat_back` | 8 | 角色背景故事 (遊戲不使用) |

## 已知限制

- 地點卡上方的信標動作提示列是圖片，沒有解析 (只是規則提示，不影響遊戲)。
- 5 個角色 (Mender、Scorchwright、Temperance、Wayfarer、Wisdom) 的玩家卡歸屬圖示是圖片，
  改用 PnP 排列順序判定，順序已人工比對圖示確認。程式會用能讀到文字的 3 個角色自動驗證。
- XP 金幣以樣板比對偵測。所有金幣的比對分數 ≥ 0.939，非金幣 ≤ 0.352，
  兩群分得很開，並已用 14 張卡人工比對驗證。
- 支線任務、Baron、限定任務採「標籤切段」的粗解析，寫引擎時可能需要再細分。

## 人工覆寫

PnP 中以圖片呈現、程式讀不到的值 (例：Shade 的攻防類型圖示)，人工看卡圖判讀後寫在 `tools/extract_cards.py` 的 `MANUAL_OVERRIDES`。重新產生資料時會自動套用，被覆寫的卡片帶有 `_manual` 欄位，並列在 `review.csv` 中。

## icons/

`icons/<名稱>.svg`：64 個官方圖示 (Light、Progress、Physical、Photonic、Earth、Fire、Wind、XP、Threat token ……)。從規則書 PDF 內嵌的 Radiance 圖示字型轉出，名稱與規則書文字層的 `xxName` 相同 (例：`xxProgress` → `Progress.svg`)。`fill="currentColor"`，用 CSS `color` 換色。介面使用規則見 `spec/20-ui.md` UI-04b。
