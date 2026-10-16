# 黑暗與 Treachery

## P4 Darkness Phase [p.50–53]

- **P4-01 計算 EP**：
  1. (可選) 先棄任意數量的信標，每個 +2 探索加成，並在地點放 1 個 `Obstacle` (KC-29)。
  2. `EP = 探索卡 explore + 加成卡 explore_booster + 啟動中永久加成卡的 explore_booster 總和 + 效果修正`。
- **P4-02 分配 EP** (全部都要分配)：
  1. 計算**有效黑暗** = 任務區所有敵人 Darkness 總和 (含各種 +X 修正) − 忽略黑暗的效果 (例：Courage 的 Illuminate、Foresight、支線任務獎勵 Steadfast Lantern)，最低 0。這是 EE-01 的衍生數值。
  2. 玩家選擇 `cover` (0 ≤ cover ≤ min(EP, 有效黑暗))，用來抵消黑暗。
  3. 未被抵消的黑暗 `有效黑暗 − cover`，每 1 點放 1 個 `Progress` 到**進行中的 Treachery**。
  4. 剩下的 `EP − cover` 用於探索 (P5)。
  5. 使用支線任務模組時，EP 也可以用來支付任務板費用 (SQ-05)；限定任務 Knowledge is Power 等卡片也可能提供其他用途。這些都從 `EP − cover` 中扣除，剩下的才用於探索。
- **P4-03** 分配完成後，若 Treachery 進度 ≥ 其 PV，執行 **TR-01 完成 Treachery**。
- **P4-04** 若有分配給探索的 EP，進入 P5；否則跳過 P5，直接進入 P6。

## TR 完成 Treachery [p.52–53]

- **TR-01** 當進行中 Treachery 的進度 ≥ `progress_value`：
  1. 若「已完成數 + 1」達到 Shade 的已完成 Treachery 上限 → **立即失敗**。
  2. 結算其 `when_completed` 效果。
  3. 從其進度中移除 PV 個。
  4. 翻開新的 Treachery 成為進行中的 Treachery；完成的那張移入 `completedTreacheries`，其 `legacy` 效果**整局生效**。
  5. 剩餘進度轉移到新的 Treachery 上。
- **TR-02** ⚠ INTERP：轉移後若新 Treachery 的進度 ≥ 其 PV，再次執行 TR-01 (連鎖完成)。
- **TR-03** 任何時候 Treachery 的進度達到 PV (不限 Darkness Phase)，都**立即**執行 TR-01。依據：p.30「進度 ≥ PV 後立即結算 When Completed」。(0.3 版標為解讀，重讀後確認是規則。)
