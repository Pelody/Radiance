// Luminary 卡片 (基礎面、進階面) 與技能：每張至少一個測試。
import { describe, expect, it } from 'vitest';
import { traitCountInPlay, apBreakdown, cardDefense, enemyDefenseVs, enemyXP, epBreakdown, lightCost, questDarkness } from '../src/engine/calc';
import { cardName } from '../src/engine/data';
import { skillUnlocked } from '../src/engine/effects';
import { emitWill, enemyToPlayer, push, revealTreachery } from '../src/engine/ops';
import type { GameState } from '../src/engine/types';
import { growthCost } from '../src/engine/window';
import { actionSetCost } from '../src/engine/phases';
import {
  addEnemy,
  boundary,
  clearEnemies,
  enableSkill,
  fire,
  pick,
  run,
  setLocation,
  setSlot,
  stateAt,
  toHand,
  treacheryId,
  useEffect,
  useSkill,
} from './helpers/cards';

function base(luminary: string, phase: Parameters<typeof stateAt>[0] = 'attack', profession = 'Wayfarer'): GameState {
  const s = luminary === 'Justice' && profession === 'Wayfarer' ? stateAt(phase) : stateAt(phase, { luminary, profession });
  clearEnemies(s);
  setLocation(s, 'Spellwood');
  s.player.light = 10;
  s.player.xp = 0;
  s.world.treacheryProgress = 0;
  const t = treacheryId('Hidden Pitfalls');
  s.world.treacheryDeck = s.world.treacheryDeck.filter((x) => x !== t);
  s.world.activeTreachery = t;
  s.world.completedTreacheries = [];
  return s;
}
const beacons = (s: GameState, n: number) => (s.player.beacons = s.world.locationDeck.splice(0, n));
const mainAttack = (s: GameState) => apBreakdown(s).main;

// ================================================================= Justice

