// 第一個驗收：官方 Example Turn Guide v1.2 (tests/scenario_example_turn.json)。
// 依 setup 建立固定狀態 (不洗牌)，依序執行每個 step 的玩家決策，再比對 expect。
import { describe, expect, it } from 'vitest';
import scenario from './scenario_example_turn.json';
import { cardName, findByName } from '../src/engine/data';
import { newGame, submit, view, type Game } from '../src/engine/game';
import type { Decision } from '../src/engine/core';
import type { GameState, Phase } from '../src/engine/types';
import { apBreakdown, engagementCount, epBreakdown, locationEV, questDarkness } from '../src/engine/calc';
import { fetchStatus } from '../src/engine/world';
import type { Element } from '../src/engine/data';

const S = scenario.setup;
const names = (ids: string[]) => ids.map(cardName);
const st = (g: Game) => view(g).state;
const pending = (g: Game) => view(g).pending;

function idOf(g: Game, name: string): string {
  const s = st(g);
  const pools = [
    s.player.hand,
    s.player.deck,
    s.player.discard,
    Object.values(s.player.actionSet).filter((x): x is string => !!x),
    s.world.questArea,
    s.world.playerArea,
  ];
  for (const pool of pools) {
    const id = pool.find((x) => cardName(x) === name);
    if (id) return id;
  }
  throw new Error(`找不到 ${name}`);
}

/** 只回答「繼續」直到出現符合條件的決策 (或進入指定階段) */
function passUntil(g: Game, pred: (d: Decision, s: GameState) => boolean): Game {
  for (let i = 0; i < 100; i++) {
    const d = pending(g);
    if (!d) return g;
    if (pred(d, st(g))) return g;
    if (d.type !== 'window') throw new Error(`遇到非窗口的決策：${d.rule} ${d.prompt}`);
    g = submit(g, 'pass');
  }
  throw new Error('passUntil: 太多次');
}

const inPhase = (p: Phase) => (_d: Decision, s: GameState) => s.phase === p;
const hasOption = (id: string) => (d: Decision) => !!d.options?.some((o) => o.id === id && o.legal !== false);
const isRule = (rule: string) => (d: Decision) => d.rule === rule;

function logHas(g: Game, text: string): boolean {
  return st(g).log.some((l) => l.text.includes(text));
}

function start(): Game {
  let g = newGame({
    luminary: S.luminary,
    profession: S.profession,
    hobby: S.hobby_profession,
    permSource: S.perm_booster_source_profession,
    shade: S.shade,
    difficulty: 'Blaze',
    seed: 1,
    config: { ignoreShadeSetup: true, ignoreShadeSpecial: true }, // config: Guide 指示忽略 Greed 的 Setup 與 Special
    fixed: {
      skills: S.skills.map((k) => ({ name: k.name, element: k.element as Element, unlocked: k.unlocked })),
      deck: S.deck_top_to_bottom,
      duskDeck: S.dusk_deck_top_to_bottom,
      doomDeck: S.doom_deck_top_to_bottom,
      activeTreachery: S.active_treachery,
      locationDeck: S.location_deck_top_to_bottom,
    },
  });
  // SU-05 抽 7 張，選 Foresight 放探索卡槽
  const d = pending(g)!;
  expect(d.rule).toBe('SU-05');
  g = submit(g, d.options!.find((o) => o.label === S.draw_7_then_choose_explore)!.id);
  return g;
}

