# 敵人與戰鬥：Staging、Engagement、Attack、Defend

## 區域與敵人移動 [p.22]

- **KC-01** 任務區 (`Quest`)：敵人被翻開後在此排隊，**右端是前端**。任務區的敵人不會攻擊玩家，也不能被攻擊。
- **KC-02** 玩家區 (`Player`)：已接戰的敵人。可在 Attack Phase 被攻擊，並在 Defend Phase 攻擊玩家。
- **KC-03** 敵人從任務區移到玩家區 (任何原因)：放到玩家區**左端 (後端)**。
- **KC-04** 敵人從玩家區移到任務區：`Fast` 放任務區**右端 (前端)**，`Slow` 放**左端 (後端)**。
  - **Pull** = 任務區 → 玩家區；**Push** = 玩家區 → 任務區 (依 KC-03 / KC-04 放置)。
  - 敵人移動時，附著在其上的卡一起移動 (KC-17)。

## 敵人的攻擊與傷害 [p.36–37]

- **KC-23 立即攻擊**：效果說某敵人「makes an immediate attack」時，立即中斷流程，按 P7 的方式結算 (可防禦)，再回到原流程。該敵人在 Defend Phase 仍會正常攻擊。
- **KC-25 直接傷害 (對敵人)**：效果「deal {Wound} to an enemy」是直接傷害，**無視敵人防禦**，不算攻擊，**不能與 AP 合併**。
  - ⚠ INTERP：敵人在任何時候傷害 ≥ HP 都被擊敗，結算方式同 P6-03 (棄掉、獲得 XP、結算 When Defeated)。

## P1 Staging Phase [p.44–45]

- **P1-01** 計算威脅值：`threat = 威脅軌道目前區段值 (資料表 D-03) + 目前地點上的 ThreatToken 數 + 本回合修正` (例如 Shade 影響墊的 +X，見 SH-03；地點或 legacy 效果)。
- **P1-02** `remaining = threat`。當 `remaining > 0`：
  1. 若 `remaining ≥ 5` → 從 **Doom** 牌庫翻開；否則從 **Dusk** 牌庫翻開。
  2. `Fast` 放任務區右端，`Slow` 放左端。結算 When Revealed。
  3. `remaining -= 該敵人的 Darkness`。
- **P1-03** 若這是 Shade 揭示回合 (SH-02)：**Staging Phase 全部完成之後** (包含所有 End of Staging 效果)，Shade 才以敵人身分進入任務區，依 `Fast`/`Slow` 放置。因此 End of Staging 效果作用不到剛進場的 Shade。例：在 Sol 揭示 Greed 時，Sol「任務區的 Sol 敵人在 Staging 結束時接戰」已經結算過，Greed 留在任務區；之後的回合若 Greed 仍在任務區，Sol 照常把他拉進玩家區。依據：p.67「結算 Shade 影響、**並完成 Staging Phase 之後**，Shade 才以敵人身分進場」；Example Turn Guide p.18 正是玩家在 Sol、Greed 揭示的情況，圖中進入 Phase 2 時 Greed 仍在任務區。(原 OPEN-10，預設值相反，已更正。)

## P3 Engagement Phase [p.48]

- **P3-01** 依光軌道目前位置所屬的**接戰區段** (資料表 D-01) 取得接戰數 N。注意此時的光已扣除 P2 的花費。
- **P3-02** 任務區**最右邊的 N 個敵人**移到玩家區，放在既有敵人的左邊。從最右邊的敵人開始逐一移動，每一隻都放到玩家區最左端 (KC-03)，所以這組敵人保持原本的相對順序 (OPEN-07 已解決)。⚠ INTERP：任務區敵人不足 N 個時，全部移過去。
- **P3-03** 該區段若有附加圖示，在此時結算：`Dusk`/`Doom` = 立即從該牌庫翻 1 張放入任務區；`Wound` N = 角色立即承受 N 個傷害。

## P6 Attack Phase [p.61–62]

- **P6-01** `AP = 攻擊卡 attack + 加成卡 attack_booster + 啟動中永久加成卡的 attack_booster 總和 + 行動與技能的加成`。攻擊類型 = 攻擊卡的 `attack_type`。
- **P6-02** 重複以下步驟，直到 AP 用完或玩家停止：
  1. 選擇玩家區**一個本階段還沒用 AP 攻擊過的**敵人，決定要分配多少 AP 給它 (從 AP 池扣除)。依據：p.62 第 3 步「Repeat step 2, selecting **new** enemies」。所以同一個敵人每個 Attack Phase 只承受一次主攻擊，不能把 AP 拆成好幾次攻擊同一個敵人 (那樣防禦會被重複計算)。之後才進入玩家區的敵人 (例：被 Shout 拉進來) 算新的敵人，可以用剩下的 AP 攻擊 [Example Turn Guide p.14–15]。「new」理解為「本階段還沒攻擊過」，規則書沒有逐字寫出；已經 Paul 確認。
  2. 若敵人的 `attack_defense_type` = 本回合攻擊類型，擋下等於其 `defense` 的 AP；類型不同則完全不擋。`attack_defense_type = Both` 的敵人 (雙重類型) 對兩種攻擊**都擋**。
  3. 未被擋下的 AP 變成敵人身上的 `Wound`。
- **P6-03** 敵人傷害 ≥ `hp` → 擊敗：棄掉該敵人 (附著卡棄到玩家棄牌堆)，獲得其 `xp_reward`，結算其 When Defeated 效果。
- **P6-04** 剩餘 AP 不會保留到下回合。

## P7 Defend Phase [p.63–64]

- **P7-01** 玩家區每個敵人 (被 Disarm 的除外) **各自**攻擊一次，順序由玩家決定。敵人攻擊類型 = 其 `attack_defense_type`。
- **P7-01a 雙重類型** (`Both`)：卡上兩個盾並列 (Physical 與 Photonic) 的敵人，同時具有兩種攻擊類型。防禦牠的攻擊時，**任一類型**的卡都可以用，也可以混用。適用：Greed、Wrath、Greedling、Ravager。依據：p.124 說 Wrath「has both attack types」，因此用卡防禦比較好預測。「可以混用」是由「兩種類型都算」推得，規則書沒有逐字寫出；已經 Paul 確認。
- **P7-02 防禦 (可選)**：從手牌及/或**牌庫頂端**棄掉任意數量的卡，卡片的 `attack_type` 必須與敵人攻擊類型相同 (雙重類型見 P7-01a)。傷害減少這些卡的 `defense` 總和；傷害最低為 0，多餘的防禦值不會保留到下一次攻擊。
  - 可以連續棄掉牌庫頂端多張，只要每張類型都相符。玩家可以查看牌庫頂端的卡來判斷是否相符；類型不符就不能棄，留在牌庫頂端 (OPEN-05，Paul 確認)。
  - 牌庫空了時，玩家可以選擇重洗 (腐化 +1) 以繼續用牌庫頂端防禦 (KC-27)。
- **P7-03** 未擋下的傷害成為角色身上的 `Wound`。傷害 ≥ HP 立即失敗。
- **P7-04** 同一張卡不能同時擋兩次攻擊；兩次攻擊必須各自防禦。