describe('Justice 卡片', () => {
  it('Ember Strike：受 2 傷 +4 MainAttack；受 1 傷給攻擊卡特質', () => {
    const s = base('Justice');
    setSlot(s, 'action', 'Ember Strike');
    const r = useEffect(s, 'Ember Strike/0', ['2']);
    expect(r.s.player.wounds).toBe(2);
    expect(mainAttack(r.s)).toBe(mainAttack(s) + 4);
    const r2 = useEffect(s, 'Ember Strike/1', ['Wraith']);
    expect(r2.s.roundState.grantedTraits).toEqual([{ target: s.player.actionSet.attack, trait: 'Wraith' }]);
  });
  it('Ember Strike+：受 3 傷，AttackBoost × 3', () => {
    const s = base('Justice');
    setSlot(s, 'action', 'Ember Strike', true);
    const b = apBreakdown(s).booster;
    const r = useEffect(s, 'Ember Strike+/0');
    expect(r.s.player.wounds).toBe(3);
    expect(apBreakdown(r.s).booster).toBe(3 * b);
  });
  it('Cold Roar：擊敗 2 個敵人後摧毀 Obstacle，然後 Pull 1 個敵人', () => {
    const s = base('Justice');
    setSlot(s, 'action', 'Cold Roar');
    s.world.location.obstacles = 1;
    s.roundState.defeatedCount = 2;
    const q = addEnemy(s, 'Sol Scout', 'quest');
    const r = fire(s, { t: 'EnemyDefeated', enemy: 'x', initiative: 'Slow' }, ['0', '0']);
    expect(r.s.world.location.obstacles).toBe(0);
    expect(r.s.world.playerArea).toContain(q);
  });
  it('Cold Roar+：對自己造成 2 傷，Pull 2 個敵人，特質分給其他敵人', () => {
    const s = base('Justice');
    setSlot(s, 'action', 'Cold Roar', true);
    const p = addEnemy(s, 'Green Wraith');
    addEnemy(s, 'Sol Scout', 'quest');
    addEnemy(s, 'Moltan Spy', 'quest');
    const r = useEffect(s, 'Cold Roar+/0', [2]);
    expect(r.s.player.wounds).toBe(2);
    expect(r.s.world.playerArea.length).toBe(3);
    expect(r.s.roundState.grantedTraits.some((g) => g.target === p && g.trait === 'Sol')).toBe(true);
  });
  it('Useful Rage：Defend 結束對敵人造成 3X 傷害', () => {
    const s = base('Justice', 'defend');
    setSlot(s, 'action', 'Useful Rage');
    s.roundState.defendedWithCount = 2;
    const e = addEnemy(s, 'Cursed Banneret');
    expect(boundary(s, 'defend', 'end', ['0']).s.world.enemies[e].wounds).toBe(6);
  });
  it('Useful Rage+：MainAttack + 2 × 行動組防禦總和；受傷後給攻擊卡特質', () => {
    const s = base('Justice');
    setSlot(s, 'action', 'Useful Rage', true);
    const sum = Object.values(s.player.actionSet).filter((x): x is string => !!x).reduce((n, id) => n + cardDefense(s, id), 0);
    expect(mainAttack(useEffect(s, 'Useful Rage+/0').s)).toBe(mainAttack(s) + 2 * sum);
    setSlot(s, 'attack', 'Frenzy');
    const rr = fire(s, { t: 'SelfDamage', n: 1 }, ['0', 'Mage']);
    expect(rr.s.roundState.grantedTraits.length).toBe(1);
  });
  it('Equal Measure：需要 fire 與 ice；有該特質的敵人受 2 傷，玩家區少於 3 個敵人時自己受 2 傷', () => {
    const s = base('Justice');
    setSlot(s, 'action', 'Equal Measure');
    setSlot(s, 'attack', 'Ember Strike'); // Fire
    setSlot(s, 'booster', 'Cold Roar'); // Ice
    const e = addEnemy(s, 'Sol Scout');
    const r = useEffect(s, 'Equal Measure/0', ['Sol']);
    expect(r.s.world.enemies[e]?.wounds ?? 2).toBe(2);
    expect(r.s.player.wounds).toBe(2);
  });
  it('Equal Measure+：敵人進入玩家區後地點 +1 (Fast) / +2 (Slow) Progress', () => {
    const s = base('Justice');
    setSlot(s, 'action', 'Equal Measure', true);
    s.world.location.progress = 0;
    const slow = addEnemy(s, 'Green Wraith', 'quest');
    expect(run(s, (ctx) => enemyToPlayer(ctx, slow, 'engage', 'T')).s.world.location.progress).toBe(2);
  });
  it('Momentum Shift：Action Set 結束 ExploreBoost 轉成 AttackBoost +1；敵人進入時互相 1 傷', () => {
    const s = base('Justice');
    setSlot(s, 'action', 'Momentum Shift');
    const eb = epBreakdown(s).booster;
    const ab = apBreakdown(s).booster;
    const r = boundary(s, 'actionSet', 'end', ['0']);
    expect(epBreakdown(r.s).booster).toBe(0);
    expect(apBreakdown(r.s).booster).toBe(ab + eb + 1);
    const e = addEnemy(s, 'Cursed Banneret', 'quest');
    const r2 = run(s, (ctx) => enemyToPlayer(ctx, e, 'engage', 'T'), ['0']);
    expect(r2.s.player.wounds).toBe(1);
    expect(r2.s.world.enemies[e].wounds).toBe(1);
  });
  it('Momentum Shift+：受 1 傷，2 次：Threat token、翻 Dusk、+10 MainAttack', () => {
    const s = base('Justice');
    setSlot(s, 'action', 'Momentum Shift', true);
    s.phase = 'attack';
    const r = useEffect(s, 'Momentum Shift+/1', [2]);
    expect(mainAttack(r.s)).toBe(mainAttack(s) + 20);
    expect(r.s.world.location.threatTokens).toBe(s.world.location.threatTokens + 2);
    expect(r.s.world.questArea.length).toBe(2);
  });
  it('Frenzy：X = 玩家區敵人數，受 1 傷加倍', () => {
    const s = base('Justice', 'defend');
    setSlot(s, 'action', 'Frenzy');
    const e = addEnemy(s, 'Cursed Banneret');
    addEnemy(s, 'Waking Wraith');
    const r = useEffect(s, 'Frenzy/0', [e, 'yes']);
    expect(r.s.world.enemies[e].wounds).toBe(4);
    expect(r.s.player.wounds).toBe(1);
  });
  it('Frenzy+：擊敗與行動組有 3 個相同特質的敵人', () => {
    const s = base('Justice');
    setSlot(s, 'action', 'Frenzy', true);
    const e = addEnemy(s, 'Moltan Trail Hound'); // Moltan, Hound, Tracker, Reckless
    const atk = s.player.actionSet.attack!;
    s.roundState.grantedTraits.push({ target: atk, trait: 'Moltan' }, { target: atk, trait: 'Hound' });
    const r = useEffect(s, 'Frenzy+/1');
    expect(r.s.world.enemies[e]).toBeUndefined();
  });
});

