# Radiance 規則規格

版本：1.6.1
來源：`Rulebook-Base-Radiance-FINAL_pnp.pdf` (128 頁)，以及 PnP 檔中的兩張參考卡 (`9Up-NoBleed-A4.pdf` 第 61、62 頁)
範圍：規則書全部規則，加上效果引擎設計與數位化原則。規則書每一頁的對應見 `91-history.md`。

## 使用說明 (給 Claude Code)

1. **這份規格是寫遊戲邏輯的唯一依據。** 不需要閱讀規則書。
2. **開發某個模組時，只需要讀：本檔 + `01-state-and-data.md` + `03-effect-engine.md` + 該模組的檔案**，以及下方依賴表列出的檔案。不需要每次讀全部。
3. 每條規則都有編號 (例：`P4-03`)，跨檔案引用一律用編號，位置查下方的「規則編號索引」。程式碼與測試請在註解標註實作的規則編號。
4. `[p.51]` 是規則書頁碼，只在標示 `⚠ INTERP` 或 `OPEN` 而且需要查證時，才回去讀那一頁。
5. `⚠ INTERP`：規則書沒有明寫，這裡採用的解讀。照此實作，但集中在設定檔或單一函式，方便日後修改。
6. `OPEN-xx`：規則書沒有答案，需要 Paul 決定。`90-open-items.md` 列出建議的預設值，引擎先照預設值實作，並做成可切換的設定。
7. 卡片資料在 `data/cards.json`，軌道數值在 `data/tracks.json`。卡片文字中的圖示寫成 `{Token}`，意義見 `01-state-and-data.md`。
8. 規則條文保留英文術語，與卡片文字一致，避免翻譯造成歧義。說明用中文。
9. 規則條文中「方塊前進」「翻面」等實體描述是為了對照規則書；**實作時一律轉成狀態，不模擬實體物件**，見 `02-digital.md`。
10. 參考卡與規則書正文衝突時以正文為準；正文沒寫、參考卡有寫時，以參考卡補充 (目前有 T2a、T4 兩處)。

## 模組地圖

| 檔案 | 內容 | 依賴 | 類別 |
|---|---|---|---|
| `01-state-and-data.md` | 圖示、狀態模型、術語詞典 (KC-30)、資料表 | — | 共用 |
| `02-digital.md` | 數位化原則、畫面預覽、隱藏資訊界線 | 01 | 共用 |
| `03-effect-engine.md` | 效果規則 (效果類型、時機、特質、Echo) 與效果引擎設計 | 01 | 共用 |
| `04-setup-and-difficulty.md` | 開局、難度設定 | 01、06、07、08、09 | 核心 |
| `05-round-flow.md` | 回合議程、Action Set、Refresh、勝負 | 03、06、07、08、09、10 | 核心 |
| `06-character.md` | 成長、技能、牌組重洗、附著、角色傷害與治療 | 01、03 | 核心 |
| `07-enemies-and-combat.md` | 任務區與玩家區、Staging、Engagement、Attack、Defend | 01、03、06 | 核心 |
| `08-darkness-and-treachery.md` | Darkness、Treachery 完成 | 01、03、09 | 核心 |
| `09-world-and-travel.md` | 信標與搜尋、Explore、移動 | 01、03 | 核心 |
| `10-shade.md` | Shade 揭示、最終地點 | 07、09 | 核心 |
| `11-companions.md` | 夥伴 | 核心全部 | 選用 |
| `12-shadows.md` | Shadow | 核心全部 | 選用 |
| `13-blitz.md` | Blitz 快速模式 | 12 | 選用 |
| `14-side-quests.md` | 支線任務 | 核心全部 | 選用 |
| `15-limited-quests.md` | 限定任務 (含跨局保存) | 核心全部 | 選用 |
| `16-location-barons.md` | Location Barons | 核心全部 | 選用 |
| `17-twin-flames.md` | Twin Flames 雙人 (優先度最低) | 核心全部 | 選用 |
| `20-ui.md` | 介面方向、主畫面配置與視覺規則 (Paul 的決定)；設計稿在 `design/` | 02 | 介面 |
| `90-open-items.md` | 待決議事項、玩家決策點 | — | 參考 |
| `91-history.md` | 變更紀錄、規則書逐頁對照、修改清單 | — | 參考 |

