# Shadow (選用)

## Shadow (SD) [p.78–79]

Shadow 是選用的強敵，用來提高難度。卡片資料：正面 (戰鬥面) 為 `enemy` 且 `class = Shadow`；背面為 `shadow_meddler` (干擾面)，`sections` 中有 `Meddle` 與 `Intervene`。`shadow_meddler` 的 `name` 取自戰鬥面。

| Shadow | 強度 (難度 +) | 對應的 Shade |
|---|---|---|
| Greedling | 3 | Greed |
| Covetous Flail | 3 | Envy |
| Vanity Wisps | 4 | Pride |
| Ravager | 6 | Wrath |

- **SD-01 開局**：選定的 Shadow 以**干擾面 (meddler)** 朝上放在敵人牌庫旁的「干擾區」。可以帶多個 Shadow。Shadow 不放入 Dusk/Doom 牌庫。
- **SD-02 干擾效果 (Meddle)**：干擾面朝上期間，Meddle 效果持續生效。
- **SD-03 介入 (Intervene)**：Intervene 條件成立時，Shadow 翻到戰鬥面，並在**下一個 Staging Phase 結束時**以敵人身分進入任務區 (依 `Fast`/`Slow` 放置，視為被揭示)。⚠ INTERP：比照 Shade (P1-03)，在 Staging Phase 全部完成之後才進場，End of Staging 效果作用不到它。翻面後干擾效果停止。
  - Greedling：干擾面上累積的 XP 在翻面後留在卡上 (依其卡片文字)。
  - ⚠ 條件在 Staging Phase 進行中成立時，是當下這個 Staging 結束就進場，還是下一回合？見 OPEN-12。
- **SD-04 進場順序**：Shadow 與 Shade 在同一回合進場時，**Shadow 先**。
- **SD-05 被擊敗**：Shadow 和一般敵人一樣可以被攻擊、擊敗。被擊敗時獲得其 XP，並**移出遊戲**。例外：Ravager 依其卡片文字回到干擾區 (Shade 決戰期間被擊敗則移出遊戲；Blitz 模式不復活)。
- **SD-06** 勝利**不需要**擊敗 Shadow (Blitz 例外)。
- **SD-07 攻防類型**：Greedling、Ravager 為雙重類型 (`Both`，P7-01a)；Covetous Flail 為 Photonic；Vanity Wisps 為 Physical。這些類型是圖示，已從卡圖人工判讀並寫入 `cards.json` (`tools/extract_cards.py` 的人工覆寫表)。
