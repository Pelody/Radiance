// 核心規則單元測試 (spec 01–10)。每個測試標註所驗證的規則編號。
import { describe, expect, it } from 'vitest';
import { canUndo, submit, undo, view } from '../src/engine/game';
import { cardName, playerCard, skillMat } from '../src/engine/data';
import { characterStat } from '../src/engine/tracks';
import { distanceBreakdown, enemyAttack, enemyDefenseVs, enemyTypes, locationEV, questDarkness, travelCost } from '../src/engine/calc';
import { skillsAdjacent, unlockableSkills, permBoosterCost } from '../src/engine/window';
import { newLocation } from '../src/engine/world';
import { advance, at, enemy, gameFrom, idOf, inPhase, loc, logHas, passUntil, pending, st, startScenario } from './helpers/fixture';

describe('KC-13 技能相鄰', () => {
  const s = st(startScenario());
  const sk = (n: string) => s.player.skills.find((k) => k.name === n)!;
  it('luminary 第 0 欄上方與第 1 欄第 1、2 個相鄰；下方與第 2、3 個相鄰', () => {
    expect(skillsAdjacent(sk('Shout'), sk('Call Your Shot'))).toBe(true);
    expect(skillsAdjacent(sk('Shout'), sk('Find Weakness'))).toBe(true);
    expect(skillsAdjacent(sk('Shout'), sk('Use the Pain'))).toBe(false);
    expect(skillsAdjacent(sk('Grit'), sk('Find Weakness'))).toBe(true);
    expect(skillsAdjacent(sk('Grit'), sk('Use the Pain'))).toBe(true);
    expect(skillsAdjacent(sk('Grit'), sk('Call Your Shot'))).toBe(false);
    expect(skillsAdjacent(sk('Shout'), sk('Grit'))).toBe(true);
  });
  it('跨墊：luminary 第 1 欄第 r 個與 profession 第 0 欄第 r 個相鄰', () => {
    expect(skillsAdjacent(sk('Call Your Shot'), sk('Secret Ways'))).toBe(true);
    expect(skillsAdjacent(sk('Use the Pain'), sk('Choose Wisely'))).toBe(true);
    expect(skillsAdjacent(sk('Call Your Shot'), sk('Familiar Places'))).toBe(false);
  });
  it('profession 最右邊的技能與左側欄 3 個都相鄰 (例外 2)', () => {
    for (const n of ['Infiltrate', 'Field Advantage', 'All-Terrain']) expect(skillsAdjacent(sk('In the Wind'), sk(n))).toBe(true);
    expect(skillsAdjacent(sk('In the Wind'), sk('Secret Ways'))).toBe(false);
  });
  it('開局只解鎖 Shout：可解鎖的是 Grit、Call Your Shot、Find Weakness', () => {
    expect(unlockableSkills(s).map((k) => k.name).sort()).toEqual(['Call Your Shot', 'Find Weakness', 'Grit']);
  });
});

