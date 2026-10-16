# 狀態、術語與資料表 (共用)

所有模組都會用到的基礎：卡片圖示代碼、遊戲狀態的資料結構、術語詞典、軌道數值資料表。

## 圖示對照 (cards.json 的 `{Token}`)

| Token | 意義 |
|---|---|
| `Basic` / `Advanced` | 玩家卡基礎面 / 進階面 |
| `Fast` / `Slow` | 敵人先攻：快 / 慢 |
| `Physical` / `Photonic` | 玩家卡的攻擊與防禦類型 |
| `Defense` | 玩家卡防禦值 |
| `PhysicalDefense` / `PhotonicDefense` | 敵人防禦類型 (同時也是敵人的攻擊類型)。卡上兩個盾並列 = 雙重類型，`cards.json` 中記為 `Both` (P6-02、P7-01) |
| `Earth` / `Fire` / `Wind` | 元素 |
| `Progress` | 進度指示物 |
| `Darkness` | 敵人黑暗值 |
| `EnemyAttack` | 敵人攻擊值 |
| `Attack` / `MainAttack` | 玩家主攻擊值 (攻擊卡提供) |
| `AttackBoost` | 攻擊加成 |
| `MainExplore` | 玩家主探索值 (探索卡提供) |
| `ExploreBoost` | 探索加成 |
| `XP` | 經驗值 |
| `Quest` | 任務區 (Quest area) |
| `Player` | 玩家區 (Player area) |
| `Wound` | 傷害 |
| `HP` | 生命值 |
| `Distance` | 距離 / 距離軌道 |
| `Path` / `Obstacle` | 道路 / 障礙指示物 |
| `Light` | 光 |
| `Beacon` | 信標 |
| `Unlocked` | 已解鎖技能 / 解鎖技能 |
| `ThreatTrack` / `ThreatToken` | 威脅軌道 / 威脅指示物 |
| `ResistanceTrack` | 抗性軌道 |
| `Corruption` | 腐化 |
| `AbilityGrowth` / `CharacterGrowth` | 能力成長軌道 / 角色成長軌道 |
| `Engagement` | 敵人接戰數 |
| `Upgrade` / `Recruit` | 升級 / 招募玩家卡 |
| `PermBooster` | 獲得永久加成卡 |
| `Rest` | 物理休息值 |
| `HandSize` | 手牌上限 |
| `Action` | 卡片行動 |
| `Dusk` / `Doom` / `Shade` / `Shadow` | 敵人等級 |
| `Companion` | 夥伴 (見 `11-companions.md`) |
| `Exhaust` / `Destroy` / `Flip` | 夥伴的橫置效果 / 摧毀效果 / 翻面條件 |
| 效果類型 | `1x`, `Mandatory1x`, `Passive`, `Unrestricted`, `MandatoryUnrestricted`, `Eager1x`, `EagerUnrestricted`, `EagerPassive`, `EagerMandatory1x`, `EagerMandatoryUnrestricted` (見 KC-10) |
| 敵人派系 | `Prowler`, `Plotter`, `Cabalist`, `Disruptor` |
| 地形特質 | `Tree`, `Mountains`, `Plant`, `DeadTree`, `Skull`, `Pond`, `Hills`, `Thorn`, `Lair` |

## 遊戲狀態模型

### 玩家
| 欄位 | 說明 |
|---|---|
| `luminary` / `profession` | 選擇的角色與職業 (各一張技能墊) |
| `deck` | 牌庫 (有順序，頂端可被查看/棄掉，見 P7) |
| `hand` | 手牌 |
| `discard` | 棄牌堆 (有順序；頂端 = echo，見 KC-20) |
| `actionSet` | `{ action, attack, booster, explore }` 4 個卡槽 |
| `permBoosters` | 已裝備的永久加成卡 (一律基礎面) |
| `hobbyDeck` / `hobbyMarket` | 嗜好牌庫 / 市場 (2 張正面 + 牌庫頂端) |
| `permBoosterSource` | 永久加成來源牌庫 |
| `skills[12]` | 每個技能：`{ column, row, cubeElement, unlocked, exhausted, activatedByExhaustThisRound, usesThisRound }` |
| `wounds` | 角色身上的傷害數 |
| `xp` | 持有的 XP |
| `light` | 光軌道位置 |
| `abilityGrowthPos` / `characterGrowthPos` | 兩條成長軌道位置 |
| `beacons` | 已保存的信標 (地點卡列表) |
| `beaconMatReady` | 信標墊是否 Ready (搜尋行動可用) |
| `fetchReady` | New Location 指示物是否為「Fetch: Ready」面 |
| `companions` | 夥伴：`{ card, side, exhausted, wounds }` (`11-companions.md`) |
| `rewards` | 已取得的支線任務、Baron、限定任務獎勵 (`14`、`15`、`16` 號檔) |

