# 效果規則與效果引擎 (共用)

前半是規則書的效果規則 (KC)，後半是引擎的設計 (EE)。所有卡片效果都經過這裡，請在寫任何卡片之前先完成這個模組。

## 效果規則 [p.26–33]

### X 值 [p.23]

- **KC-05a** 卡片文字中的 X 由卡片說明定義。若 X 所指的東西**不存在或為 0，X 預設為 1**。

### 效果 [p.26–31]

- **KC-10 效果類型** (玩家卡與技能)：
  | 類型 | 次數 | 強制性 |
  |---|---|---|
  | `Passive` | 不限，持續生效並即時反映狀態變化 | 永遠強制 |
  | `1x` | 每回合 1 次 | 選擇性；條件成立時可自選時機 |
  | `Mandatory1x` | 每回合 1 次 | 強制：本回合條件**第一次**成立時必須結算。**沒有寫條件的**，玩家自選時機，但本回合一定要結算 [p.27] |
  | `Unrestricted` | 不限次數 (條件需成立) | 選擇性 |
  | `MandatoryUnrestricted` | 不限次數 | 強制：每次條件成立都必須結算 |
  | `Eager*` | 同上，但**可無視一般使用限制**，例如效果不在本回合的行動卡上 (陷阱卡、催眠卡附著在敵人身上)，或技能未解鎖/未啟動 (Mender 的 Dark Past)。仍須滿足效果自身條件 | `EagerPassive` 視為強制 |
- **KC-10a** 技能一律是**單一**效果；卡片可以有多個效果 [p.26]。
- **KC-10b 強制效果的期限**：沒有條件的強制 1x 效果，若到了效果即將失效時還沒結算 (例：P8-04 棄掉行動卡前；技能則在加成卡棄掉、不再啟動前)，引擎在那之前強制結算。⚠ INTERP：規則書只說「玩家自選時機」，期限的時點是推定的。
- **KC-11 可用的玩家卡效果**：只有**本回合行動卡**上的效果可以使用；攻擊卡、加成卡、探索卡、手牌、附著卡上的效果不可使用，**除非是 Eager 效果**。依據：p.27 定義 Eager 時明寫「可結算不在本回合行動卡上的卡片行動效果」，p.46 寫行動卡「提供本回合可用的行動」。(0.3 版標為解讀，重讀後確認是規則。)
- **KC-12 回應效果**：文字含 when / whenever / after 的效果，需要觸發事件。觸發事件 = 遊戲中發生、並使遊戲狀態或生效中效果改變的事 [p.27]。**每個回應效果對同一個觸發事件只能結算一次。**
- **KC-12a 階段限制**：效果開頭有粗體的「Phase 名稱:」時，只能在該階段結算，可在該階段任意時機。若開頭為「Start of …」或「End of …」，必須是該階段**第一件 / 最後一件**事。同一階段有多個 Start of 或 End of 效果時，**玩家決定順序**。
- **KC-12b 結算時機** [p.28–29]：
  1. 一般而言，效果可在回合中任何時候結算 (需符合其階段或時機限制)。
  2. 一個效果必須**完整結算後**才能開始另一個效果。例外：`when` / `whenever` 效果與相關 `Passive` 效果，在觸發後**立即插入結算**，打斷進行中的效果，結算完再回到原效果。
  3. `after` 效果**不打斷**：等觸發它的效果結算完，再立即結算。
  4. 正在執行**遊戲動作** (遊戲要求的例行步驟，例如 Refresh Phase 棄掉行動組、產光、Staging Phase 翻敵人) 的過程中，不可結算效果。「棄掉行動組」視為**單一遊戲動作** (即使棄 3 張)。
  5. 一個效果一次棄多張卡，而有「每棄 1 張時觸發」的 `when` 被動效果時：**每棄 1 張就結算一次**，不是等全部棄完。
- **KC-12c 效果文字解析**：
  - 盡可能結算全部文字；無法結算的部分跳過。
  - 「may」= 該部分為選擇性。
  - 「A. Then, B」= A 必須**完全結算**，才能結算 B；A 只能部分結算或無法結算時，**跳過 B** [p.29]。
  - 一張卡有多個效果時，玩家決定順序 (仍須遵守各自的時機限制)。