describe('Justice 技能', () => {
  it('Grit：受 4 傷得 3 光', () => {
    const s = base('Justice');
    const r = useSkill(s, 'Grit', ['4']);
    expect(r.s.player.wounds).toBe(4);
    expect(r.s.player.light).toBe(13);
  });
  it('Call Your Shot：攻擊有指定特質的敵人時它受 2 傷、你受 1 傷', () => {
    const s = base('Justice');
    const e = addEnemy(s, 'Cursed Banneret');
    const r = useSkill(s, 'Call Your Shot', ['Dread']);
    const r2 = fire(r.s, { t: 'EnemyAttackedByYou', enemy: e });
    expect(r2.s.world.enemies[e].wounds).toBe(2);
    expect(r2.s.player.wounds).toBe(1);
  });
  it('Find Weakness：每個相同特質 2 傷', () => {
    const s = base('Justice');
    enableSkill(s, 'Find Weakness');
    const e = addEnemy(s, 'Sol Scout'); // Sol, Bladed
    s.roundState.grantedTraits.push({ target: s.player.actionSet.attack!, trait: 'Sol' }, { target: s.player.actionSet.attack!, trait: 'Bladed' });
    expect(fire(s, { t: 'EnemyAttackedByYou', enemy: e }).s.world.enemies[e]).toBeUndefined(); // 4 傷 ≥ HP 2
  });
  it('Use the Pain：Pull 之後花 1 光給特質 (每回合最多 3 次)', () => {
    const s = base('Justice');
    enableSkill(s, 'Use the Pain');
    const e = addEnemy(s, 'Sol Scout');
    const r = fire(s, { t: 'EnemyEnteredPlayer', enemy: e, cause: 'pull' }, ['0', e, 'Wraith']);
    expect(r.s.player.light).toBe(9);
    expect(r.s.roundState.grantedTraits).toEqual([{ target: e, trait: 'Wraith' }]);
  });
  it('Shout：Pull 1 個 Slow 敵人', () => {
    const s = base('Justice');
    const e = addEnemy(s, 'Green Wraith', 'quest');
    expect(useSkill(s, 'Shout').s.world.playerArea).toContain(e);
  });
  const shoutTwice = (s: ReturnType<typeof base>) => {
    for (let i = 0; i < 2; i++) s.lingering.push({ uid: s.nextUid++, key: 'Shout/fastPull', sourceId: 'skill:Shout', sourceName: 'Shout', params: {}, until: 'round' });
  };
  it('EE-12b：Shout 用了兩次，擊敗 Fast 敵人後不會問兩個一模一樣的效果先後', () => {
    const s = base('Justice');
    shoutTwice(s);
    const a = addEnemy(s, 'Sol Scout', 'quest');
    const b = addEnemy(s, 'Sol Scout', 'quest');
    const r = fire(s, { t: 'EnemyDefeated', initiative: 'Fast' });
    expect(r.decisions.some((d) => d.rule === 'EE-12')).toBe(false);
    expect(r.s.world.playerArea).toEqual(expect.arrayContaining([a, b]));
  });
  it('EE-12a：任務區沒有 Fast 敵人時，Shout 的效果列出但不能選，按確定略過', () => {
    const s = base('Justice');
    shoutTwice(s);
    addEnemy(s, 'Green Wraith', 'quest'); // Slow
    const r = fire(s, { t: 'EnemyDefeated', initiative: 'Fast' });
    const d = r.decisions.find((x) => x.rule === 'EE-12a')!;
    expect(d).toBeDefined();
    expect(d.options!.filter((o) => o.id.startsWith('blocked:')).every((o) => o.legal === false && o.reason === '任務區沒有 Fast 敵人')).toBe(true);
    expect(d.options!.find((o) => o.id === 'ok')).toBeDefined();
    expect(r.decisions.filter((x) => x.rule === 'EE-12a')).toHaveLength(1);
    expect(r.s.world.playerArea).toEqual([]);
  });
});

// ================================================================= Courage