### 世界
| 欄位 | 說明 |
|---|---|
| `questArea` | 敵人佇列，**右端 = 前端** |
| `playerArea` | 已接戰的敵人列表，新進入者放**左端 (後端)** |
| `duskDeck` / `doomDeck` 與各自棄牌堆 | 敵人牌庫 |
| `treacheryDeck` | Treachery 牌庫 |
| `activeTreachery` + `progress` | 目前的 Treachery 與其上的進度 |
| `completedTreacheries` | 已完成的 Treachery (其 legacy 效果持續生效) |
| `locationDeck` / `locationDiscard` | 地點牌庫 / 棄牌堆 |
| `activeLocation` | 目前地點，含 `progress`, `threatTokens`, `paths`, `obstacles`, `attachments` |
| `newLocationTokenOnLocation` | New Location 指示物是否在目前地點上 (見 P8-01) |
| `deferred` | 本次移動延後的地點 |
| `shade` | 選擇的 Shade (背面文字 / 正面戰鬥數值) |
| `shadeRevealed` / `shadeDefeated` | Shade 狀態 |
| `corruption`, `distanceBox`, `threat`, `resistance` | 腐化墊上的 4 個方塊。`distanceBox` 是距離方塊所在的框 (見 T2b) |
| `shadeInfluence` | Shade 影響軌道位置 (= 已探索地點數) |
| `round`, `phase` | 回合數與目前階段 |
| `shadows` | Shadow：`{ card, side: meddler/enemy, interveneTriggered }` (`12-shadows.md`) |
| `questBoard` | 任務板方塊位置、5 張公開任務、進行中與已完成任務 (`14-side-quests.md`) |
| `encounters` | 附著在地點上的 Baron 遭遇卡、場上的 Baron 與其隨從 (`16-location-barons.md`) |

### 每回合暫存
`activeElement` (加成卡元素)、`AP` 池、`EP`、本回合已使用的 1x 效果、Disarm 的敵人、本回合新增/移除的特質、本回合效果修正值。**效果只在觸發的那一回合有效，除非效果另有說明。** [p.26]

## 術語詞典 [p.39–41]

- **KC-30**
  | 關鍵字 | 定義 |
  |---|---|
  | Clone | 卡片的虛擬複製品，與原卡相同；不能被效果修改；建立它的效果結算完後消失。 |
  | Collection | 玩家擁有、但開局時不在遊戲中的元件。 |
  | Cycle | 放到對應牌庫的底部。 |
  | Disarm | 該敵人本回合不攻擊。 |
  | Discard | 移到對應的棄牌區。玩家卡 → 玩家棄牌堆頂端；地點 → 地點棄牌堆；敵人 → 對應的 Dusk/Doom 棄牌堆；指示物 → 供應區。附著卡與其上的指示物一併棄掉 (移動時的例外見 P5-T3)。 |
  | Echo | 見 KC-20。 |
  | Engage / Engaged | 敵人在 Engagement Phase 從任務區進入玩家區 = 接戰。玩家區的敵人 = 與你接戰中。 |
  | Mill N | 把牌庫頂端 N 張移到棄牌堆頂端。牌庫用完就重洗 (腐化 +1) 並繼續。**Mill 不算棄牌。** |
  | Push / Pull | 見 KC-04。 |
  | Recruit | 查看嗜好市場的 3 張 (2 張正面 + 嗜好牌庫頂端，頂端那張也算市場的一部分，可以看)。選 1 張加入手牌 (基礎面)，再從剩下 2 張選 1 張放到嗜好牌庫底部，然後補到 3 張可見 (嗜好牌庫與市場只剩 2 張時，就是 2 張) [p.24]。 |
  | Regenerate X | 把棄牌堆**底部** X 張移到牌庫**底部**。 |
  | Reveal / When Revealed | 翻開對應牌庫頂端的卡並放到位置上。Treachery → 成為進行中的 Treachery。敵人 → 任務區，`Fast` 放前端、`Slow` 放後端。放好後**立即**結算 When Revealed 效果。效果要求「翻開敵人直到…」但**沒指定牌庫**時 (例：Greed、Pride、Wrath 的 When Revealed)，⚠ INTERP 依 P1-02 的程序：剩餘需求 ≥ 5 翻 Doom，否則翻 Dusk。 |
  | Scout X | 查看對應牌庫頂端 X 張，原順序放回 (可公開記錄)。 |
  | Tracked | 敵人身上的 `Progress` ≥ 其 `Darkness`。 |
  | Trapped | 敵人附著了一張有 trap 特質的卡。 |
  | Tranced | 敵人附著了一張有 trance 特質的卡。 |
  | Upon Arrival | 地點的效果：以此地點為目的地的移動結算完成後，**立即**結算一次。 |