- **KC-12d 敵人與地點效果**：沒有類型圖示，照文字執行。效果中標示 `{Player}` 的部分只在該敵人位於玩家區時生效；標示 `{Quest}` 的部分只在任務區時生效。
- **KC-12e Treachery 效果**：中間文字是 When Completed 效果 (完成時結算一次)；底部是 legacy 效果，**完成後**整局生效。進行中的 Treachery 其 legacy 尚未生效。
- **KC-12f 有選項的負面效果** [p.31]：玩家必須選擇**至少能部分結算**的選項。若某選項能完全結算、另一選項只能部分結算，**必須選能完全結算的**，即使這會導致失敗。

### 特質 [p.32]

- **KC-14** 特質是卡片標題下方的粗斜體文字或圖示 (地點卡與 Wayfarer 卡以圖示呈現，視同特質)。特質本身沒有效果，由其他效果參照。
- **KC-15** 「在你的行動組中 (in your action set)」= 行動組 4 張卡上的特質。「在場 (in play)」= 行動組 4 張卡 + 附著在敵人與地點上的卡。
- **KC-16** 效果新增或移除的特質只持續到**本回合結束**。附著時需要某特質的卡，之後失去該特質也**不會**被棄掉。

### Echo [p.33]

- **KC-20** Echo = 玩家棄牌堆最頂端的卡；棄牌堆為空時沒有 echo。
- **KC-21** 開始結算一個效果時，**對 echo 拍下快照**，直到該效果完整結算前，echo 不會改變 (即使過程中棄了牌)。
  - 例外：效果中的「then」之後，echo 先更新，再結算 then 後面的部分。

## 效果引擎設計 (EE)

本檔前半的效果規則講「規則是什麼」，這一節講「引擎該怎麼做才不會寫錯」。這一節的條文是**設計決定**：規則書沒有規定實作方式，但照這個結構做，所有卡片都能套進去，而且不同次開發的結果會一致。標示 ⚠ INTERP 的是規則書沒寫清楚、這裡選定的做法。

打個比方：引擎像一個會議主持人。主程式 (階段流程) 照議程走；有人舉手插話 (when 效果) 就先讓他講完再回到議程；有人說「等你講完我補充一下」(after 效果) 就排在目前發言之後；而會議規則本身 (被動修正、禁止事項) 則一直貼在牆上，每次做決定都要看一眼。

### 效果的六種形態

所有卡片、技能、地點、敵人、Treachery、夥伴、獎勵上的效果，都屬於下面其中一種 (一張卡可以同時有好幾種)。
- **EE-01 衍生數值修正** (例：「This enemy has +X {HP}」、「Dread enemies have +2 {EnemyAttack}」、Windwall「all your cards have +2 {Defense}」)
  - 引擎**不修改**卡片上存的數值。每次需要數值時，現場計算：`基礎值 + 所有生效中的修正`。
  - 因此被動效果會「即時反映狀態變化」(KC-10)：例如 Green Wraith 的攻擊 = 目前腐化值，腐化一上升，攻擊就跟著變。
- **EE-02 規則限制或改寫** (例：「You may only attack 1 enemy this round」、「cannot travel to any of the final locations unless…」、「All locked skills are considered unlocked」)
  - 做成**查詢函式**：`canAttack(enemy)`、`canTravelTo(location)`、`isUnlocked(skill)`、`canDefendWith(card)` 等。所有限制都在這些函式裡集中檢查，流程程式碼只問「可不可以」，不自己判斷。
- **EE-03 取代效果** (例：「The first 2 {Progress} you would place on the location is placed on the treachery instead」、「When the Baron would be defeated…」)
  - 關鍵字是 **would … instead**。這不是觸發效果：它在事件**發生之前**修改事件內容，事件本身就以修改後的樣子發生，不會先發生再撤銷。
  - ⚠ INTERP：同一個事件有多個取代效果時，玩家決定套用順序；每個取代效果對同一事件只套用一次。