選用模組可以任意組合 (Blitz 不建議搭配限定任務) [p.80]。

## 建議開發順序

1. **骨架**：`01` 狀態與資料載入 → `03` 引擎 (結算堆疊、事件、行動窗口，先不寫任何卡片)。
2. **核心流程**：`06` → `07` → `09` → `08` → `05` 把階段串起來 → `04` 開局。
3. **第一個驗收**：讓 `tests/scenario_example_turn.json` 通過。只需要實作這個測試用到的卡片效果 (Ember Strike、Shout、Farhome、Sol、Moltan Spy、Moltan Spellcaster、Sol Conspirator 等)。
4. **Shade 決戰**：`10`，可以完整玩完一局。
5. **全部卡片效果**：依角色與職業分批實作 (一批 = 一個 luminary 或 profession 的 6 張卡 + 技能)。
6. **介面**：依 `02` 做畫面與預覽。預覽邏輯可以在第 2 步就一起寫，因為它和結算共用同一套計算 (DG-18)。
7. **選用模組**：`11` → `12` → `13` → `14` → `16` → `15` → `17`。

## 規則編號索引

| 規則編號 | 檔案 |
|---|---|
| KC-30 | `01-state-and-data.md` |
| D-01 ~ D-06 | `01-state-and-data.md` |
| DG-01 ~ DG-18 | `02-digital.md` |
| KC-05a、KC-10、KC-10a、KC-10b、KC-11、KC-12、KC-12a、KC-12b、KC-12c、KC-12d、KC-12e、KC-12f、KC-14、KC-15、KC-16、KC-20、KC-21 | `03-effect-engine.md` |
| EE-01 ~ EE-26 | `03-effect-engine.md` |
| SU-01 ~ SU-22 | `04-setup-and-difficulty.md` |
| P2-01 ~ P2-05 | `05-round-flow.md` |
| P8-01 ~ P8-07 | `05-round-flow.md` |
| LOSE-01 | `05-round-flow.md` |
| WIN-01 | `05-round-flow.md` |
| KC-05、KC-06、KC-07、KC-08、KC-09、KC-13、KC-18、KC-19、KC-27、KC-27a、KC-17、KC-22、KC-24、KC-26 | `06-character.md` |
| KC-01、KC-02、KC-03、KC-04、KC-23、KC-25 | `07-enemies-and-combat.md` |
| P1-01 ~ P1-03 | `07-enemies-and-combat.md` |
| P3-01 ~ P3-03 | `07-enemies-and-combat.md` |
| P6-01 ~ P6-04 | `07-enemies-and-combat.md` |
| P7-01 ~ P7-04 | `07-enemies-and-combat.md` |
| P4-01 ~ P4-04 | `08-darkness-and-treachery.md` |
| TR-01 ~ TR-03 | `08-darkness-and-treachery.md` |
| KC-28、KC-29 | `09-world-and-travel.md` |
| P5-01 ~ P5-05 | `09-world-and-travel.md` |
| T1 ~ T5 | `09-world-and-travel.md` |
| SH-01 ~ SH-05 | `10-shade.md` |
| FL-01 ~ FL-04 | `10-shade.md` |
| CO-01 ~ CO-08 | `11-companions.md` |
| SD-01 ~ SD-07 | `12-shadows.md` |
| BZ-01 ~ BZ-08 | `13-blitz.md` |
| SQ-01 ~ SQ-11 | `14-side-quests.md` |
| LQ-01 ~ LQ-07 | `15-limited-quests.md` |
| LB-01 ~ LB-09 | `16-location-barons.md` |
| TF-01 ~ TF-23 | `17-twin-flames.md` |
| UI-01 ~ UI-10 (含 04a–04c、05a、06a、06b、08a) | `20-ui.md` |
| OPEN-01 ~ OPEN-18 | `90-open-items.md` |
