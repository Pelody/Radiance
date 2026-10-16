# 遊戲引擎 (src/engine)

純 TypeScript，不碰 DOM / React，可以直接在 Node 跑測試。

## 結構

| 檔案 | 內容 |
|---|---|
| `types.ts` | 遊戲狀態 (01 狀態模型)，全部是可序列化的純資料 |
| `data.ts`、`tracks.ts`、`shades.ts` | 卡片資料、軌道資料表 (D-01 ~ D-05)、Shade 數值 |
| `config.ts` | 難度 (DF) 與 OPEN 項目的可切換預設值 |
| `core.ts` | 待決策 (EE-24)、Ctx、日誌 |
| `effects.ts` | 效果定義、來源 (EE-07)、數值修正 (EE-01)、限制 (EE-02) |
| `ops.ts` | 效果積木 (EE-23) 與結算堆疊 (EE-09 ~ EE-16) |
| `calc.ts` | 衍生數值；預覽與結算共用 (DG-18) |
| `window.ts` | 行動窗口 (EE-17)、技能 (KC-18)、成長 (KC-05 ~ KC-08) |
| `world.ts` | 探索完成與移動 (P5、T1 ~ T5) |
| `phases.ts` | 8 個階段與勝負 |
| `setup.ts` | 開局 (SU) |
| `game.ts` | 驅動程式：submit / undo / view / 存檔 |
| `cards/` | 卡片效果 (以卡名註冊) |

## 運作方式

- 流程寫成 generator：需要玩家決定時 `yield` 一個 `Decision`；不需要決定的步驟自動執行並寫日誌 (DG-02)。
- `game.ts` 保存「最近一個階段開始時的狀態快照 + 之後的玩家決定」。引擎是確定性的 (EE-25)，
  重跑就得到相同結果；這也是存檔格式。
- `submit(game, answer)` 回傳新的 `Game`；`view(game)` 取得 `{ state, pending }`。
- 復原 (UI-02)：每次 submit 前保存快照；`state.infoSeq` 增加 (翻牌、抽牌、洗牌、查看) 時清空復原紀錄。
- 新卡片：在 `cards/` 用 `defineCard(名稱, [...])` 註冊，效果用 `ops.ts` 的積木組合，不解析卡片文字 (EE-23)。