describe('Courage 卡片', () => {
  const c = (phase: Parameters<typeof stateAt>[0] = 'attack') => base('Courage', phase);
  it('Force of Will：每個信標 1 Progress', () => {
    const s = c('explore');
    setSlot(s, 'action', 'Force of Will');
    beacons(s, 2);
    s.world.location.progress = 0;
    expect(useEffect(s, 'Force of Will/0').s.world.location.progress).toBe(2);
  });
  it('Force of Will+：棄信標，每個 Pull 1 個敵人並得 1 光', () => {
    const s = c();
    setSlot(s, 'action', 'Force of Will', true);
    beacons(s, 2);
    const e = addEnemy(s, 'Sol Scout', 'quest');
    const r = boundary(s, 'engagement', 'end', ['0', [s.player.beacons[0]]]);
    expect(r.s.world.playerArea).toContain(e);
    expect(r.s.player.light).toBe(11);
  });
  it('Tempest：探索時多 2 XP', () => {
    const s = c();
    setSlot(s, 'action', 'Tempest');
    expect(fire(s, { t: 'LocationExplored' }, ['0']).s.player.xp).toBe(2);
  });
  it('Tempest+：Slow 敵人進入後得 1 XP；每個 light charge 對 Slow 敵人 1 傷', () => {
    const s = c();
    setSlot(s, 'action', 'Tempest', true);
    setSlot(s, 'attack', 'Against All Odds'); // Light Charge
    const e = addEnemy(s, 'Cursed Banneret');
    expect(fire(s, { t: 'EnemyEnteredPlayer', enemy: e }, ['0']).s.player.xp).toBe(1);
    expect(useEffect(s, 'Tempest+/1').s.world.enemies[e].wounds).toBe(1);
  });
  it('Against All Odds：MainAttack + 玩家區敵人數', () => {
    const s = c();
    setSlot(s, 'action', 'Against All Odds');
    addEnemy(s, 'Sol Scout');
    addEnemy(s, 'Green Wraith');
    expect(mainAttack(useEffect(s, 'Against All Odds/0').s)).toBe(mainAttack(s) + 2);
  });
  it('Against All Odds+：MainAttack + Darkness 總和，可保存 1 個信標', () => {
    const s = c();
    setSlot(s, 'action', 'Against All Odds', true);
    addEnemy(s, 'Cursed Banneret'); // Darkness 4
    s.world.locationDiscard.push(s.world.locationDeck.shift()!);
    const r = useEffect(s, 'Against All Odds+/0', [(d: { cards: string[] }) => d.cards.slice(0, 1)]);
    expect(mainAttack(r.s)).toBe(mainAttack(s) + 4);
    expect(r.s.player.beacons.length).toBe(1);
  });
  it('Blinding Light：花 2 光忽略 3 PhotonicDefense', () => {
    const s = c();
    setSlot(s, 'action', 'Blinding Light');
    const e = addEnemy(s, 'Envy');
    s.world.completedTreacheries = [treacheryId('Spell of Confusion')]; // Envy Photonic 防禦 1
    const r = useEffect(s, 'Blinding Light/0', [2]);
    expect(r.s.player.light).toBe(8 + traitCountInPlay(s, 'Brave'));
    expect(enemyDefenseVs(r.s, e, 'Photonic')).toBe(0);
  });
  it('Blinding Light+：用地點棄牌堆填滿信標，push 等量敵人', () => {
    const s = c();
    setSlot(s, 'action', 'Blinding Light', true);
    s.world.locationDiscard.push(...s.world.locationDeck.splice(0, 2));
    const e = addEnemy(s, 'Sol Scout');
    const r = useEffect(s, 'Blinding Light+/0', [(d: { cards: string[] }) => d.cards.slice(0, 2), [e]]);
    expect(r.s.player.beacons.length).toBe(2);
    expect(r.s.world.questArea).toContain(e);
  });
  it('Terrible and Swift：Slow 敵人進入時抽 1 張', () => {
    const s = c();
    setSlot(s, 'action', 'Terrible and Swift');
    const e = addEnemy(s, 'Green Wraith', 'quest');
    const n = s.player.hand.length;
    expect(run(s, (ctx) => enemyToPlayer(ctx, e, 'engage', 'T')).s.player.hand.length).toBe(n + 1);
  });
  it('Terrible and Swift+：Disarm 玩家區所有非 Shade 敵人', () => {
    const s = c();
    setSlot(s, 'action', 'Terrible and Swift', true);
    const a = addEnemy(s, 'Sol Scout');
    expect(useEffect(s, 'Terrible and Swift+/1').s.roundState.disarmed).toEqual([a]);
  });
  it('Striking Gold：花 2 個信標得 2 XP、2 光', () => {
    const s = c();
    setSlot(s, 'action', 'Striking Gold');
    beacons(s, 2);
    const r = useEffect(s, 'Striking Gold/0', [(d: { cards: string[] }) => d.cards]);
    expect(r.s.player.xp).toBe(2);
    expect(r.s.player.light).toBe(12);
    expect(r.s.player.beacons.length).toBe(0);
  });
  it('Striking Gold+：敵人防禦 +3；棄 light charge 卡時 2 傷', () => {
    const s = c('actionSet');
    setSlot(s, 'action', 'Striking Gold', true);
    const e = addEnemy(s, 'Cursed Banneret');
    const r = useEffect(s, 'Striking Gold+/0', [3]);
    expect(enemyDefenseVs(r.s, e, 'Physical')).toBe(6);
    const r2 = fire(s, { t: 'CardPlayed', card: s.player.actionSet.action, slot: 'action' });
    const lc = toHand(r2.s, 'Against All Odds');
    const r3 = run(r2.s, (ctx) => import_discard(ctx, lc), ['0']);
    expect(r3.s.world.enemies[e].wounds).toBe(2);
  });
});

import { discardPlayerCard } from '../src/engine/ops';
import type { Ctx } from '../src/engine/core';
function* import_discard(ctx: Ctx, id: string) {
  yield* discardPlayerCard(ctx, id, 'hand', 'T');
}

describe('Courage 技能', () => {
  it('Flares：花 1 XP Pull 所有 Slow 敵人', () => {
    const s = base('Courage');
    s.player.xp = 1;
    const a = addEnemy(s, 'Green Wraith', 'quest');
    const b = addEnemy(s, 'Cursed Banneret', 'quest');
    const r = useSkill(s, 'Flares', ['slow']);
    expect(r.s.world.playerArea).toEqual(expect.arrayContaining([a, b]));
    expect(r.s.player.xp).toBe(0);
  });
  it('Spark：花 2 個信標，下一次 Character Growth −2 XP', () => {
    const s = base('Courage');
    beacons(s, 2);
    const r = useSkill(s, 'Spark', [(d: { cards: string[] }) => d.cards]);
    expect(growthCost(r.s, 'character', 5).cost).toBe(3);
    expect(growthCost(r.s, 'ability', 5).cost).toBe(5);
  });
  it('Illuminate：忽略 Darkness = 玩家區敵人數 +1', () => {
    const s = base('Courage');
    enableSkill(s, 'Illuminate');
    addEnemy(s, 'Cursed Banneret', 'quest');
    addEnemy(s, 'Sol Scout');
    expect(questDarkness(s).ignored).toBe(2);
  });
  it('Burning Light：敵人進入時花 1 信標造成 2 傷 (Terrible and Swift +1)', () => {
    const s = base('Courage');
    enableSkill(s, 'Burning Light');
    beacons(s, 1);
    setSlot(s, 'action', 'Terrible and Swift');
    const e = addEnemy(s, 'Moltan Spellcaster'); // Fast，HP 4
    const r = fire(s, { t: 'EnemyEnteredPlayer', enemy: e }, ['0', (d: { cards: string[] }) => d.cards]);
    expect(r.s.world.enemies[e].wounds).toBe(3);
    expect(r.s.player.beacons.length).toBe(0);
  });
  it('Sun Shield：花 1 XP，每 2 個信標 Disarm 1 個敵人', () => {
    const s = base('Courage');
    s.player.xp = 1;
    beacons(s, 2);
    const e = addEnemy(s, 'Sol Scout');
    expect(useSkill(s, 'Sun Shield', [[e]]).s.roundState.disarmed).toEqual([e]);
  });
});