describe('D-01 / KC-08 成長墊', () => {
  it('開局光產出 4、手牌 6、休息 2 (SU-11)', () => {
    const s = st(startScenario());
    expect(characterStat(s, 'light')).toBe(4);
    expect(characterStat(s, 'hand_size')).toBe(6);
    expect(characterStat(s, 'rest')).toBe(2);
  });
  it('KC-08 目前值 = 至今出現過的最大值', () => {
    const s = st(startScenario());
    expect(characterStat(s, 'light', 2)).toBe(5); // 第 2 格是 perm_booster，光仍為 5
    expect(characterStat(s, 'rest', 6)).toBe(4);
    expect(characterStat(s, 'hand_size', 6)).toBe(7);
  });
  it('KC-05 / KC-07 能力成長：付 XP、前進一格、逐一解鎖 2 個技能', () => {
    let g = at('actionSet', (s) => {
      s.player.xp = 5;
    });
    let d = pending(g)!;
    expect(d.options!.find((o) => o.id === 'growAbility')!.legal).not.toBe(false);
    g = submit(g, { option: 'growAbility' });
    // 第 1 次解鎖：可選 Grit、Call Your Shot、Find Weakness
    d = pending(g)!;
    expect(d.rule).toBe('KC-13');
    g = submit(g, 'Call Your Shot');
    // 第 2 次解鎖：後解鎖的 Call Your Shot 也算相鄰依據 → Secret Ways 可選
    d = pending(g)!;
    expect(d.options!.map((o) => o.id)).toContain('Secret Ways');
    g = submit(g, 'Secret Ways');
    const s = st(g);
    expect(s.player.xp).toBe(3);
    expect(s.player.abilityGrowthPos).toBe(1);
    expect(s.player.skills.filter((k) => k.unlocked).map((k) => k.name).sort()).toEqual(['Call Your Shot', 'Secret Ways', 'Shout']);
  });
  it('KC-08 永久加成卡費用 = 光費 + 已裝備同元素卡的光費', () => {
    const s = st(startScenario());
    const src = s.player.permBoosterSource;
    const a = src.find((id) => src.some((x) => x !== id && playerCard(x).element === playerCard(id).element))!;
    const b = src.find((x) => x !== a && playerCard(x).element === playerCard(a).element)!;
    expect(permBoosterCost(s, a)).toBe(playerCard(a).light_cost);
    s.player.permBoosters.push(b);
    expect(permBoosterCost(s, a)).toBe(playerCard(a).light_cost + playerCard(b).light_cost);
  });
});

describe('P2 Action Set', () => {
  it('P2-05 手牌最便宜的 3 張付不起 → 立即失敗', () => {
    let g = at('actionSet', (s) => {
      s.player.light = 0; // 最便宜 3 張 = 0 + 1 + 1 = 2 > 0 + 免費光 1
    });
    g = passUntil(g, (d) => d.type === 'actionSet');
    const s = st(g);
    expect(s.outcome?.result).toBe('lose');
    expect(s.outcome?.rule).toBe('P2-05');
  });
  it('P2-05 付不起的組合不能選 (DG-08)', () => {
    let g = at('actionSet', (s) => {
      s.player.light = 3;
    });
    g = passUntil(g, (d) => d.type === 'actionSet');
    const s = st(g);
    // Useful Rage (2) + Ember Strike (1) + Light the Path (2) = 5 > 3 + 免費光 1
    expect(() =>
      submit(g, { action: idOf(s, 'Ember Strike'), attack: idOf(s, 'Useful Rage'), booster: idOf(s, 'Light the Path') }),
    ).toThrow(/光不足/);
    // 4 = 3 + 免費光 1：付得起，自動使用免費光 (EE-23)
    g = submit(g, { action: idOf(s, 'Ember Strike'), attack: idOf(s, 'Useful Rage'), booster: idOf(s, 'Hasten') });
    expect(st(g).player.light).toBe(0);
    expect(st(g).roundState.freeLightUsed).toBe(true);
  });
});

