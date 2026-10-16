# 待決議事項與玩家決策點

## 待決議事項 (OPEN)

引擎先照「預設」實作，並集中在設定中，方便 Paul 決定後修改。

| 編號 | 問題 | 預設 |
|---|---|---|
| ~~OPEN-01~~ | luminary 第 1 欄與 profession 第 0 欄的技能是否相鄰？ | **已解決**：同一列相鄰，見 KC-13 |
| ~~OPEN-02~~ | Action Set Phase 時手牌不足 3 張怎麼辦？(P2) | **已解決 (Paul 確認)**：正常遊戲不會發生。手牌上限最少 6，每回合 P8 補滿；P8 到 P2 之間只有 Staging，會減少手牌的效果很少 (Djinn of Ire 少抽 1 張、Baron The Collector 每回合收 1 張)。只有牌庫與棄牌堆都空了、補不了牌時才可能發生，此時仍視為付不起，判定失敗 (保護用) |
| OPEN-03 | 敵人牌庫或 Treachery 牌庫翻完時怎麼辦？ | 敵人：該棄牌堆洗成新牌庫；Treachery：不再翻新的 (保持無進行中 Treachery，黑暗進度不再累積)。Paul 也不確定，先用預設。註：Treachery 共 15 張，已完成數達到 Shade 上限就失敗 (TR-01)，實務上翻不完；敵人牌庫 (Dusk 28、Doom 20) 在長局中有可能翻完 |
| ~~OPEN-04~~ | 移動距離最小值？ | **已解決**：最小值 1 (參考卡)，見 T2a。原預設 0 是錯的 |
| ~~OPEN-05~~ | 防禦時，可以先查看牌庫頂端的卡再決定是否棄掉嗎？(P7-02) | **已解決 (Paul 確認)**：可以；類型不符則不能棄，該卡留在牌庫頂端 |
| ~~OPEN-06~~ | 尋找目的地時地點牌庫翻完？(T1c) | **已解決 (Paul 確認)**：必須從已翻開的卡或信標中選擇目的地；都沒有時，把地點棄牌堆洗成新牌庫 |
| ~~OPEN-07~~ | Engagement 時移入玩家區的一組敵人，彼此的順序？(P3-02) | **已解決 (規則書 p.22，KC-03)**：敵人從任務區移到玩家區時，不論 Fast/Slow，一律放到玩家區最左端。從最右邊 (最前面) 的敵人開始逐一移動，結果就是保持原本的相對順序。Fast/Slow 只決定敵人**進入任務區**時放哪一端 (KC-04、KC-30 Reveal) |
| ~~OPEN-08~~ | 光軌道在 0 以下或超過上限時？ | **已解決 (Paul 確認)**：夾在 0 與上限之間；花費時不能低於 0 (付不起 = P2-05) |
| ~~OPEN-09~~ | 威脅、抗性軌道超過第 27 格，或 Shade 影響墊超過最後一格時？ | **Paul 同意用預設**：停在最後一格 |
| ~~OPEN-10~~ | Shade 進場與「End of Staging」效果的先後順序？ | **已解決**：Staging 全部完成後 Shade 才進場，End of Staging 效果作用不到它 (P1-03)。原預設「Shade 先進場」是錯的 |
| ~~OPEN-11~~ | 需要抽牌或 Mill，但牌庫與棄牌堆都空了？(KC-27a) | **Paul 同意用預設**：略過，不增加腐化 |
| OPEN-12 | Shadow 的介入條件在 Staging Phase 進行中成立 (例：Vanity Wisps「威脅 ≥ 6」) 時，是這個 Staging 結束就進場，還是下一回合？(SD-03) | 這個 Staging 結束就進場 (「下一個結束的 Staging Phase」) |
| OPEN-13 | 「Special Victory Condition 任務必須在 Shade 決戰前接下」是強制接，還是期限？(SQ-09) | 期限：決戰開始後就不能再接；不強制接 |
| OPEN-14 | Baron 任務遭遇指定的座標，對應的地點已被移出遊戲或不存在？(LB-02) | 重新抽第 2 張，直到座標對應的地點在地點牌庫中 |
| OPEN-15 | 支線任務的 EP 付費時機 (SQ-05)：只能在 Darkness Phase 分配 EP 時嗎？ | 是 |
| ~~OPEN-16~~ | 同一事件觸發多個效果的順序 (EE-12)，以及遊戲動作中發生的事件延後處理 (EE-11) | **Paul 同意用預設**：玩家決定順序；遊戲動作完成後才處理 |
| OPEN-17 | 夥伴攻擊是否算「你的攻擊」？(CO-02) | 不算，除非文字提到夥伴 |
| ~~OPEN-18~~ | 兩次移動之間腐化上升時，距離方塊要不要跟著移？開局腐化不是 1 時方塊放哪？ | **已解決 (Paul 確認)**：只在移動結束時重設，腐化上升不跟著移；開局放最左邊的框 (T2b、SU-09) |
| OPEN-19 | 敵人攻擊另一個敵人 (Trap of Madness、Find Balance+、Reprioritize) 怎麼算傷害？ | 攻擊者的攻擊值 − 目標對攻擊者類型的防禦值；攻擊者是雙重類型時取目標較低的防禦。算直接傷害，不算「你的攻擊」 |
| OPEN-20 | 「移除 Obstacle」算不算「摧毀 (destroy)」？(Cold Roar) | 算 |
| OPEN-21 | Step Lightly「避免的接戰數」何時計算？ | 使用當下以目前的光計算 |
| OPEN-22 | Wrath 的攻擊 X 是什麼？ | 本回合 Wrath 翻開的 Treachery 的 PV；還沒翻開時依 KC-05a X = 1 |
| OPEN-23 | Enduring Hope「echo 的元素也算啟動」是否也啟動永久加成卡？ | 只影響技能；Enduring Hope 本身要先因加成卡元素或橫置而啟動 (只算一層) |
| OPEN-24 | Hidden Depth 可以用在哪些棄牌？ | 效果棄牌與防禦棄牌 (含牌庫頂端)；Refresh 棄行動組不行。clone 防禦 1 (腐化 > 5 時 2) |
| OPEN-25 | Spark「下一次 Character Growth」的折扣保留多久？ | 到回合結束 |
| OPEN-26 | At All Costs 用的時候本回合已經成長過？ | 折扣無效 (只折「本回合第一次成長」) |
| OPEN-27 | Garadeth Shieldbearer「if you have cards remaining in your hand」 | 手牌還有任何一張卡就不能用牌庫防禦 |
| OPEN-28 | Glacian Seafare / Terrimorian Lurker 的「放 Progress」怎麼計次？ | 每一次放置事件分別判斷；Glacian 自己加的 +2 不再觸發 |
| OPEN-29 | Necro-Mage「instead of defeating」 | 視為取代效果：在擊敗前結算；改為重新翻開時傷害歸零、不給 XP |
| OPEN-30 | Unfailing Stamina「If you will advance Corruption this round」 | 牌庫張數少於 Refresh 補牌需要的張數 (會重洗) |
| OPEN-31 | Resist「For every 2 unspent XP, give 1 card +1 Defense」 | 每 2 XP 給手牌某張卡 +1 防禦，可分給不同的卡，最多 +5 |
| OPEN-32 | Pride「including remainder of round Pride is defeated」 | Pride 在玩家區被擊敗時，接戰敵人 +2 攻擊持續到回合結束 |
| OPEN-33 | Envy 背面：玩家區地點的 EP 分配與探索 | Explore Phase 先決定分給玩家區地點的 EP，剩下的放目前地點；玩家區地點的 EV 不加抗性軌道；Eldirith Mountains 在玩家區時「抵達後下一回合」條件視為已成立 |
| OPEN-34 | Equilibrium 的「leftmost column」「second column」 | Luminary 墊的第 0 欄 / 第 1 欄 |
| OPEN-35 | Singular Focus 的光費 −2 何時判斷技能啟動？ | 以這次要打出的加成卡元素判斷 |
| OPEN-36 | Find a Way「After an effect allows you to push enemies」一次效果 push 多個敵人 | 每次效果結算只觸發一次 |
| OPEN-37 | Striking Gold+「discarding your action set counts」：這張卡本身也在被棄的行動組裡 | 打出時登記到回合結束，所以 Refresh 棄行動組時也會觸發 |
| OPEN-38 | Firestorm 在最終地點移除 Progress | 最終地點恢復為未探索 (FL-03) |
| OPEN-39 | Cold Roar+「The pulled enemies grant their traits」持續多久？ | 到回合結束 (KC-16) |

## 玩家決策點 (引擎需要暫停等待輸入的地方)

開局 SU-01/03/05/06/07、Shade 選擇 SU-15；成長 (KC-06 允許的任何時候)；P2 打出 3 張卡；P4 棄信標、cover 分配；T1 目的地方式與每張翻開地點的選擇；P6 每次 AP 分配；P7 攻擊順序與每次防禦用卡；P8 休息、棄牌順序、額外棄手牌；可選效果 (1x / Unrestricted / may) 的使用時機；多個 Start of / End of 效果的順序；KC-12f 的選項選擇；同一事件觸發多個效果的順序 (EE-12)；取代效果的順序 (EE-03)。

選用內容另外加上：夥伴的橫置用途與時機 (CO-02)、Destroy 的使用 (CO-05)；支線任務的開局換牌與選擇 (SQ-03/04)、接任務與付費方式 (SQ-05)；Baron 連續遭遇的選擇 (LB-03)、是否忽略最終地點的遭遇、Fast/Slow 選擇 (LB-08)；Twin Flames 的各種共同決定 (TF-19 等)。