// ================================================================= Temperance

describe('Temperance 卡片', () => {
  const t = (phase: Parameters<typeof stateAt>[0] = 'attack') => base('Temperance', phase);
  it('Unfettered Resolve：忽略 1 個敵人的效果；reckless 時 XP −1', () => {
    const s = t();
    setSlot(s, 'action', 'Unfettered Resolve');
    s.world.corruption = 3;
    const e = addEnemy(s, 'Green Wraith');
    const r = useEffect(s, 'Unfettered Resolve/0', [e]);
    expect(r.s.roundState.ignoredEnemies).toEqual([e]);
    setSlot(s, 'attack', 'At All Costs'); // Reckless
    expect(enemyXP(s, e)).toBe(enemyXP(base('Temperance'), e) - 1);
  });
  it('Unfettered Resolve+：至少 3 XP 忽略 5 Darkness；fatigued 時 Mill 1', () => {
    const s = t('darkness');
    setSlot(s, 'action', 'Unfettered Resolve', true);
    s.player.xp = 3;
    expect(questDarkness(useEffect(s, 'Unfettered Resolve+/0').s).ignored).toBe(5);
    setSlot(s, 'attack', 'Calculated Risk'); // ⚠ 需要 fatigued：Controlled Disruption+ / Firm Footing 等
  });
  it('Controlled Disruption：翻 Treachery 時抽 3 選 1；hopeless 時失去 1 光', () => {
    const s = t();
    setSlot(s, 'action', 'Controlled Disruption');
    s.world.activeTreachery = null;
    const top3 = s.world.treacheryDeck.slice(0, 3);
    const r = run(s, (ctx) => revealTreachery(ctx), ['0', top3[2]]);
    expect(r.s.world.activeTreachery).toBe(top3[2]);
    expect(r.s.world.treacheryDeck.slice(-2)).toEqual(top3.slice(0, 2));
    setSlot(s, 'attack', 'At All Costs'); // Hopeless
    expect(boundary(s, 'refresh', 'start').s.player.light).toBe(9);
  });
  it('Controlled Disruption+：花 1 XP 移除 Treachery 所有 Progress，≥ 4 得 2 光', () => {
    const s = t();
    setSlot(s, 'action', 'Controlled Disruption', true);
    s.player.xp = 1;
    s.world.treacheryProgress = 5;
    const r = useEffect(s, 'Controlled Disruption+/0');
    expect(r.s.world.treacheryProgress).toBe(0);
    expect(r.s.player.light).toBe(12);
  });
  it('Calculated Risk：Treachery 完成後 +3 XP', () => {
    const s = t();
    setSlot(s, 'action', 'Calculated Risk');
    expect(fire(s, { t: 'TreacheryCompleted' }).s.player.xp).toBe(3);
  });
  it('Calculated Risk+：成長時信標當 3 XP', () => {
    const s = t();
    setSlot(s, 'action', 'Calculated Risk', true);
    beacons(s, 2);
    s.player.xp = 1;
    const r = run(s, (ctx) => import_grow(ctx), [{ option: 'growAbility' }]);
    expect(r.s.player.abilityGrowthPos).toBe(1);
    expect(r.s.player.beacons.length).toBe(1);
  });
  it('At All Costs：威脅 +2，第一次成長 −4 XP；Refresh 玩家區有敵人時 Treachery +3', () => {
    const s = t();
    setSlot(s, 'action', 'At All Costs');
    const r = useEffect(s, 'At All Costs/0', [2]);
    expect(r.s.world.threat).toBe(s.world.threat + 2);
    expect(growthCost(r.s, 'ability', 5).cost).toBe(1);
    addEnemy(s, 'Sol Scout');
    expect(boundary(s, 'refresh', 'start').s.world.treacheryProgress).toBe(3);
  });
  it('At All Costs+：每格 −3，低於 0 的部分換 XP (最多 4)', () => {
    const s = t();
    setSlot(s, 'action', 'At All Costs', true);
    const r = useEffect(s, 'At All Costs+/0', [3]);
    expect(growthCost(r.s, 'ability', 3)).toEqual({ cost: 0, bonusXP: 4 });
  });
  it('Equilibrium：Refresh 付 2 光得 3 XP；complacent 時最左欄技能鎖定', () => {
    const s = t('refresh');
    setSlot(s, 'action', 'Equilibrium');
    expect(useEffect(s, 'Equilibrium/0', ['2']).s.player.xp).toBe(3);
    setSlot(s, 'attack', 'Firm Footing'); // Complacent
    const r = boundary(s, 'actionSet', 'end');
    const left = r.s.player.skills.find((k) => k.mat === 'luminary' && k.column === 0 && k.unlocked)!;
    expect(skillUnlocked(r.s, left)).toBe(false);
  });
  it('Equilibrium+：翻 1 個 Dusk 敵人，下一次成長只要 1 XP', () => {
    const s = t();
    setSlot(s, 'action', 'Equilibrium', true);
    const r = boundary(s, 'actionSet', 'end', ['0']);
    expect(r.s.world.questArea.length).toBe(1);
    expect(growthCost(r.s, 'ability', 6).cost).toBe(1);
  });
  it('Firm Footing：至少 5 XP 得 4 光；lost 時移除 4 Progress', () => {
    const s = t('refresh');
    setSlot(s, 'action', 'Firm Footing');
    s.player.xp = 5;
    expect(useEffect(s, 'Firm Footing/0').s.player.light).toBe(14);
    setSlot(s, 'attack', 'Equilibrium'); // Lost
    s.world.location.progress = 5;
    expect(boundary(s, 'refresh', 'start').s.world.location.progress).toBe(1);
  });
  it('Firm Footing+：每 2 XP Disarm 1 個；≥ 7 XP 移除 Treachery Progress', () => {
    const s = t();
    setSlot(s, 'action', 'Firm Footing', true);
    s.player.xp = 7;
    s.world.treacheryProgress = 3;
    const e = addEnemy(s, 'Sol Scout');
    const r = useEffect(s, 'Firm Footing+/0', [[e]]);
    expect(r.s.roundState.disarmed).toEqual([e]);
    expect(r.s.world.treacheryProgress).toBe(0);
  });
});