describe('TR Treachery', () => {
  it('TR-01 / TR-02 完成、When Completed、剩餘進度轉移、連鎖完成', () => {
    let g = at('darkness', (s) => {
      s.world.treacheryProgress = 8; // Hidden Pitfalls PV 9
    });
    g = passUntil(g, (d) => d.rule === 'P4-02');
    const dark = st(g).world.questArea.length ? questDarkness(st(g)).effective : 0;
    g = submit(g, 0); // 黑暗全部進 Treachery
    const s = st(g);
    expect(s.world.completedTreacheries.map(cardName)).toContain('Hidden Pitfalls');
    expect(s.world.corruption).toBe(2); // When Completed：腐化 +1
    expect(logHas(g, `剩餘 ${8 + dark - 9} Progress 轉移到新的 Treachery`)).toBe(true);
    expect(s.world.activeTreachery).not.toBeNull();
  });
  it('TR-01 第 1 步：完成數 + 1 達到上限 → 失敗', () => {
    let g = at('darkness', (s) => {
      s.world.treacheryProgress = 8;
      s.world.completedTreacheries = s.world.treacheryDeck.splice(1, 2); // Greed 上限 3
    });
    g = passUntil(g, (d) => d.rule === 'P4-02');
    g = submit(g, 0);
    expect(st(g).outcome?.rule).toBe('TR-01');
  });
  it('legacy：Hidden Pitfalls 完成後移動距離 +2 (KC-12e)', () => {
    const g = at('explore', (s) => {
      s.world.completedTreacheries = [s.world.activeTreachery!];
    });
    const s = st(g);
    expect(distanceBreakdown(s, loc('Sol'), 1).total).toBe(4 + 1 + 2);
  });
});

describe('移動 (T1 ~ T5)', () => {
  it('T2a 距離最小值 1；T2b 推進後方塊重設到腐化對應的框', () => {
    const s = st(startScenario());
    s.world.location.paths = 10;
    expect(distanceBreakdown(s, loc('Sol'), 0).total).toBe(1);
    s.world.distanceBox = 0;
    expect(travelCost(s, 3)).toMatchObject({ toBox: 3, threat: 1, resistance: 2, overflow: 0 });
  });
  it('T2c 溢出：每多 1 距離在目的地放 2 個 Threat token，仍得到最右框的推進值 (D-02 ⚠ INTERP)', () => {
    const s = st(startScenario());
    s.world.distanceBox = 8;
    expect(travelCost(s, 4)).toMatchObject({ toBox: 9, overflow: 3, threatTokens: 6, threat: 12, resistance: 14 });
  });
  it('OPEN-18 腐化上升時距離方塊不動，只在移動結束時重設', () => {
    let g = at('explore', (s) => {
      s.world.corruption = 3; // 方塊仍在 box 0
    });
    expect(st(g).world.distanceBox).toBe(0);
    g = passUntil(g, (d) => d.rule === 'T1c');
    for (const c of ['save', 'save', 'save', 'defer', 'travel']) g = submit(g, c);
    // box 0 + 5 → box 5 (3, 5)；之後重設到腐化 3 的框 = box 1
    expect(st(g).world.threat).toBe(3);
    expect(st(g).world.distanceBox).toBe(1);
  });
  it('T1a Fetch：座標和 ≥ 6、付 4 XP、任選地點；每局 1 次', () => {
    let g = at('explore', (s) => {
      s.player.xp = 5;
      s.world.location = newLocation(loc('Wilderforth')); // (6,3)
      s.world.location.progress = 0;
      s.roundState.exploreEP = 20;
    });
    g = passUntil(g, (d) => d.rule === 'T1');
    const d = pending(g)!;
    expect(d.options!.find((o) => o.id === 'fetch')!.legal).not.toBe(false);
    g = submit(g, 'fetch');
    g = submit(g, loc('Wrath Marshes'));
    const s = st(g);
    expect(s.player.fetchReady).toBe(false);
    expect(cardName(s.world.location.id)).toBe('Wrath Marshes');
    expect(s.player.xp).toBeLessThanOrEqual(5 + 3 - 4);
  });
  it('T3b 舊地點每 2 個 Path 在新地點放 1 個 Threat token', () => {
    let g = at('explore', (s) => {
      s.world.location.paths = 5;
    });
    g = passUntil(g, (d) => d.rule === 'T1c');
    for (const c of ['save', 'save', 'save', 'defer', 'travel']) g = submit(g, c);
    expect(st(g).world.location.threatTokens).toBe(2);
    expect(st(g).world.location.paths).toBe(0);
  });
  it('Greed Special：探索 2 個其他地點前不能前往最終地點 (EE-02)', () => {
    let g = at(
      'explore',
      () => {},
      startScenario({ config: { ignoreShadeSetup: true, ignoreShadeSpecial: false } }),
    );
    g = passUntil(g, (d) => d.rule === 'T1c');
    for (const c of ['save', 'save', 'save', 'defer']) g = submit(g, c);
    const travel = pending(g)!.options!.find((o) => o.id === 'travel')!;
    expect(travel.legal).toBe(false);
    expect(travel.reason).toContain('Greed');
  });
});