- **EE-04 觸發效果** (when / whenever / after / Start of / End of / When Revealed / When Defeated / Upon Arrival / When Completed / 夥伴的 Flip 條件 / 任務達成條件)
  - 由事件觸發，結算時機見 10.4。
- **EE-05 主動效果** (玩家自己決定何時使用)
  - 行動卡的 1x / Unrestricted 效果、技能、夥伴的 Exhaust 與 Destroy、敵人或地點上的「Once per round, you may…」(例：Greed 付 XP 推拉)、搜尋行動、成長、接任務。
  - 只能在**行動窗口**使用 (10.5)。
- **EE-06 回合內持續效果** (由某個效果產生、之後持續一段時間)
  - 例：Shout「本回合每次擊敗 Fast 敵人後，拉 1 個 Fast 敵人」、Blinding Light「本回合無視 X+1 Photonic 防禦」、Step Lightly「本回合接戰數 −2」。
  - 實作上就是在結算時**登記**一個 EE-01 / EE-02 / EE-03 / EE-04 物件，並附上到期時間。預設到期時間 = **本回合結束** [p.26]，除非文字另有說明。

### 效果在什麼情況下「有效」
- **EE-07** 每個效果都有一個來源，只有來源處於有效狀態時，效果才存在：

| 來源 | 什麼時候有效 |
|---|---|
| 玩家卡效果 | 卡在**行動卡**卡槽 (KC-11)。Eager 效果例外：照其文字條件 (例：「If attached to an enemy:」) |
| 技能 | 已解鎖 + Ready + 啟動中 (KC-18)；Eager 例外 |
| 永久加成卡 | 不提供效果，只提供加成數值 (KC-09) |
| 敵人效果 | 敵人在場；標 `{Player}` 的部分只在玩家區、標 `{Quest}` 的只在任務區 (KC-12d) |
| 地點效果 | 目前地點；最終地點橫置後仍有效 (FL-04)；Envy 放入玩家區的地點在探索完成前有效 |
| Treachery | When Completed：完成時結算一次；legacy：完成後整局有效 (KC-12e) |
| Shade 卡背面 | 依各段文字：Setup 在開局、Special 依其說明、When Revealed 在揭示時 |
| Shadow 干擾面 | Meddle 效果在干擾面朝上期間有效 (SD-02) |
| 夥伴 | Passive：只要夥伴在場就有效，橫置也有效 (CO-04) |
| 支線任務、Baron、限定任務獎勵 | 取得後有效，**不需要**在行動卡卡槽，也不需要元素啟動。仍遵守自身的效果類型 (1x 等) 與時機 (SQ-08、LB-06、LQ-05)。⚠ INTERP：p.86 說限定任務獎勵「如同在你打出的行動卡上或啟動中的技能上」；p.84 說支線任務獎勵「視為一般的玩家技能或卡片行動效果」，沒說是否需要元素啟動，比照 p.86 處理 |

### 事件清單

引擎在下列時刻發出事件，觸發效果與持續效果靠它們運作。事件同時帶有內容 (哪張卡、數量、原因)。這份清單取自全部卡片文字中出現的觸發條件。