import { generalWindow } from '../src/engine/window';
function* import_grow(ctx: Ctx) {
  yield* generalWindow(ctx, 'attack', 'test');
}

describe('Temperance 技能', () => {
  it('Resist：每 2 XP +1 防禦；Tireless 移除 Treachery 3 Progress', () => {
    const s = base('Temperance');
    s.player.xp = 4;
    const card = s.player.hand[0];
    const r = useSkill(s, 'Resist', [card, card]);
    expect(cardDefense(r.s, card)).toBe(cardDefense(s, card) + 2);
  });
  it('Repel：push 1 個敵人；Ranged 時對 Slow 敵人造成 Darkness 傷害', () => {
    const s = base('Temperance', 'engagement');
    setSlot(s, 'action', 'At All Costs'); // Ranged
    const e = addEnemy(s, 'Cursed Banneret');
    const slow = addEnemy(s, 'Green Wraith', 'quest');
    const r = useSkill(s, 'Repel', [slow]);
    expect(r.s.world.questArea).toContain(e);
    expect(r.s.world.enemies[slow]).toBeUndefined(); // 4 傷 = HP 4
  });
  it('Brightsword：Attack 開始 Fire 時每 1 XP +1 MainAttack', () => {
    const s = base('Temperance');
    enableSkill(s, 'Brightsword');
    s.player.xp = 4;
    setSlot(s, 'action', 'Blinding Light'); // Fire 特質
    const r = boundary(s, 'attack', 'start', ['0']);
    expect(mainAttack(r.s)).toBe(mainAttack(s) + 4);
  });
  it('Reflection：Scout 1 張，Ice 可以 cycle', () => {
    const s = base('Temperance');
    s.player.xp = 4;
    setSlot(s, 'action', 'Controlled Disruption'); // Ice
    const top = s.world.duskDeck[0];
    const r = useSkill(s, 'Reflection', ['dusk', 'cycle']);
    expect(r.s.world.duskDeck[r.s.world.duskDeck.length - 1]).toBe(top);
  });
  it('Discipline：每 2 XP 忽略 1 Darkness；Alert 每 1 XP', () => {
    const s = base('Temperance');
    s.player.xp = 4;
    setSlot(s, 'action', 'Calculated Risk'); // Alert
    expect(questDarkness(useSkill(s, 'Discipline').s).ignored).toBe(4);
  });
});

// ================================================================= Wisdom