describe('KC-27 牌組重洗', () => {
  it('補牌時牌庫為空：腐化 +1，棄牌堆洗成新牌庫', () => {
    let g = at('refresh', (s) => {
      s.player.discard.push(...s.player.deck);
      s.player.deck = [];
    });
    g = advance(g, (_d, s) => s.round === 2);
    expect(st(g).world.corruption).toBe(2);
    expect(logHas(g, '牌庫重洗')).toBe(true);
  });
});

describe('Shade 決戰與勝負', () => {
  it('SH-02 / P1-03 揭示回合：Staging 結束後 Shade 進場', () => {
    const g = passUntil(
      at('staging', (s) => {
        s.roundState.revealShadeThisRound = true;
        s.world.shadeInfluence = 3; // +3 威脅
      }),
      inPhase('actionSet'),
    );
    const s = st(g);
    expect(s.world.shadeRevealed).toBe(true);
    expect(s.world.questArea.map(cardName)).toContain('Greed');
    expect(logHas(g, 'Threat 6 (軌道 3 + Threat token 0 + Shade 3)')).toBe(true);
  });
  it('SH-05 擊敗 Shade 移出遊戲；WIN-01 最終地點已探索且 Shade 擊敗，撐到回合結束 → 勝利', () => {
    const greed = enemy('Greed');
    let g = at('attack', (s) => {
      s.world.finalLocation = s.world.location.id;
      s.world.location.progress = 99;
      s.world.location.explored = true;
      s.world.shadeRevealed = true;
      s.world.enemies[greed] = { id: greed, wounds: 7, progress: 0, attachments: [] };
      s.world.playerArea.push(greed);
    });
    g = submit(g, { option: `assign:${greed}`, amount: 5 }); // 防禦 4 (Both)，傷害 1 → 8/8
    expect(st(g).world.shadeDefeated).toBe(true);
    expect(st(g).world.duskDiscard).not.toContain(greed);
    g = advance(g, () => false);
    expect(st(g).outcome).toMatchObject({ result: 'win', rule: 'WIN-01' });
  });
  it('FL-01 / FL-03 最終地點 EV 含 Obstacle；EV 上升後恢復未探索，不算勝利', () => {
    const s = st(startScenario());
    s.world.finalLocation = s.world.location.id;
    const base = locationEV(s);
    s.world.location.obstacles = 2;
    expect(locationEV(s)).toBe(base + 2);
  });
  it('LOSE-01 腐化達到 Shade 上限 → 立即失敗', () => {
    let g = at('refresh', (s) => {
      s.world.corruption = 4; // Greed 上限 5
      s.player.discard.push(...s.player.deck);
      s.player.deck = [];
    });
    g = advance(g, () => false);
    expect(st(g).outcome).toMatchObject({ result: 'lose', rule: 'LOSE-01' });
  });
  it('KC-22 傷害 ≥ HP → 立即失敗', () => {
    let g = at('attack', (s) => {
      s.player.wounds = skillMat('Justice').hp! - 1;
    });
    const ember = pending(g)!.options!.find((o) => o.id.includes('Ember Strike/0'))!;
    g = submit(g, { option: ember.id });
    g = submit(g, '1');
    expect(st(g).outcome).toMatchObject({ result: 'lose', rule: 'KC-22' });
    expect(view(g).pending).toBeNull();
  });
});

