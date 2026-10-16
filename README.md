# Radiance 電子版

單人卡牌遊戲 Radiance 的全自動網頁版 (只供 Paul 自己遊玩)。規則依據 `spec/`，開發說明見 `CLAUDE.md`。

## 開始玩

```
npm install
npm run dev          # 開發模式：瀏覽器打開 http://localhost:5173
```

不需要伺服器的版本：

```
npm run build        # 產生 dist/
```

之後直接用瀏覽器打開 `dist/index.html` 就能玩 (離線可用，存檔在瀏覽器的 localStorage)。

- 開局畫面可以選角色、職業、Shade、難度，或按「官方範例開局」(Example Turn Guide 的固定設定)。
- 畫面只在需要你選擇時停下 (UI-10)；設定裡可以改成每個行動窗口都停。
- 「復原」可以回到上一個決定；翻開新資訊 (翻牌、抽牌、洗牌) 之後不能復原到那之前 (UI-02)。

## 開發

| 指令 | 用途 |
|---|---|
| `npm test` | 引擎與介面流程測試 (Vitest) |
| `npm run typecheck` | 型別檢查 |
| `npm run e2e` | 瀏覽器端到端檢查 (選用，需要 playwright，先開 `npm run dev`) |
| `npm run cards` | 從 `reference/9Up-NoBleed-A4.pdf` 重新切卡圖 |

- `src/engine/`：遊戲引擎 (純 TypeScript)，說明見 `src/engine/README.md`。
- `src/ui/`：畫面 (React)。版面依 `design/main-screen.html` 與 `spec/20-ui.md`。