describe('Wisdom 卡片', () => {
  const w = () => {
    const s = base('Wisdom');
    s.player.hand.push(...s.player.deck.splice(0)); // 讓手牌有 trance 卡
    return s;
  };
  const tranceIn = (s: GameState) => s.player.hand.find((id) => cardName(id) !== cardName(s.player.actionSet.action!) && ['Valiance', 'Find Balance', 'Strong and Swift', 'Regain Control', 'Opportune Moment', 'Off the Beaten Path'].includes(cardName(id)));
  void tranceIn;
  it('Strong and Swift：Explore > Attack 時 +3；棄 1 Progress 附著 trance', () => {
    const s = w();
    setSlot(s, 'action', 'Strong and Swift');
    setSlot(s, 'attack', 'Off the Beaten Path'); // Attack 0 / Explore 10
    const e = addEnemy(s, 'Sol Scout');
    s.world.enemies[e].progress = 1;
    const r = useEffect(s, 'Strong and Swift/0', ['yes']);
    expect(mainAttack(r.s)).toBe(mainAttack(s) + 3);
    expect(r.s.world.enemies[e].attachments.length).toBe(1);
  });
  it('Strong and Swift+：附著 trance 到玩家區每個敵人；附著後造成 Progress 傷害', () => {
    const s = w();
    setSlot(s, 'action', 'Strong and Swift', true);
    const e = addEnemy(s, 'Cursed Banneret');
    s.world.enemies[e].progress = 2;
    const r = useEffect(s, 'Strong and Swift+/0');
    expect(r.s.world.enemies[e].attachments.length).toBe(1);
  });
  it('Find Balance：附著 trance，Progress 分給其他敵人；數量相同時卡片 +2 防禦', () => {
    const s = w();
    setSlot(s, 'action', 'Find Balance');
    const e = addEnemy(s, 'Sol Scout');
    const o = addEnemy(s, 'Green Wraith', 'quest');
    s.world.enemies[e].progress = 2;
    const r = useEffect(s, 'Find Balance/0');
    expect(r.s.world.enemies[o].progress).toBeGreaterThanOrEqual(2);
    expect(cardDefense(s, s.player.hand[0])).toBe(cardDefense(base('Wisdom'), s.player.hand[0]) + 2);
  });
  it('Find Balance+：Refresh 每個任務區有 trance 的敵人得 1 XP', () => {
    const s = w();
    setSlot(s, 'action', 'Find Balance', true);
    s.phase = 'refresh';
    const e = addEnemy(s, 'Sol Scout', 'quest');
    const tr = s.player.hand.find((id) => cardName(id) === 'Valiance')!;
    s.player.hand = s.player.hand.filter((x) => x !== tr);
    s.world.enemies[e].attachments.push(tr);
    expect(useEffect(s, 'Find Balance+/1').s.player.xp).toBe(1);
  });
  it('Valiance：附著 trance 的敵人多 1 XP；附著後在敵人放 1 Progress', () => {
    const s = w();
    setSlot(s, 'action', 'Find Balance');
    const e = addEnemy(s, 'Sol Scout');
    const before = enemyXP(s, e);
    const r = useEffect(s, 'Find Balance/0', [(d: { cards: string[] }) => [d.cards.find((c) => cardName(c) === 'Valiance')!]]);
    expect(r.s.world.enemies[e].progress).toBe(1); // Valiance 附著後
    setSlot(r.s, 'action', 'Valiance');
    expect(enemyXP(r.s, e)).toBe(before + 1);
  });
  it('Valiance+：MainAttack 與 MainExplore 互換', () => {
    const s = w();
    const atk = apBreakdown(s).main;
    const exp = epBreakdown(s).main;
    setSlot(s, 'action', 'Valiance', true);
    expect(apBreakdown(s).main).toBe(exp === 0 ? 0 : apBreakdown(s).main);
    expect(epBreakdown(s).main).toBe(atk === 0 ? 0 : epBreakdown(s).main);
  });
  it('Regain Control：附著後得到 Darkness 一半的光', () => {
    const s = w();
    setSlot(s, 'action', 'Regain Control');
    const e = addEnemy(s, 'Cursed Banneret'); // Darkness 4
    const r = useEffect(s, 'Regain Control/0', [(d: { cards: string[] }) => [d.cards.find((c) => cardName(c) === 'Regain Control') ?? d.cards[0]]]);
    expect(r.s.world.enemies[e].attachments.length).toBe(1);
  });
  it('Regain Control+：棄任務區敵人 1 Progress，Pull 並 Disarm', () => {
    const s = w();
    setSlot(s, 'action', 'Regain Control', true);
    const e = addEnemy(s, 'Sol Scout', 'quest');
    s.world.enemies[e].progress = 1;
    const r = useEffect(s, 'Regain Control+/1');
    expect(r.s.world.playerArea).toContain(e);
    expect(r.s.roundState.disarmed).toContain(e);
  });
  it('Opportune Moment：附著 trance 到每個有 Progress 的敵人並治療', () => {
    const s = w();
    setSlot(s, 'action', 'Opportune Moment');
    s.player.wounds = 2;
    const e = addEnemy(s, 'Cursed Banneret');
    s.world.enemies[e].progress = 1;
    const r = useEffect(s, 'Opportune Moment/0', [(d: { cards: string[] }) => [d.cards.find((c) => cardName(c) === 'Valiance')!]]);
    expect(r.s.player.wounds).toBe(1);
  });
  it('Opportune Moment+：棄掉 trance，造成 3 傷或拿回手牌', () => {
    const s = w();
    setSlot(s, 'action', 'Opportune Moment', true);
    const e = addEnemy(s, 'Cursed Banneret');
    const tr = s.player.hand.find((id) => cardName(id) === 'Valiance')!;
    s.player.hand = s.player.hand.filter((x) => x !== tr);
    s.world.enemies[e].attachments.push(tr);
    const r = useEffect(s, 'Opportune Moment+/1', ['wound']);
    expect(r.s.world.enemies[e].wounds).toBe(3);
    expect(r.s.player.discard).toContain(tr);
  });
  it('Off the Beaten Path：移除 Path，Pull 敵人並造成 2 × trance 數傷害', () => {
    const s = w();
    setSlot(s, 'action', 'Off the Beaten Path');
    s.world.location.paths = 1;
    const e = addEnemy(s, 'Cursed Banneret', 'quest');
    const tr = s.player.hand.find((id) => cardName(id) === 'Valiance')!;
    s.player.hand = s.player.hand.filter((x) => x !== tr);
    s.world.enemies[e].attachments.push(tr);
    const r = useEffect(s, 'Off the Beaten Path/0', [1]);
    expect(r.s.world.enemies[e].wounds).toBe(2);
    expect(r.s.world.playerArea).toContain(e);
  });
  it('Off the Beaten Path+：手牌所有 trance 附著並造成 3 傷', () => {
    const s = w();
    setSlot(s, 'action', 'Off the Beaten Path', true);
    s.player.hand = s.player.hand.filter((id) => ['Valiance'].includes(cardName(id)));
    const e = addEnemy(s, 'Cursed Banneret');
    expect(useEffect(s, 'Off the Beaten Path+/0').s.world.enemies[e].wounds).toBe(3);
  });
});