describe('Example Turn Guide v1.2', () => {
  // 整局依序進行；每個 it 接續上一個的 Game
  let g: Game;
  // JSON 每個 step 的 expect 欄位不同，這裡用寬鬆型別讀取
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const step = (i: number) => scenario.steps[i] as any;

  it('開局 (SU-05、SU-09、SU-10、SU-13)', () => {
    g = start();
    const e = scenario.expect_after_setup;
    // 開局完成後的快照 = 第 1 回合 Staging 開始時的 checkpoint
    const s0 = g.session.checkpoint;
    expect(s0.round).toBe(1);
    expect(s0.phase).toBe('staging');
    expect(names(s0.player.hand)).toEqual(e.hand);
    expect(cardName(s0.player.actionSet.explore!)).toBe(e.explore_slot);
    expect(s0.player.light).toBe(e.light);
    expect(s0.world.corruption).toBe(e.corruption);
    expect(s0.world.threat).toBe(e.threat_pos);
    expect(s0.world.resistance).toBe(e.resistance_pos);
    expect(s0.world.distanceBox).toBe(e.distance_box);
    expect(names(s0.world.questArea)).toEqual(e.quest_left_to_right);
    expect(s0.world.shadeInfluence).toBe(e.shade_influence_pos);
    const lum = findByName('skill_mat', S.luminary);
    expect(lum.hp).toBe(e.luminary_hp);
    expect(lum.beacon_limit).toBe(e.beacon_limit);
  });

  it('第 1 回合 P1 Staging (P1-01、P1-02、KC-12f)', () => {
    const e = step(0).expect;
    g = passUntil(g, inPhase('actionSet'));
    const s = st(g);
    expect(logHas(g, `Threat ${e.threat} (軌道 3 + Threat token 0)`)).toBe(true);
    const revealed = s.log.filter((l) => l.rule === 'P1-02' && l.text.startsWith('翻開')).map((l) => l.text.split(' ')[1] + ' ' + l.text.split(' ')[2]);
    expect(revealed.map((x) => x.replace(/ \(.*$/, ''))).toEqual(e.revealed_in_order);
    expect(names(s.world.questArea)).toEqual(e.quest_left_to_right);
    expect(s.world.treacheryProgress).toBe(e.treachery_progress);
    expect(logHas(g, '唯一能結算的選項，KC-12f')).toBe(true); // Moltan Spy 強制加到 Treachery
    expect(names(s.world.duskDeck)).toEqual(e.dusk_deck_top_to_bottom);
  });

  it('第 1 回合 P2 Action Set (P2-01、P2-03、免費光)', () => {
    const e = step(1).expect;
    const dec = step(1).decisions[0] as { action: string; attack: string; booster: string };
    g = passUntil(g, (d) => d.type === 'actionSet');
    g = submit(g, { action: idOf(g, dec.action), attack: idOf(g, dec.attack), booster: idOf(g, dec.booster) });
    expect(st(g).player.light).toBe(e.light_after_paying);
    // Farhome：spend 1 free Light
    const free = pending(g)!.options!.find((o) => o.id.includes('Farhome/0'))!;
    expect(free.legal).not.toBe(false);
    g = submit(g, { option: free.id });
    const s = st(g);
    expect(s.player.light).toBe(e.light);
    expect(s.roundState.activeElement).toBe(e.active_element);
    expect(s.roundState.attackType).toBe(e.attack_type);
    expect(names(s.player.hand)).toEqual(e.hand);
  });

  it('第 1 回合 P3 Engagement (P3-01、P3-02、KC-18 Shout)', () => {
    const e = step(2).expect;
    g = passUntil(g, inPhase('engagement'));
    expect(engagementCount(st(g))).toBe(e.engage_count);
    // 接戰之後的窗口使用 Shout
    g = passUntil(g, (d, s) => s.world.playerArea.length > 0 && hasOption('skill:Shout')(d));
    g = submit(g, { option: 'skill:Shout' }); // 唯一的 Slow 敵人自動選擇 (EE-24)
    g = passUntil(g, inPhase('darkness'));
    const s = st(g);
    expect(names(s.world.playerArea)).toEqual(e.player_left_to_right);
    expect(names(s.world.questArea)).toEqual(e.quest_left_to_right);
    const shout = s.player.skills.find((k) => k.name === 'Shout')!;
    expect(shout.usesThisRound).toBe(e.skill_Shout.uses_this_round);
    expect(shout.exhausted).toBe(e.skill_Shout.exhausted);
  });

  it('第 1 回合 P4 Darkness (P4-01 ~ P4-03)', () => {
    const e = step(3).expect;
    g = passUntil(g, isRule('P4-02'));
    expect(epBreakdown(st(g)).total).toBe(e.EP);
    expect(questDarkness(st(g)).effective).toBe(e.quest_darkness);
    g = submit(g, 2); // cover 2
    g = passUntil(g, inPhase('explore'));
    const s = st(g);
    expect(s.world.treacheryProgress).toBe(e.treachery_progress);
    expect(s.world.completedTreacheries.length > 0).toBe(e.treachery_completed);
    expect(s.roundState.exploreEP).toBe(e.explore_EP);
  });

  it('第 1 回合 P5 Explore + 移動 (P5、T1c、T2、T3、T4、KC-12f)', () => {
    const e = step(4).expect;
    // 放進度之前：Fetch 條件 (DG-10)
    const fs = fetchStatus({ s: st(g) }, true);
    expect(fs.ok).toBe(e.fetch_allowed);
    expect(fs.reason).toBe(e.fetch_reason);
    expect(locationEV(st(g))).toBe(e.EV);
    // 移動方式只有「尋找目的地」合法 → 自動 (EE-24)
    g = passUntil(g, isRule('T1c'));
    const choices = step(4).decisions.filter((d: object) => 'revealed' in d) as { revealed: string; choice: string }[];
    for (const c of choices) {
      const d = pending(g)!;
      expect(d.prompt.startsWith(c.revealed)).toBe(true);
      if (c.revealed === 'Ruins of Crowbridge') {
        // 信標已滿 (3)，不應提供 save_beacon
        expect(d.options!.find((o) => o.id === 'save')!.legal).toBe(false);
      }
      g = submit(g, c.choice === 'save_beacon' ? 'save' : c.choice);
    }
    g = passUntil(g, inPhase('attack'));
    const s = st(g);
    expect(logHas(g, `共 ${e.location_progress_before_travel}/${e.EV}`)).toBe(true);
    expect(logHas(g, 'Farhome 已探索')).toBe(e.explored);
    expect(s.player.xp).toBe(e.xp);
    const b = e.distance_breakdown;
    expect(logHas(g, `距離 ${e.distance} = 地理 ${b.geographic} + Obstacle ${b.obstacles} − Path ${b.paths} + 延後 ${b.deferred}`)).toBe(true);
    expect(s.world.threat).toBe(e.threat_pos);
    expect(s.world.resistance).toBe(e.resistance_pos);
    expect(s.world.distanceBox).toBe(e.distance_box);
    expect(cardName(s.world.location.id)).toBe(e.active_location);
    expect(s.world.newLocationTokenOnLocation).toBe(e.new_location_token_on_location);
    expect(s.player.beaconMatReady).toBe(e.beacon_mat_ready);
    expect(names(s.player.beacons)).toEqual(e.beacons);
    expect(names(s.world.locationDiscard)).toEqual(e.location_discard);
    expect(names(s.world.locationDeck)).toEqual(e.location_deck_top_to_bottom);
    expect(s.world.shadeInfluence).toBe(e.shade_influence_pos);
    expect(s.world.shadeRevealPending).toBe(e.shade_reveal_pending);
    expect(s.player.wounds).toBe(e.wounds);
    expect(logHas(g, 'Moltan Spellcaster：受 1 傷 (唯一能結算的選項，KC-12f)')).toBe(true);
  });

  it('第 1 回合 P6 Attack (P6-01 ~ P6-03、KC-24、Shout)', () => {
    const e = step(5).expect;
    // Ember Strike：受 2 傷 → +4 MainAttack
    const ember = pending(g)!.options!.find((o) => o.id.includes('Ember Strike/0'))!;
    g = submit(g, { option: ember.id });
    g = submit(g, '2');
    expect(st(g).player.wounds).toBe(e.wounds_after_ember_strike);
    expect(apBreakdown(st(g)).total).toBe(e.AP);
    expect(apBreakdown(st(g)).type).toBe(e.attack_type);

    const xpBefore = st(g).player.xp;
    const assign = (name: string, amount: number) => {
      g = submit(g, { option: `assign:${idOf(g, name)}`, amount });
    };
    assign('Terragard Watchman', 4);
    assign('Moltan Spellcaster', 6);
    // Shout 觸發：Pull 1 Fast 敵人 (玩家選 Sol Conspirator)
    expect(pending(g)!.prompt).toContain('Shout');
    g = submit(g, idOf(g, 'Sol Conspirator'));
    assign('Sol Conspirator', 4);
    expect(pending(g)!.prompt).toContain('Shout');
    g = submit(g, idOf(g, 'Moltan Spy'));
    for (const r of e.results as { enemy: string; blocked: number; wounds: number; defeated: boolean; xp_gain: number }[]) {
      expect(logHas(g, `→ ${r.enemy} (Physical)：擋下 ${r.blocked}，傷害 ${r.wounds}`)).toBe(true);
      expect(logHas(g, `擊敗 ${r.enemy}`)).toBe(r.defeated);
    }
    expect(st(g).player.xp - xpBefore).toBe(e.results.reduce((n: number, r: { xp_gain: number }) => n + r.xp_gain, 0));
    g = passUntil(g, inPhase('defend'));
    const s = st(g);
    expect(apBreakdown(s).total - s.roundState.apSpent).toBe(e.AP_left);
    expect(s.player.xp).toBe(e.xp);
    expect(names(s.world.playerArea)).toEqual(e.player_left_to_right);
    expect(names(s.world.questArea)).toEqual(e.quest_left_to_right);
    expect(s.world.treacheryProgress).toBe(e.treachery_progress); // Sol Conspirator 已擊敗，End of Attack 不觸發
  });

  it('第 1 回合 P7 Defend (P7-01 ~ P7-03、KC-11)', () => {
    const e = step(6).expect;
    g = submit(g, { option: `attacker:${idOf(g, 'Moltan Spy')}` });
    const d = pending(g)!;
    expect(d.rule).toBe('P7-02');
    // Fortitude (Physical) 不可用來防禦 Photonic 攻擊
    expect(d.options!.find((o) => o.id === `hand:${idOf(g, 'Fortitude')}`)!.legal).toBe(false);
    g = submit(g, `hand:${idOf(g, 'Equal Measure')}`);
    g = submit(g, 'done');
    expect(logHas(g, `Moltan Spy：攻擊 ${e.incoming}，防禦 ${e.blocked}，傷害 ${e.incoming - e.blocked}`)).toBe(true);
    // Useful Rage 的 End of Defend 效果在攻擊卡上，不可使用 (KC-11)：不應出現在任何選項中
    expect(pending(g)!.options!.some((o) => o.label.includes('Useful Rage'))).toBe(false);
    g = passUntil(g, inPhase('refresh'));
    const s = st(g);
    expect(s.player.wounds).toBe(e.wounds);
    expect(cardName(s.player.discard[s.player.discard.length - 1])).toBe(e.discard_top);
  });

  it('第 1 回合 P8 Refresh (P8-01 ~ P8-05、OPEN-08)', () => {
    const e = step(7).expect;
    const dec = step(7).decisions[1] as { discard_order: string[] };
    g = passUntil(g, isRule('P8-03'));
    g = submit(g, 'done'); // 不休息
    expect(pending(g)!.rule).toBe('P8-04');
    g = submit(g, dec.discard_order.map((n) => idOf(g, n)));
    g = submit(g, 'done'); // 不額外棄牌
    g = passUntil(g, (_d, s) => s.round === 2);
    const s = st(g);
    expect(s.world.newLocationTokenOnLocation).toBe(e.new_location_token_on_location);
    expect(s.player.light).toBe(e.light);
    expect(cardName(s.player.actionSet.explore!)).toBe(e.explore_slot);
    expect(names(s.player.discard)).toEqual(e.discard_bottom_to_top);
    expect(cardName(s.player.discard[s.player.discard.length - 1])).toBe(e.echo);
    expect(names(s.player.hand)).toEqual(e.hand);
    expect(names(s.player.deck)).toEqual(e.deck_top_to_bottom);
    expect(s.world.corruption).toBe(e.corruption);
    expect(s.outcome === null).toBe(!e.game_over);
    // Sol：每個 Refresh Phase +1 Path；P8-01 沒有加 Threat token
    const prev = g.session.checkpoint;
    expect(prev.round).toBe(2);
    expect(prev.world.location.paths).toBe(e.Sol_paths);
    expect(prev.world.location.threatTokens).toBe(e.location_threat_tokens);
  });

  it('第 2 回合 P1 Staging：Shade 揭示 (P1-03、SH-02 ~ SH-04)', () => {
    const e = step(8).expect;
    g = passUntil(g, inPhase('actionSet'));
    const s = st(g);
    const t = e.threat_breakdown;
    expect(logHas(g, `Threat ${e.threat} (軌道 ${t.track} + Threat token ${t.location_tokens} + Shade ${t.shade_influence})`)).toBe(true);
    const r2 = s.log.filter((l) => l.round === 2 && l.rule === 'P1-02' && l.text.startsWith('翻開'));
    expect(r2.map((l) => l.text.replace(/^翻開 /, '').replace(/ \(.*$/, ''))).toEqual(e.revealed_in_order.map((x: { name: string }) => x.name));
    e.revealed_in_order.forEach((x: { deck: string }, i: number) => {
      expect(r2[i].text).toContain(`(${x.deck}`);
    });
    expect(s.world.duskDeck.length === 0).toBe(e.dusk_deck_empty);
    expect(s.world.doomDeck.length === 0).toBe(e.doom_deck_empty);
    expect(s.world.shadeRevealed).toBe(e.shade.revealed);
    expect(names(s.world.questArea)).toEqual(e.quest_after_shade_reveal);
    expect(names(s.world.questArea.slice(1))).toEqual(e.quest_before_shade);
    expect(logHas(g, 'Greed When Revealed：任務區黑暗 (不含 Greed) = 18，需要 6')).toBe(true);
    expect(names(s.world.playerArea)).toEqual(e.after_staging.player_left_to_right);
    expect(names(s.world.questArea)).toEqual(e.after_staging.quest_left_to_right);
  });
});

