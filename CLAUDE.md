# Radiance 電子版

把單人卡牌遊戲 Radiance 做成全自動的電子版，只供 Paul 自己遊玩。

## 規格

- 遊戲規則的唯一依據是 `spec/`。**先讀 `spec/README.md`**，它說明了檔案分工、依賴與開發順序。
- 開發某個功能時，只讀 `spec/README.md`、`spec/01-state-and-data.md`、`spec/03-effect-engine.md`，加上該功能的模組檔與其依賴檔，不需要全部讀完。
- 平常不需要閱讀 `reference/` 裡的規則書 PDF。規格標示 `⚠ INTERP` / `OPEN`、規格沒寫清楚或沒涵蓋某個情況時，**先查規則書找答案** (Paul 指示)，找到後照規則書實作，並更新 `spec/` 與 `spec/91-history.md` (註明頁碼)。
- 規則書也找不到答案，或規格與規則書衝突時，再停下來告訴 Paul，不要自行決定。

## 資料

- 卡片：`data/cards.json`；軌道數值：`data/tracks.json`。欄位說明見 `data/README.md`。
- `data/review.csv` 列出曾經需要人工確認的項目，目前已全部對照 PnP 原圖確認 (見「核對結果」欄)。之後新增人工判讀的值時再加入這個檔案。

## 介面

- 介面規則在 `spec/20-ui.md`，設計稿在 `design/main-screen.html` 與 `design/main-screen.png`，做畫面前先看這兩個。
- 圖示一律用 `data/icons/` 的官方圖示 (SVG，`currentColor`)；遊戲名詞用官方英文 (UI-04a)；有圖示的地方不寫文字 (UI-04b)；文字不換行 (UI-04c)。

## 實作原則

- 這是電子遊戲：桌遊的實體操作 (推方塊、翻墊子、擺指示物) 一律轉成內部狀態，不模擬實體物件 (`spec/02-digital.md`)。
- 程式碼與測試在註解中標註所實作的規則編號 (例：`// P4-02`)。
- `OPEN-xx` 先照 `spec/90-open-items.md` 的預設值實作，並做成可切換的設定。
- 卡片效果寫成程式並用效果積木組合，不要解析卡片文字 (EE-23)。
- 第一個驗收目標：`tests/scenario_example_turn.json` 全部通過。
