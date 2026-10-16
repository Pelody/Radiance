# 任務：把 Radiance 做成網頁遊戲

我要把單人卡牌遊戲 Radiance 做成全自動的網頁版，只給我自己玩。規則、資料、介面都已經整理好了，你負責寫程式。

開始前先讀：`CLAUDE.md`、`spec/README.md`、`spec/20-ui.md`，並看 `design/main-screen.png` 和 `design/main-screen.html`。其他規格檔照 `spec/README.md` 的說明，做到哪個模組再讀哪個。

## 技術選擇

- Vite + TypeScript + React，測試用 Vitest。如果資料夾還不是 git repo，先 `git init`。
- 單頁、純前端、不需要伺服器，離線可玩。存檔放 localStorage（把遊戲狀態序列化）。
- 資料夾分工：
  - `src/engine/`：遊戲引擎，純 TypeScript，不碰 DOM 或 React，可以直接在 Node 跑測試。
  - `src/ui/`：畫面。
  - `public/cards/`、`public/icons/`：卡圖與圖示。
- 引擎用「狀態 + 動作」的結構：
  - 玩家的每個決定都是一個 action；引擎回傳新狀態，以及下一個等待玩家的決定 (pending decision)。
  - 不需要玩家決定的步驟由引擎自動跑完並寫入日誌，每筆日誌帶規則編號 (DG-02)。
  - 「輪到你」列的預覽數值，必須用和實際結算同一套函式算出來 (DG-18)。
  - 復原：用狀態快照；一旦翻開新資訊（翻牌、抽牌、洗牌），清空復原紀錄 (UI-02)。
  - 亂數可設定種子 (EE-25)，測試要能重現。

## 卡圖與圖示

- 圖示：直接用 `data/icons/` 的 SVG（`fill="currentColor"`），複製到 `public/icons/`。
- 卡圖：寫一個切圖工具（放在 `tools/`），從 `reference/9Up-NoBleed-A4.pdf` 切出每張卡，存成 `public/cards/<卡片 id>.webp`。
  - 卡片 id 格式是 `pNNrRcC`（頁、列、欄），對應 `data/cards.json` 的 `page`、`row`、`col`。
  - 每頁 3×3 格，每格 180×252 pt，整組在頁面置中：左上角 x0 = (頁寬 − 540) / 2、y0 = (頁高 − 756) / 2。
  - `rotated: true` 的卡是橫向的，切完要轉正。
  - 技能墊 (`skill_mat`) 是整列寬的大圖：每頁上下各一張，約為 (45, 103)–(550, 421) pt 和 (45, 421)–(550, 739) pt，row 0 是上面那張。
  - 切完做一張總覽圖給我檢查。

## 開發順序

每完成一個階段就停下來，用繁體中文回報，等我確認再繼續。

1. **專案骨架 + 卡圖切圖。**
2. **引擎核心**：照 `spec/README.md` 的開發順序，先做基本遊戲（spec 01–10）。驗收：`tests/scenario_example_turn.json` 全部通過。
3. **介面**：照 `spec/20-ui.md` 和 `design/main-screen.html` 做主畫面並接上引擎。驗收：用官方範例的開局設定，可以在網頁上完整玩完第 1 回合。
4. **補齊基本遊戲所有卡片效果**：用效果積木組合（EE-23），每張卡至少一個測試。驗收：可以從開局一路玩到勝利或失敗。
5. **選用模組**：spec 11–17，Twin Flames 最後做。

## 工作規則

- 遊戲規則只照 `spec/`。規格沒寫到、或看起來跟規則書衝突，先停下來問我，不要自己決定。
- 程式和測試的註解標上規則編號（例：`// P4-02`）。
- 每個階段完成 commit 一次。
- 回報時告訴我三件事：做了什麼、測試結果、需要我決定的事。