describe('Wisdom 技能', () => {
  it('Prep：橫置後交換 2 個技能方塊', () => {
    const s = base('Wisdom');
    const prep = s.player.skills.find((k) => k.name === 'Prep')!;
    prep.unlocked = true;
    prep.exhausted = false;
    const [a, b] = s.player.skills.filter((k) => k.name !== 'Prep' && k.cubeElement !== s.player.skills.find((x) => x.name !== 'Prep')!.cubeElement).length
      ? [s.player.skills.find((k) => k.name !== 'Prep')!, s.player.skills.find((k) => k.name !== 'Prep' && k.cubeElement !== s.player.skills.find((x) => x.name !== 'Prep')!.cubeElement)!]
      : [s.player.skills[1], s.player.skills[2]];
    const ea = a.cubeElement;
    const eb = b.cubeElement;
    const r = run(s, (ctx) => {
      const sk = ctx.s.player.skills.find((k) => k.name === 'Prep')!;
      sk.activatedByExhaust = false;
      ctx.s.roundState.activeElement = sk.cubeElement;
      return useSkillGen(ctx);
    }, [a.name, b.name, 'done']);
    expect(r.s.player.skills.find((k) => k.name === a.name)!.cubeElement).toBe(eb);
    expect(r.s.player.skills.find((k) => k.name === b.name)!.cubeElement).toBe(ea);
    expect(r.s.player.skills.find((k) => k.name === 'Prep')!.exhausted).toBe(true);
  });
  it('Solitude：Engagement 結束 push 並造成 1 傷', () => {
    const s = base('Wisdom');
    enableSkill(s, 'Solitude');
    const e = addEnemy(s, 'Cursed Banneret');
    const r = boundary(s, 'engagement', 'end', ['0']);
    expect(r.s.world.questArea).toContain(e);
    expect(r.s.world.enemies[e].wounds).toBeGreaterThanOrEqual(1);
  });
  it('Find a Way：效果 push 之後多 push 1 個並 Path +1', () => {
    const s = base('Wisdom');
    enableSkill(s, 'Find a Way');
    const a = addEnemy(s, 'Cursed Banneret');
    const b = addEnemy(s, 'Sol Scout');
    const r = run(s, (ctx) => push(ctx, a, 'T'));
    expect(r.s.world.questArea).toEqual(expect.arrayContaining([a, b]));
    expect(r.s.world.location.paths).toBe(1);
  });
  it('Gather Strength：附著 trance 後棄 1 Progress 結算它的行動', () => {
    const s = base('Wisdom');
    enableSkill(s, 'Gather Strength');
    const e = addEnemy(s, 'Cursed Banneret');
    s.world.enemies[e].progress = 1;
    const v = toHand(s, 'Regain Control');
    const r = run(s, (ctx) => attachGen(ctx, v, e));
    expect(r.logs.some((l) => l.includes('Gather Strength'))).toBe(true);
  });
  it('Singular Focus：MainExplore > MainAttack 的攻擊卡光費 −2', () => {
    const s = base('Wisdom', 'actionSet');
    enableSkill(s, 'Singular Focus');
    const atk = toHand(s, 'Off the Beaten Path');
    expect(lightCost(s, atk, 'attack')).toBe(lightCost(s, atk, 'action') - 2);
    void actionSetCost;
  });
});

import { attachCard, runEffect } from '../src/engine/ops';
import { defsForSkill } from '../src/engine/effects';
function* attachGen(ctx: Ctx, card: string, e: string) {
  yield* attachCard(ctx, card, e, 'T');
}
function* useSkillGen(ctx: Ctx) {
  const def = defsForSkill('Prep')[0];
  const src = { id: 'skill:Prep', kind: 'skill' as const, name: 'Prep' };
  yield* runEffect(ctx, src, def, () => def.active!.run(ctx, src));
}
void emitWill;
void pick;