| 類別 | 事件 (內容) |
|---|---|
| 流程 | `PhaseStart(phase)`、`PhaseEnd(phase)`、`RoundEnd` |
| 敵人 | `EnemyRevealed(enemy, deck)`、`EnemyEnteredPlayer(enemy, cause: engage/pull/effect)`、`EnemyMovedToQuest(enemy, cause: push/effect)`、`EnemyAttackedByYou(enemy, AP, type)`、`EnemyWounded(enemy, n, source: attack/direct/companion)`、`EnemyDefeated(enemy, how)`、`EnemyAttacks(enemy, value, type)`、`EnemyAttackResolved(enemy, blocked, wounds, defendedWith[])` |
| 玩家傷害 | `PlayerWounded(n, source: enemyAttack/direct)`、`PlayerHealed(n)`、`SelfDamage(n)` (deal yourself / take) |
| 牌 | `CardPlayed(card, slot)`、`CardDrawn(card)`、`CardDiscarded(card, from: hand/deckTop/actionSet/attachment/effect)`、`CardMilled(card)`、`DeckReshuffled`、`CardAttached(card, target)`、`CardRecruited(card)`、`CardUpgraded(card)` |
| 進度 | `ProgressPlaced(target: location/treachery/enemy/card, n)`、`ProgressRemoved(target, n)`、`TreacheryCompleted(card)`、`TreacheryRevealed(card)` |
| 地點與移動 | `LocationExplored(location)`、`TravelStarted`、`LocationRevealed(location)` (尋找目的地時)、`BeaconSaved(location)`、`LocationDeferred(location)`、`DistanceResolved(distance)`、`Arrived(destination, via: seek/beacon/fetch/emergency)`、`SearchAction`、`ObstacleAdded/Removed/Destroyed(n)`、`PathAdded/Removed(n)`、`ThreatTokenAdded/Removed(n)` |
| 信標 | `BeaconDiscarded(location, purpose: rest/explore/effect)`、`BeaconSpent(location)` |
| 軌道與資源 | `CorruptionAdvanced(newValue)`、`ThreatTrackAdvanced(n)`、`ResistanceTrackAdvanced(n)`、`LightGained(n)`、`LightSpent(n)`、`XPGained(n)`、`XPSpent(n)`、`Growth(track)` |
| 技能 | `SkillUsed(skill)`、`SkillExhausted(skill)`、`SkillReadied(skill)`、`SkillUnlocked(skill)` |
| Shade / Shadow | `ShadeRevealed`、`ShadeEncounterStarted`、`ShadowIntervened(shadow)` |
| 即將發生 (1.6.0) | 事件發生**之前**送出，效果可以改寫內容 (EE-03 取代效果、「When taking Wound…」)：`WillWoundPlayer(n, source)`、`WillWoundEnemy(enemy, n, source)`、`WillDefeatEnemy(enemy, cancel)`、`WillPlaceLocationProgress(n)`、`WillRevealTreachery(draw)`、`WillResolveDistance(dest, distance, min, deferred)`、`WillProduceLight(n)`、`WillRefill(n)`、`WillDiscardCard(card, copies, cloneDefense)` |
| 其他 (1.6.0) | `LightProduced(n)` (P8-02 之後)、`HandRefilled` (P8-05 之後)、`CardDefended(card, enemy, defense)`、`BurnoutResolved(hit[])`；`EnemyAttacks` 帶 `delta` (這次攻擊的增減)；所有事件帶 `by` (造成事件的效果來源) 與 `seq` (第幾次最外層效果結算) |
| 夥伴 | `CompanionExhausted(use)`、`CompanionWounded(n)`、`CompanionDestroyed`、`CompanionFlipped` |
| 選用模組 | `QuestAccepted(quest)`、`QuestCompleted(quest)`、`BaronDefeated(baron)`、`EncounterAttached(location)` |
- **EE-08** 卡片文字的觸發條件，一律對應到上表的事件加上過濾條件 (例：Shout 的監聽 = `EnemyDefeated` 且 `enemy.initiative == Fast`)。若實作新卡時找不到對應事件，就新增事件並更新這張表，不要在流程程式碼裡寫特例。

### 結算順序 (引擎的心臟)

引擎維護一個**結算堆疊**。堆疊上的每一層是一個正在進行的東西，分三種：

- **流程步驟**：階段中的一個步驟 (例：P4 分配 EP)。
- **遊戲動作**：遊戲要求的例行工作 (例：棄掉行動組、產光、Staging 翻敵人、移動中的整理)，**不可被玩家效果打斷** (KC-12b 第 4 點)。
- **效果結算**：正在結算的一個效果。