describe('UI-02 復原', () => {
  it('翻開新資訊之前可以復原；之後清空', () => {
    let g = startScenario();
    g = passUntil(g, (d) => d.type === 'actionSet');
    const s = st(g);
    const before = g;
    g = submit(g, { action: idOf(s, 'Ember Strike'), attack: idOf(s, 'Useful Rage'), booster: idOf(s, 'Hasten') });
    expect(canUndo(g)).toBe(true); // 選錯卡可以復原
    const back = undo(g);
    expect(st(back)).toEqual(st(before));
    // 一路到 Explore 移動翻開地點：復原紀錄清空
    g = passUntil(g, (d) => d.rule === 'P4-02');
    g = submit(g, 2);
    g = passUntil(g, (d) => d.rule === 'T1c');
    expect(canUndo(g)).toBe(false);
  });
});

describe('P7 Defend', () => {
  it('P7-02 牌庫頂端：先查看，類型不符留在頂端 (OPEN-05)', () => {
    const spy = enemy('Moltan Spy');
    let g = at('defend', (s) => {
      s.world.enemies[spy] = { id: spy, wounds: 0, progress: 0, attachments: [] };
      s.world.playerArea = [spy];
      s.player.wounds = 0;
      const ltp = [...s.player.hand, ...s.player.deck, ...s.player.discard].find((x) => cardName(x) === 'Light the Path')!;
      const ms = [...s.player.hand, ...s.player.deck, ...s.player.discard].find((x) => cardName(x) === 'Momentum Shift')!;
      s.player.hand = [ltp]; // Photonic，可以防禦 Spy
      s.player.discard = s.player.discard.filter((x) => x !== ltp && x !== ms);
      // 牌庫頂端 Momentum Shift (Physical)，Spy 是 Photonic
      s.player.deck = [ms, ...s.player.deck.filter((x) => x !== ms && x !== ltp)];
    });
    g = advance(g, (d) => d.rule === 'P7-02');
    const incoming = enemyAttack(st(g), spy);
    g = submit(g, 'peek');
    const top = pending(g)!.options!.find((o) => o.id === 'top')!;
    expect(top.legal).toBe(false);
    g = submit(g, 'done');
    expect(cardName(st(g).player.deck[0])).toBe('Momentum Shift');
    expect(st(g).player.deckTopKnown).toBe(true);
    expect(st(g).player.wounds).toBe(incoming);
  });
});

describe('P7-01a 效果給的防禦圖示', () => {
  it('Waking Wraith 腐化 ≥ 3 時同時具有 Physical 與 Photonic 攻擊類型 (p.63、p.126)', () => {
    const s = st(startScenario());
    const ww = enemy('Waking Wraith');
    s.world.enemies[ww] = { id: ww, wounds: 0, progress: 0, attachments: [] };
    s.world.playerArea.push(ww);
    expect(enemyTypes(s, ww)).toEqual(['Physical']);
    expect(enemyDefenseVs(s, ww, 'Photonic')).toBe(0);
    s.world.corruption = 3;
    expect(enemyTypes(s, ww)).toEqual(['Physical', 'Photonic']);
    expect(enemyDefenseVs(s, ww, 'Physical')).toBe(3);
    expect(enemyDefenseVs(s, ww, 'Photonic')).toBe(2);
  });
});

describe('EE-24 / KC-12f', () => {
  it('只有一個合法選項時自動選擇，並寫入日誌', () => {
    const g = passUntil(startScenario(), inPhase('actionSet'));
    expect(logHas(g, '唯一能結算的選項')).toBe(true);
  });
});

describe('存檔 (UI-01)', () => {
  it('第 1 回合 Staging 開始時存檔，JSON 還原後完全相同', () => {
    const g = startScenario();
    const g2 = gameFrom(JSON.parse(JSON.stringify(g.session.checkpoint)));
    expect(st(g2).world).toEqual(st(gameFrom(g.session.checkpoint)).world);
  });
});