## 資料表 (`data/tracks.json`)

軌道墊上的數值存放在 `data/tracks.json`，依 `normal` / `hard` 分面。引擎一律從檔案讀取，**不要寫死在程式中**。數值由 Claude 從 PnP 圖片判讀，狀態為「待 Paul 對照實體墊確認」。

- **D-01 成長墊** (`growth.<side>`)
  - `ability.start` / `character.start`：方塊起點 (第 0 格) 的效益，開局即生效。
  - `ability.spaces[i]`：第 i+1 格的 `cost` (XP) 與效益 `unlock` / `recruit` / `upgrade` (數量)。
  - `character.spaces[i]`：第 i+1 格的 `cost` 與效益 `light` / `hand_size` / `rest` (新數值) / `perm_booster` (數量)。目前值依 KC-08 取「至今出現過的最大值」。
  - `light_track`：範圍 0–20。`engagement` 每個區段列出涵蓋的格子、接戰數 `engage`、附加的 `reveal` (依序各翻 1 張) 與 `wounds`。
- **D-02 距離軌道** (`corruption.<side>.distance_track`)：`boxes[i]` 是第 i 個框 (box 0 = 起點，無推進)，含方塊**到達該框**時推進的 `threat` 與 `resistance` 格數。`start_box_by_corruption[腐化值]` = 重設時的起點框 (T2b)。超出 `max_box` 時，每多 1 點距離放 `overflow_threat_tokens_per_distance` 個 ThreatToken (T2c)。
  - ⚠ INTERP：發生溢出時，方塊停在最右框，**仍然**獲得該框的推進值，再加上溢出的 ThreatToken。
- **D-03 威脅軌道** (`threat_track.value[格子]`)：方塊所在格子的威脅值 (P1-01)。
- **D-04 抗性軌道** (`resistance_track.value[格子]`)：方塊所在格子的抗性值 (加到 EV，P5-02)。
- **D-05 Shade 影響墊** (`shade_influence.<side>.spaces`)：依序 12 格，方塊從第 0 格 (`start`) 開始，每次 T4 前進 1 格。每格的 `threat` (僅揭示回合的威脅加值) 或 `xp` (立即獲得) 見 SH-03。
- **D-06 任務板** (`quest_board.<side>`，支線任務模組)：方塊從 0 開始，前進到第 i 格需支付 `ep[i-1]` **或** `xp[i-1]` (擇一)。normal：EP 3/4/5/6/7 或 XP 4/5/6/7/8；hard：EP 3/5/7/8/9 或 XP 4/5/6/8/10。

### 驗證點 (已和規則書範例比對，全部吻合)
| 規則書範例 | 資料表 |
|---|---|
| 開局光產出 4、手牌 6、休息 2 [p.17] | `character.start` |
| 威脅軌道第 3 格 → 威脅值 4 [p.44] | normal `threat_track.value["3"] = 4` |
| 光軌道第 13 格 → 接戰 2 [p.48] | normal 區段 12–15 = 2 |
| 移動 3 距離 → 威脅 +2、抗性 +3 [p.58] | 腐化 2–4 時起點 box 1，前進 3 → box 4 = (2, 3) |
| 腐化 1、移動 5 距離 → 威脅 +3、抗性 +5 [Example Turn Guide p.13] | box 0 前進 5 → box 5 = (3, 5) |
| 解鎖總數 = 12 個技能 | 1 + 2+2+2+2+3 = 12 (兩面皆同) |
| 最終移動前探索 6 個地點 → +2 XP；只探索 1–2 個 → 有威脅加值 [p.68] | normal：第 7 格 (標示「4」) = +2 XP；第 2、3 格 = +7、+3 威脅 |