規則：
- **EE-09 when / whenever / 相關 Passive**：事件發生在「效果結算」或「流程步驟」中時，觸發的效果**立即**疊到堆疊頂端先結算，結算完再回到原處 (KC-12b 第 2 點)。
- **EE-10 after**：放進「目前最外層那個效果結算」的待辦清單，等那個效果完整結算完，再立即依序結算 (KC-12b 第 3 點)。如果事件不是在效果結算中發生 (例如流程步驟)，就在該步驟完成後立即結算。
- **EE-11 遊戲動作中發生的事件**：⚠ INTERP 先記下來，等整個遊戲動作完成後，再當作「剛剛發生」處理 (先 EE-09，再 EE-10)。依據：KC-12b 第 4 點說遊戲動作中不能結算效果；Mender 的 Enduring Hope 說明 [p.29] 也是這個意思。見 OPEN-16。
  - 「條件達成就立即發生」的狀態變化 (夥伴翻面 CO-06、任務達成 SQ-07) 也適用：遊戲動作中達成條件時，在該遊戲動作完成後立即處理。**失敗條件例外**，一律立即檢查 (EE-15)。
- **EE-12 同一事件觸發多個效果**：⚠ INTERP 強制效果全部都要結算，選擇性效果由玩家決定要不要用；兩者的先後順序都**由玩家決定** (比照 KC-12a)。玩家放棄某個選擇性效果後，該效果對這個事件就不能再用 (KC-12)。見 OPEN-16。
- **EE-13 一次處理多張卡**：效果一次棄多張卡時，每棄 1 張就發出一次 `CardDiscarded`，when 效果逐張結算 (KC-12b 第 5 點)。例外：「棄掉行動組」是單一遊戲動作，依 EE-11 處理。
- **EE-14 Echo 快照**：每個「效果結算」層在開始時記錄 echo，整層結算期間 echo 不變；遇到「Then」時更新快照 (KC-21)。
- **EE-15 失敗檢查**：任何狀態改變後**立即**檢查失敗條件 (LOSE-01)，即使在堆疊中間也一樣，一旦成立就結束遊戲。勝利只在 P8 結束時檢查 (WIN-01)。
- **EE-16 敵人被擊敗**：任何來源使敵人傷害 ≥ HP (攻擊、直接傷害、夥伴攻擊) 都立即擊敗，依 P6-03 處理 (棄掉、XP、When Defeated)。Shade 與 Shadow 改為移出遊戲，不進入棄牌堆 (SH-05、SD-05；Shadow 仍給 XP)。

### 行動窗口 (玩家什麼時候可以主動做事)

主動效果 (EE-05) 只能在「行動窗口」使用。引擎在每個窗口列出目前合法的所有選項，加上「繼續」。
- **EE-17 每個階段的窗口結構**：

```
開始窗口 → (階段步驟，中間穿插一般窗口) → 結束窗口
```

  - **開始窗口**：只能結算「Start of <此階段>」效果。強制的必須結算；有多個時玩家排序 (KC-12a)。開始窗口結束後，這些效果就不能再用。
  - **一般窗口**：可以使用任何合法的主動效果 (含限定此階段的效果)、成長 (受 KC-06 限制)、搜尋行動、接任務。
  - **結束窗口**：只能結算「End of <此階段>」效果，規則同開始窗口。
- **EE-18 各階段的一般窗口位置**：

| 階段 | 一般窗口 |
|---|---|
| P1 Staging | 翻完敵人之後 (翻敵人是遊戲動作，中間沒有窗口)。Shade/Shadow 在結束窗口**之後**才進場 (P1-03、SD-03) |
| P2 Action Set | 打出 3 張卡之前、之後 |
| P3 Engagement | 接戰之前、之後 |
| P4 Darkness | 計算 EP 之前 (棄信標)、計算之後與分配之前、分配之後 |
| P5 Explore | 放進度之前。地點探索完成到移動結束之間**沒有**一般窗口 (p.55)，但觸發效果照常結算 |
| P6 Attack | 每次分配 AP 之前、之後 (分配進行中不可成長，KC-06) |
| P7 Defend | 每個敵人攻擊之前、之後 (攻擊結算中不可成長，KC-06) |
| P8 Refresh | 每個步驟之間。注意：棄掉行動組 (P8-04) 之後技能不再啟動 |
- **EE-18a 階段中的強制效果**：⚠ INTERP 敵人、地點、Treachery legacy 等**非玩家**效果，寫著「X Phase: …」或「during the X Phase」、但沒有 Start of / End of 的強制效果 (例：Flats of Mil-Bereth「Refresh Phase 中每個 tracker +1 威脅指示物」、Ruins of Crowbridge「Darkness Phase: …」、Sol「每個 Refresh Phase +1 Path」)：玩家可以在該階段的一般窗口中選擇時點結算；到了該階段的結束窗口還沒結算的，在結束窗口**一定**結算。條件取決於狀態的 (例：「任務區每個 tracker」)，以結算當下的狀態計算。依據：KC-12a 只規定玩家效果可在階段中任意時點；規則書沒有提到非玩家效果。
- **EE-19** 移動過程中 (T1–T5) 不可做搜尋行動 (KC-29)，也沒有一般窗口；只結算觸發效果與 T1 的玩家選擇。

### 計數規則
- **EE-20** `1x` 的次數**以效果來源分開計算**，每回合重置。例：兩張不同卡上的 1x 效果各可用一次。技能的 1x 例外見 KC-18 (橫置可第二次使用)。
- **EE-21** 敵人、地點、Treachery 文字中的「Once per round」「the first N … each round」，以回合為單位計數。⚠ INTERP：文字只寫「the first N」而沒寫期間的 (例：Sol Starcaster「The first 2 {Progress} you would place…」)，以**每回合**重置計算。
- **EE-22** 「This round」的持續效果在 `RoundEnd` 移除。「Until the discard step」(橫置以啟動的技能) 在 P8-04 移除。

### 實作建議
- **EE-23 不要解析卡片文字**：每張卡的效果寫成程式 (以 `card id + 效果序號` 對應)，用一組**效果積木**組合。`cards.json` 的文字只作為顯示與對照。常用積木 (從全部卡片文字歸納)：
  - 資源：`gainXP / payXP`、`gainLight / spendLight`、`advanceTrack(track, n)` (腐化、威脅、抗性)
    - 「免費光」(Paul 確認採用此做法)(例：Farhome「You may spend 1 free {Light} once per round」)：本回合任一次花光時 (P2 光費或效果花光)，可以少付 1；這也讓 P2-05 的「付得起」判斷多 1 光。結果和 Example Turn Guide 的示範 (付完光費後光 +1) 相同，但不受光軌道上限 20 影響。
  - 傷害：`dealSelfWound(n)`、`dealEnemyWound(enemy, n)`、`heal(n)`、`wound/heal companion`
  - 指示物：`placeProgress(target, n)`、`removeProgress(target, n)`、`addObstacle / removeObstacle / destroyObstacle`、`addPath / removePath`、`addThreatToken / removeThreatToken`
  - 敵人：`pull(enemy)`、`push(enemy)`、`disarm(enemy)`、`revealEnemy(deck, dest)`、`engageAll(filter)`
  - 牌：`draw(n)`、`discardFromHand(n)`、`mill(n)`、`regenerate(n)`、`recruit(n)`、`upgrade(n)`、`attach(card, target)`、`cycle(card)`、`scout(deck, n)`
  - 技能：`unlockSkill`、`exhaustSkill`、`readySkill`、`swapCubes`
  - 特質與數值：`grantTrait(card, trait, until)`、`removeTrait`、`addModifier(selector, stat, value, until)`、`addRestriction(predicate, until)`、`addReplacement(…)`、`addListener(event, filter, effect, mode, until)`
  - 選擇：`choose(options)`、`chooseTarget(filter)`、`forEach(filter, effect)`
- **EE-24 玩家決策**：引擎遇到需要玩家決定的地方就停下，產生一個型別化的「待決策」(選項清單 + 合法性)。只有一個合法選項時自動選擇；KC-12f 的「必須選能完全結算的選項」由引擎計算合法性後套用。
- **EE-25 可重現性**：所有洗牌使用可設定種子的亂數產生器，並且每一步都記錄日誌。測試劇本需要固定牌序 (`shuffle: false`) 時直接指定順序。
- **EE-26 撤銷**：因為所有狀態都在一份可複製的遊戲狀態中 (`01-state-and-data.md`)，每個玩家決策前保存快照即可支援悔棋。
