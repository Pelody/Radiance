// Profession 卡片 (基礎面、進階面) 與技能：每張至少一個測試。
import { describe, expect, it } from 'vitest';
import {
  apBreakdown,
  cardDefense,
  distanceBreakdown,
  enemyAttack,
  enemyDarkness,
  enemyDefenseVs,
  enemyHP,
  engagementCount,
  epBreakdown,
  attackType,
  questDarkness,
} from '../src/engine/calc';
import { cardName, locationCard } from '../src/engine/data';
import { enemyIgnored, restriction, skillActive, skillUnlocked } from '../src/engine/effects';
import type { Ctx } from '../src/engine/core';
import { attachCard, discardPlayerCard, emitWill, enemyToPlayer, heal, removeEnemyProgress, removeTreacheryProgress, woundPlayer } from '../src/engine/ops';
import { attackTargets, enemyAttacks } from '../src/engine/phases';
import type { GameState } from '../src/engine/types';
import { travel } from '../src/engine/world';
import {
  addEnemy,
  boundary,
  clearEnemies,
  enableSkill,
  fire,
  locId,
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

function base(profession: string, phase: Parameters<typeof stateAt>[0] = 'attack', luminary = 'Courage'): GameState {
  const s = stateAt(phase, { luminary, profession });
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
const all = (d: { cards: string[] }) => d.cards;
function* attach(ctx: Ctx, card: string, e: string | 'location') {
  yield* attachCard(ctx, card, e, 'T');
}
function* will(ctx: Ctx, ev: { t: string; [k: string]: unknown }) {
  yield* emitWill(ctx, ev);
}
/** 把手牌某張卡直接附著到敵人 (不觸發事件) */
function attachRaw(s: GameState, name: string, e: string, upgraded = false): string {
  const id = toHand(s, name, upgraded);
  s.player.hand = s.player.hand.filter((x) => x !== id);
  s.world.enemies[e].attachments.push(id);
  return id;
}

// ================================================================= Hunter

describe('Hunter 卡片', () => {
  const h = (phase: Parameters<typeof stateAt>[0] = 'attack') => base('Hunter', phase);
  it('Double Back：地點 Progress 移到敵人；附著時 −2 PhysicalDefense', () => {
    const s = h();
    setSlot(s, 'action', 'Double Back');
    s.world.location.progress = 3;
    const e = addEnemy(s, 'Cursed Banneret');
    const r = useEffect(s, 'Double Back/0', [2]);
    expect(r.s.world.enemies[e].progress).toBe(2);
    expect(r.s.world.location.progress).toBe(1);
    attachRaw(s, 'Double Back', e);
    expect(enemyDefenseVs(s, e, 'Physical')).toBe(1);
  });
  it('Double Back+：移除敵人所有 Progress 造成等量傷害', () => {
    const s = h();
    setSlot(s, 'action', 'Double Back', true);
    const e = addEnemy(s, 'Cursed Banneret');
    s.world.enemies[e].progress = 3;
    expect(useEffect(s, 'Double Back+/0').s.world.enemies[e].wounds).toBe(3);
  });
  it('Farsight：只能攻擊 1 個敵人、不能 push；可以攻擊任務區敵人', () => {
    const s = h();
    setSlot(s, 'action', 'Farsight');
    const a = addEnemy(s, 'Cursed Banneret');
    const q = addEnemy(s, 'Sol Scout', 'quest');
    expect(restriction(s, { kind: 'push', enemy: a })).toBeTruthy();
    const r = useEffect(s, 'Farsight/1');
    expect(attackTargets(r.s).find((o) => o.id === `assign:${q}`)!.legal).not.toBe(false);
    r.s.roundState.attackedThisPhase = [a];
    expect(restriction(r.s, { kind: 'attack', enemy: q })).toBeTruthy();
  });
  it('Farsight+：附著時 −5 HP (最少 1)', () => {
    const s = h();
    const e = addEnemy(s, 'Cursed Banneret');
    attachRaw(s, 'Farsight', e, true);
    expect(enemyHP(s, e)).toBe(7);
  });
  it('Unfailing Stamina：附著時 −1 攻擊；會重洗時 Recruit', () => {
    const s = h('refresh');
    const e = addEnemy(s, 'Cursed Banneret');
    attachRaw(s, 'Unfailing Stamina', e);
    expect(enemyAttack(s, e)).toBe(3);
    setSlot(s, 'action', 'Unfailing Stamina');
    s.player.deck = [];
    const n = s.player.hand.length;
    expect(useEffect(s, 'Unfailing Stamina/0').s.player.hand.length).toBe(n + 1);
  });
  it('Unfailing Stamina+：MainAttack + tracked 敵人攻擊總和', () => {
    const s = h();
    setSlot(s, 'action', 'Unfailing Stamina', true);
    const e = addEnemy(s, 'Sol Scout');
    s.world.enemies[e].progress = 1;
    expect(apBreakdown(useEffect(s, 'Unfailing Stamina+/0').s).main).toBe(apBreakdown(s).main + 1);
  });
  it('Arcing Shot：任務區最左邊的敵人接戰；攻擊 + 它的 Darkness', () => {
    const s = h('actionSet');
    setSlot(s, 'action', 'Arcing Shot');
    const e = addEnemy(s, 'Cursed Banneret', 'quest', false);
    const r = boundary(s, 'actionSet', 'end', ['0']);
    expect(r.s.world.playerArea).toContain(e);
    r.s.phase = 'attack';
    const r2 = useEffect(r.s, 'Arcing Shot/1');
    expect(apBreakdown(r2.s).main).toBe(apBreakdown(r.s).main + 4);
    expect(r2.s.roundState.questAttacks).toBe(1);
  });
  it('Arcing Shot+：攻擊任務區敵人自動 3 傷；附著時忽略敵人效果', () => {
    const s = h();
    setSlot(s, 'action', 'Arcing Shot', true);
    const q = addEnemy(s, 'Cursed Banneret', 'quest');
    const r = useEffect(s, 'Arcing Shot+/0');
    expect(fire(r.s, { t: 'EnemyAttackedByYou', enemy: q, zone: 'quest' }).s.world.enemies[q].wounds).toBe(3);
    const g = addEnemy(s, 'Green Wraith');
    attachRaw(s, 'Arcing Shot', g, true);
    expect(enemyIgnored(s, g)).toBe(true);
  });
  it('Lay of the Land：Progress = 地點座標和；附著時 Explore 放 Darkness 數的 Progress', () => {
    const s = h('explore');
    setSlot(s, 'action', 'Lay of the Land');
    const e = addEnemy(s, 'Cursed Banneret');
    const c = locationCard(s.world.location.id).coordinates;
    expect(useEffect(s, 'Lay of the Land/0').s.world.enemies[e].progress).toBe(c.east + c.south);
    setSlot(s, 'action', 'Arcing Shot');
    attachRaw(s, 'Lay of the Land', e);
    s.world.location.progress = 0;
    expect(useEffect(s, 'Lay of the Land/1').s.world.location.progress).toBe(4);
  });
  it('Lay of the Land+：忽略 trapped 敵人效果；附著時距離 −2', () => {
    const s = h();
    setSlot(s, 'action', 'Lay of the Land', true);
    const e = addEnemy(s, 'Green Wraith');
    attachRaw(s, 'Double Back', e);
    expect(enemyIgnored(useEffect(s, 'Lay of the Land+/0').s, e)).toBe(true);
    setSlot(s, 'action', 'Farsight');
    const s2 = structuredClone(s);
    s2.world.enemies[e].attachments = [];
    attachRaw(s2, 'Lay of the Land', e, true);
    const ev = { t: 'WillResolveDistance', distance: 5, min: 1 };
    run(s2, (ctx) => will(ctx, ev), ['0']);
    expect(ev.distance).toBe(3);
  });
  it('Trap of Madness：附著時 Attack 開始攻擊另 1 個敵人，再攻擊自己', () => {
    const s = h();
    const a = addEnemy(s, 'Thretin Hillman'); // 攻擊 5 Physical
    const b = addEnemy(s, 'Cursed Banneret'); // 防禦 3 Physical
    attachRaw(s, 'Trap of Madness', a);
    const r = boundary(s, 'attack', 'start', [b]);
    expect(r.s.world.enemies[b].wounds).toBe(2);
    expect(r.s.world.enemies[a].wounds).toBe(3);
  });
  it('Trap of Madness+：移除敵人 Progress 後每個 3 傷；附著時接戰 ±3', () => {
    const s = h();
    setSlot(s, 'action', 'Trap of Madness', true);
    const e = addEnemy(s, 'Cursed Banneret');
    s.world.enemies[e].progress = 2;
    expect(run(s, (ctx) => rmProg(ctx, e)).s.world.enemies[e].wounds).toBe(6);
    setSlot(s, 'action', 'Farsight');
    attachRaw(s, 'Trap of Madness', e, true);
    expect(engagementCount(useEffect(s, 'Trap of Madness+/1', [3]).s)).toBe(engagementCount(s) + 3);
  });
});

function* rmProg(ctx: Ctx, e: string) {
  yield* removeEnemyProgress(ctx, e, 2, 'T', 't');
}

describe('Hunter 技能', () => {
  it('Track the Enemy：Progress = ExploreBoost 分配給玩家區敵人', () => {
    const s = base('Hunter');
    const e = addEnemy(s, 'Cursed Banneret');
    expect(useSkill(s, 'Track the Enemy').s.world.enemies[e].progress).toBe(epBreakdown(s).booster);
  });
  it('Baiting Game：從棄牌堆附著 trap 到 tracked 敵人', () => {
    const s = base('Hunter');
    const e = addEnemy(s, 'Sol Scout');
    s.world.enemies[e].progress = 1;
    const trap = toHand(s, 'Double Back');
    s.player.hand = s.player.hand.filter((x) => x !== trap);
    s.player.discard.push(trap);
    const r = useSkill(s, 'Baiting Game', ['yes', [trap]]);
    expect(r.s.world.enemies[e].attachments).toEqual([trap]);
  });
  it('Stealth Tactics：花信標接戰 −2', () => {
    const s = base('Hunter', 'engagement');
    beacons(s, 1);
    s.player.light = 20;
    const r = useSkill(s, 'Stealth Tactics', [all]);
    expect(engagementCount(r.s)).toBe(Math.max(0, engagementCount(s) - 2));
  });
  it('Winding Paths：tracked 敵人棄 1 Progress push / pull', () => {
    const s = base('Hunter');
    const e = addEnemy(s, 'Sol Scout', 'quest');
    s.world.enemies[e].progress = 1;
    expect(useSkill(s, 'Winding Paths', [[e]]).s.world.playerArea).toContain(e);
  });
  it('Immobilize：trapped 敵人 Darkness 與攻擊為 0', () => {
    const s = base('Hunter');
    enableSkill(s, 'Immobilize');
    const e = addEnemy(s, 'Cursed Banneret');
    attachRaw(s, 'Double Back', e);
    expect(enemyAttack(s, e)).toBe(0);
    expect(enemyDarkness(s, e)).toBe(0);
  });
  it('Side Quests：任務區每個敵人 1 XP', () => {
    const s = base('Hunter', 'refresh');
    addEnemy(s, 'Sol Scout', 'quest');
    addEnemy(s, 'Green Wraith', 'quest');
    expect(useSkill(s, 'Side Quests').s.player.xp).toBe(2);
  });
  it('Reprioritize：trapped 敵人攻擊任務區敵人，然後 Progress 移到地點', () => {
    const s = base('Hunter');
    const a = addEnemy(s, 'Thretin Hillman');
    attachRaw(s, 'Double Back', a);
    s.world.enemies[a].progress = 2;
    const q = addEnemy(s, 'Cursed Banneret', 'quest');
    s.world.location.progress = 0;
    const r = useSkill(s, 'Reprioritize');
    expect(r.s.world.enemies[q].wounds).toBe(2);
    expect(r.s.world.location.progress).toBe(2);
  });
});

// ================================================================= Mender

describe('Mender 卡片', () => {
  const m = (phase: Parameters<typeof stateAt>[0] = 'attack') => base('Mender', phase);
  it('Winds of Change：棄 1 張；攻擊視為相反類型', () => {
    const s = m('actionSet');
    setSlot(s, 'action', 'Winds of Change');
    const n = s.player.hand.length;
    expect(useEffect(s, 'Winds of Change/0').s.player.hand.length).toBe(n - 1);
    const s2 = m();
    const before = attackType(s2);
    setSlot(s2, 'action', 'Winds of Change');
    expect(attackType(s2)).not.toBe(before);
  });
  it('Winds of Change+：鎖定技能視為解鎖；棄 1 張後未啟動技能視為啟動', () => {
    const s = m();
    setSlot(s, 'action', 'Winds of Change', true);
    const locked = s.player.skills.find((k) => !k.unlocked)!;
    expect(skillUnlocked(useEffect(s, 'Winds of Change+/0', [locked.name]).s, locked)).toBe(true);
    const off = s.player.skills.find((k) => !skillActive(s, k))!;
    expect(skillActive(useEffect(s, 'Winds of Change+/1', [(d: { cards: string[] }) => d.cards.slice(0, 1), off.name]).s, off)).toBe(true);
  });
  it('Power of the Mind：棄 3 張治療 3', () => {
    const s = m();
    setSlot(s, 'action', 'Power of the Mind');
    s.player.wounds = 3;
    expect(useEffect(s, 'Power of the Mind/0', [(d: { cards: string[] }) => d.cards.slice(0, 3)]).s.player.wounds).toBe(0);
  });
  it('Power of the Mind+：Countervail 每個特質結算 2 次', () => {
    const s = m();
    setSlot(s, 'action', 'Power of the Mind', true);
    enableSkill(s, 'Countervail');
    s.player.wounds = 3;
    const c = toHand(s, 'Stand Strong'); // Healer, Strong
    const r = run(s, (ctx) => disc(ctx, c));
    expect(r.s.player.wounds).toBe(1);
  });
  it('Windwall：棄 2 張 Disarm 2 個敵人', () => {
    const s = m();
    setSlot(s, 'action', 'Windwall');
    const a = addEnemy(s, 'Sol Scout');
    const b = addEnemy(s, 'Green Wraith');
    expect(useEffect(s, 'Windwall/0', [(d: { cards: string[] }) => d.cards.slice(0, 2)]).s.roundState.disarmed.sort()).toEqual([a, b].sort());
  });
  it('Windwall+：echo 是進階面時卡片 +2 防禦', () => {
    const s = m();
    setSlot(s, 'action', 'Windwall', true);
    const c = s.player.hand[0];
    const d0 = cardDefense(s, c);
    const top = toHand(s, 'Restoration');
    s.player.hand = s.player.hand.filter((x) => x !== top);
    s.player.discard.push(top);
    s.player.upgraded.push(top);
    expect(cardDefense(s, c)).toBe(d0 + 2);
  });
  it('Stand Strong：echo 拿回手牌再棄 1 張', () => {
    const s = m();
    setSlot(s, 'action', 'Stand Strong');
    s.player.discard.push(s.player.deck.shift()!);
    const echo = s.player.discard[s.player.discard.length - 1];
    const r = useEffect(s, 'Stand Strong/1', [(d: { cards: string[] }) => [d.cards.find((x) => x !== echo)!]]);
    expect(r.s.player.hand).toContain(echo);
  });
  it('Stand Strong+：花 2 光治療 2、Regenerate 2、push 2', () => {
    const s = m();
    setSlot(s, 'action', 'Stand Strong', true);
    s.player.wounds = 2;
    s.player.discard.push(...s.player.deck.splice(0, 3));
    const e = addEnemy(s, 'Sol Scout');
    const r = useEffect(s, 'Stand Strong+/0', [2]);
    expect(r.s.player.wounds).toBe(0);
    expect(r.s.player.discard.length).toBe(1);
    expect(r.s.world.questArea).toContain(e);
  });
  it('Restoration：棄探索卡，手牌 1 張放到探索卡槽 (付一半光費)', () => {
    const s = m();
    setSlot(s, 'action', 'Restoration');
    const old = s.player.actionSet.explore!;
    const r = useEffect(s, 'Restoration/1');
    expect(r.s.player.discard).toContain(old);
    expect(r.s.player.actionSet.explore).not.toBe(old);
  });
  it('Restoration+：本回合對自己造成傷害時得 3 光', () => {
    const s = m('refresh');
    setSlot(s, 'action', 'Restoration', true);
    s.roundState.selfWounded = 1;
    expect(useEffect(s, 'Restoration+/1').s.player.light).toBe(13);
  });
  it('Inner Strength：棄 1 張後依 echo 類型 +6 MainExplore 或 +4 MainAttack', () => {
    const s = m();
    setSlot(s, 'action', 'Inner Strength');
    const c = s.player.hand[0];
    const r = useEffect(s, 'Inner Strength/1', [[c]]);
    const photonic = (r.s.player.discard.length && require_face(r.s, c)) === 'Photonic';
    if (photonic) expect(epBreakdown(r.s).main).toBe(epBreakdown(s).main + 6);
    else expect(apBreakdown(r.s).main).toBe(apBreakdown(s).main + 4);
  });
  it('Inner Strength+：棄 2 張，所有技能解鎖且啟動', () => {
    const s = m();
    setSlot(s, 'action', 'Inner Strength', true);
    const r = useEffect(s, 'Inner Strength+/1', ['both', (d: { cards: string[] }) => d.cards.slice(0, 2)]);
    expect(r.s.player.skills.every((k) => skillUnlocked(r.s, k) && skillActive(r.s, k))).toBe(true);
  });
});

import { face } from '../src/engine/calc';
const require_face = (s: GameState, c: string) => face(s, c).attack_type;
function* disc(ctx: Ctx, c: string) {
  yield* discardPlayerCard(ctx, c, 'effect', 'T');
}

describe('Mender 技能', () => {
  it('Hidden Depth：棄掉的卡算作 X 張 clone (防禦時每張 1)', () => {
    const s = base('Mender', 'defend');
    enableSkill(s, 'Hidden Depth');
    const e = addEnemy(s, 'Cursed Banneret');
    const c = s.player.hand.find((x) => face(s, x).attack_type === 'Physical' && face(s, x).defense >= 2);
    if (!c) return;
    const r = run(s, (ctx) => enemyAttacks(ctx, e, 'T'), [`hand:${c}`, '0', pick('done')]);
    expect(r.s.roundState.defendedWithCount).toBe(face(s, c).defense);
  });
  it('Countervail：棄 Healer 卡治療 1', () => {
    const s = base('Mender');
    enableSkill(s, 'Countervail');
    s.player.wounds = 2;
    const c = toHand(s, 'Power of the Mind'); // Healer, Fervent
    const r = run(s, (ctx) => disc(ctx, c));
    expect(r.s.player.wounds).toBe(1);
  });
  it('Bolster：棄掉與 echo 同元素的卡，得到它的加成值', () => {
    const s = base('Mender');
    enableSkill(s, 'Bolster');
    const a = toHand(s, 'Power of the Mind'); // Earth
    const b = toHand(s, 'Restoration'); // Earth
    s.player.hand = s.player.hand.filter((x) => x !== a);
    s.player.discard.push(a);
    const r = run(s, (ctx) => disc(ctx, b), ['0']);
    expect(apBreakdown(r.s).booster).toBe(apBreakdown(s).booster + face(s, b).attack_booster);
  });
  it('Redirect：治療時把傷害放到敵人身上', () => {
    const s = base('Mender');
    enableSkill(s, 'Redirect');
    s.player.wounds = 2;
    const e = addEnemy(s, 'Cursed Banneret');
    expect(run(s, (ctx) => healGen(ctx, 2)).s.world.enemies[e].wounds).toBe(2);
  });
  it('Enduring Hope：echo 的元素也算啟動', () => {
    const s = base('Mender');
    enableSkill(s, 'Enduring Hope');
    s.player.skills.find((k) => k.name === 'Enduring Hope')!.activatedByExhaust = true;
    const top = s.player.deck.shift()!;
    s.player.discard.push(top);
    const other = s.player.skills.find((k) => k.cubeElement === face(s, top).element && k.name !== 'Enduring Hope')!;
    other.activatedByExhaust = false;
    s.roundState.activeElement = null;
    expect(skillActive(s, other)).toBe(true);
  });
  it('Dark Past：沒有解鎖且啟動時 Refresh 受 1 傷或付 1 光', () => {
    const s = base('Mender', 'refresh');
    expect(boundary(s, 'refresh', 'end', ['light']).s.player.light).toBe(9);
  });
  it('Songs of Battle：棄 1 張，對相反類型的敵人造成防禦值傷害', () => {
    const s = base('Mender');
    const c = s.player.hand[0];
    const type = face(s, c).attack_type;
    const e = addEnemy(s, type === 'Physical' ? 'Envy' : 'Cursed Banneret'); // 相反類型
    const r = useSkill(s, 'Songs of Battle', ['yes', [c], 'no']);
    expect(r.s.world.enemies[e].wounds).toBe(cardDefense(s, c));
  });
});

function* healGen(ctx: Ctx, n: number) {
  yield* heal(ctx, n, 'T', 't');
}

// ================================================================= Scorchwright

describe('Scorchwright 卡片', () => {
  const sc = (phase: Parameters<typeof stateAt>[0] = 'attack') => base('Scorchwright', phase);
  it('Fan the Flame：抽 1 張；之後附著效果結算後再附著最多 2 張 fire 卡', () => {
    const s = sc();
    setSlot(s, 'action', 'Fan the Flame');
    const n = s.player.hand.length;
    const r = useEffect(s, 'Fan the Flame/0', [1]);
    expect(r.s.player.hand.length).toBe(n + 1);
    expect(r.s.lingering.length).toBe(1);
  });
  it('Fan the Flame+：已經有 fire 卡的敵人各再附著 1 張', () => {
    const s = sc();
    setSlot(s, 'action', 'Fan the Flame', true);
    const e = addEnemy(s, 'Cursed Banneret');
    attachRaw(s, 'Shortcut', e);
    expect(useEffect(s, 'Fan the Flame+/0', [0]).s.world.enemies[e].attachments.length).toBe(2);
  });
  it('Shortcut：地點 6+ Progress 時放 5 個', () => {
    const s = sc();
    setSlot(s, 'action', 'Shortcut');
    s.world.location.progress = 6;
    expect(useEffect(s, 'Shortcut/0').logs.some((l) => l.includes('Progress +5'))).toBe(true);
  });
  it('Shortcut+：Progress = 2 × Threat token；Refresh 不放 Threat token', () => {
    const s = sc('explore');
    setSlot(s, 'action', 'Shortcut', true);
    s.world.location.threatTokens = 2;
    s.world.location.progress = 0;
    expect(useEffect(s, 'Shortcut+/0').s.world.location.progress).toBe(4);
  });
  it('Scout Ahead：加 Obstacle，每個拿 1 張 fire 卡', () => {
    const s = sc();
    setSlot(s, 'action', 'Scout Ahead');
    const n = s.player.hand.length;
    const r = useEffect(s, 'Scout Ahead/0', [1]);
    expect(r.s.world.location.obstacles).toBe(s.world.location.obstacles + 1);
    expect(r.s.player.hand.length).toBe(n + 1);
  });
  it('Scout Ahead+：從地點棄牌堆保存 3 個信標', () => {
    const s = sc();
    setSlot(s, 'action', 'Scout Ahead', true);
    s.world.locationDiscard.push(...s.world.locationDeck.splice(0, 3));
    expect(useEffect(s, 'Scout Ahead+/0', [(d: { cards: string[]; max?: number }) => d.cards.slice(0, d.max)]).s.player.beacons.length).toBe(3);
  });
  it('Easy Target / Easy Target+：Burnout 後 +3 傷', () => {
    const s = sc('refresh');
    setSlot(s, 'action', 'Easy Target', true);
    const e = addEnemy(s, 'Cursed Banneret');
    attachRaw(s, 'Shortcut', e);
    const r = useSkill(s, 'Burnout');
    expect(r.s.world.enemies[e].wounds).toBe(6);
    const s2 = sc('refresh');
    setSlot(s2, 'action', 'Easy Target');
    const e2 = addEnemy(s2, 'Cursed Banneret');
    attachRaw(s2, 'Shortcut', e2);
    expect(useSkill(s2, 'Burnout').s.world.enemies[e2].wounds).toBe(6);
  });
  it('Burning Bright：地點有 fire 附著時完成探索，移動時抽 3 張', () => {
    const s = sc();
    setSlot(s, 'action', 'Burning Bright');
    const f = toHand(s, 'Shortcut');
    s.player.hand = s.player.hand.filter((x) => x !== f);
    s.world.location.attachments.push(f);
    expect(fire(s, { t: 'LocationExplored', final: false }, ['0']).s.roundState.flags.burningBright).toBe(1);
  });
  it('Burning Bright+：棄 fire 附著，敵人 6 傷、地點 +7', () => {
    const s = sc();
    setSlot(s, 'action', 'Burning Bright', true);
    const e = addEnemy(s, 'Cursed Banneret');
    attachRaw(s, 'Shortcut', e);
    s.world.location.progress = 0;
    expect(useEffect(s, 'Burning Bright+/0', [all]).s.world.enemies[e].wounds).toBe(6);
  });
  it('Resourceful：行動組的 fire 卡附著到敵人並造成 2 傷', () => {
    const s = sc('refresh');
    setSlot(s, 'action', 'Resourceful');
    const e = addEnemy(s, 'Cursed Banneret');
    const r = useEffect(s, 'Resourceful/0');
    expect(r.s.world.enemies[e].attachments.length).toBe(1);
    expect(r.s.world.enemies[e].wounds).toBe(2);
  });
  it('Resourceful+：抽最多 3 張；依地點棄牌堆的植物地點放 Progress', () => {
    const s = sc();
    setSlot(s, 'action', 'Resourceful', true);
    s.world.locationDiscard = [locId('Stillwood')];
    s.world.location.progress = 0;
    expect(useEffect(s, 'Resourceful+/0', [0, 2]).s.world.location.progress).toBe(2);
  });
});

describe('Scorchwright 技能', () => {
  it('Blazing Torch：附著 X+1 張 fire 卡，push X 個敵人', () => {
    const s = base('Scorchwright');
    const e = addEnemy(s, 'Cursed Banneret');
    const r = useSkill(s, 'Blazing Torch');
    expect(r.s.world.enemies[e].attachments.length).toBe(2);
    expect(r.s.world.questArea).toContain(e);
  });
  it('Sabotage：探索後 +3 XP', () => {
    const s = base('Scorchwright');
    enableSkill(s, 'Sabotage');
    expect(fire(s, { t: 'LocationExplored' }).s.player.xp).toBe(3);
  });
  it('Slash and Burn：Tree 地點附著 fire 卡，Regenerate 1', () => {
    const s = base('Scorchwright');
    setLocation(s, 'Stillwood');
    s.player.discard.push(s.player.deck.shift()!);
    const r = useSkill(s, 'Slash and Burn');
    expect(r.s.world.location.attachments.length).toBe(1);
  });
  it('From the Ashes：附著時可以選棄牌堆的卡', () => {
    const s = base('Scorchwright');
    enableSkill(s, 'From the Ashes');
    const e = addEnemy(s, 'Cursed Banneret');
    s.player.discard.push(...s.player.hand.splice(0));
    const r = useSkill(s, 'Blazing Torch');
    expect(r.s.world.enemies[e]?.attachments.length ?? 2).toBeGreaterThan(0);
  });
  it('Cut and Run：移除 2 Obstacle，忽略特質', () => {
    const s = base('Scorchwright');
    s.world.location.obstacles = 2;
    const e = addEnemy(s, 'Sol Scout');
    const r = useSkill(s, 'Cut and Run', [2, e, 'Sol', 'none']);
    expect(r.s.world.location.obstacles).toBe(0);
    expect(r.s.roundState.removedTraits).toEqual([{ target: e, trait: 'Sol' }]);
  });
  it('Firestorm：fire 附著的地點，Progress 變傷害後移動', () => {
    const s = base('Scorchwright');
    const f = toHand(s, 'Shortcut');
    s.player.hand = s.player.hand.filter((x) => x !== f);
    s.world.location.attachments.push(f);
    s.world.location.progress = 3;
    const e = addEnemy(s, 'Cursed Banneret');
    const from = s.world.location.id;
    const r = useSkill(s, 'Firestorm', [pick('travel')]);
    expect(r.s.world.enemies[e].wounds).toBe(3);
    expect(r.s.world.location.id).not.toBe(from);
    expect(r.s.player.discard).toContain(f);
  });
});

// ================================================================= Wayfarer

describe('Wayfarer 卡片', () => {
  const wf = (phase: Parameters<typeof stateAt>[0] = 'attack') => base('Wayfarer', phase, 'Justice');
  it('Fortitude：移動時忽略 Obstacle', () => {
    const s = wf();
    s.world.location.obstacles = 3;
    const dest = s.world.locationDeck[0];
    const d0 = distanceBreakdown(s, dest, 0).total;
    setSlot(s, 'action', 'Fortitude');
    expect(distanceBreakdown(s, dest, 0).total).toBe(Math.max(1, d0 - 3));
  });
  it('Fortitude+：付 2 光 Dusk/Doom 防禦加倍；移動時每個 Obstacle 移除 2 Treachery Progress', () => {
    const s = wf();
    setSlot(s, 'action', 'Fortitude', true);
    const e = addEnemy(s, 'Cursed Banneret');
    expect(enemyDefenseVs(useEffect(s, 'Fortitude+/0', ['2']).s, e, 'Physical')).toBe(6);
    s.world.location.obstacles = 1;
    s.world.treacheryProgress = 3;
    expect(fire(s, { t: 'TravelStarted' }, ['0']).s.world.treacheryProgress).toBe(1);
  });
  it('Hasten：給地點行動組中的特質', () => {
    const s = wf();
    setSlot(s, 'action', 'Hasten');
    const r = useEffect(s, 'Hasten/0');
    expect(r.s.roundState.grantedTraits[0].target).toBe(s.world.location.id);
  });
  it('Hasten+：攻擊卡與地點有相同特質時抗性 −2，可以再花 1 光 −2', () => {
    const s = wf();
    setSlot(s, 'action', 'Hasten', true);
    setSlot(s, 'attack', 'Fortitude'); // Plant, Tree
    setLocation(s, 'Stillwood'); // Tree
    s.world.resistance = 5;
    expect(useEffect(s, 'Hasten+/0', ['yes']).s.world.resistance).toBe(1);
  });
  it('Step Lightly：花 1 光接戰 −2，每少 1 個 +2 Progress', () => {
    const s = wf();
    setSlot(s, 'action', 'Step Lightly');
    s.player.light = 20;
    s.world.location.progress = 0;
    const n = engagementCount(s);
    const r = useEffect(s, 'Step Lightly/0', ['1']);
    expect(engagementCount(r.s)).toBe(Math.max(0, n - 2));
  });
  it('Step Lightly+：花光 Path +2', () => {
    const s = wf();
    setSlot(s, 'action', 'Step Lightly', true);
    expect(useEffect(s, 'Step Lightly+/0', [1, 'path']).s.world.location.paths).toBe(2);
  });
  it('Light the Path：花 2 光 Path +4', () => {
    const s = wf();
    setSlot(s, 'action', 'Light the Path');
    expect(useEffect(s, 'Light the Path/0', [2, 'path', 'path']).s.world.location.paths).toBe(4);
  });
  it('Light the Path+：與地點同特質的卡每張得 2 光', () => {
    const s = wf();
    setSlot(s, 'action', 'Light the Path', true); // Tree...
    setLocation(s, 'Stillwood');
    const r = useEffect(s, 'Light the Path+/0', ['no']);
    expect(r.s.player.light).toBeGreaterThanOrEqual(12);
  });
  it('Foresight：花光忽略 3 Darkness', () => {
    const s = wf('darkness');
    setSlot(s, 'action', 'Foresight');
    expect(questDarkness(useEffect(s, 'Foresight/0', [1, 'dark']).s).ignored).toBe(3);
  });
  it('Foresight+：移動時棄信標距離 −2 (最低 0)', () => {
    const s = wf();
    setSlot(s, 'action', 'Foresight', true);
    beacons(s, 1);
    const ev = { t: 'WillResolveDistance', distance: 1, min: 1 };
    run(s, (ctx) => will(ctx, ev), ['0', all]);
    expect(ev.min).toBe(0);
    expect(Math.max(ev.min, ev.distance)).toBe(0);
  });
  it('Ever Onward：效果移除 Treachery Progress 後地點 + X+2', () => {
    const s = wf();
    setSlot(s, 'action', 'Ever Onward');
    s.world.treacheryProgress = 2;
    s.world.location.progress = 0;
    expect(run(s, (ctx) => rmT(ctx), ['0']).s.world.location.progress).toBe(4);
  });
  it('Ever Onward+：重新排列地點牌庫頂端', () => {
    const s = wf();
    setSlot(s, 'action', 'Ever Onward', true);
    setLocation(s, 'Stillwood');
    const r = useEffect(s, 'Ever Onward+/0', [(d: { cards: string[] }) => d.cards.slice().reverse()]);
    expect(r.s.world.locationDeck.length).toBe(s.world.locationDeck.length);
  });
});

function* rmT(ctx: Ctx) {
  yield* removeTreacheryProgress(ctx, 2, 'T', 't');
}

describe('Wayfarer 技能', () => {
  it('Secret Ways：移除 1 Path 抵銷 2 傷', () => {
    const s = base('Wayfarer', 'defend', 'Justice');
    enableSkill(s, 'Secret Ways');
    s.world.location.paths = 1;
    expect(run(s, (ctx) => woundGen(ctx), ['0']).s.player.wounds).toBe(1);
  });
  it('Familiar Places：探索卡與目的地同特質時距離 −2', () => {
    const s = base('Wayfarer', 'attack', 'Justice');
    enableSkill(s, 'Familiar Places');
    setSlot(s, 'explore', 'Fortitude'); // Plant, Tree
    const ev = { t: 'WillResolveDistance', dest: locId('Stillwood'), distance: 5, min: 1 };
    run(s, (ctx) => will(ctx, ev));
    expect(ev.distance).toBe(3);
  });
  it('Choose Wisely：延後的地點不加距離', () => {
    const s = base('Wayfarer', 'attack', 'Justice');
    enableSkill(s, 'Choose Wisely');
    const ev = { t: 'WillResolveDistance', dest: locId('Stillwood'), distance: 5, min: 1, deferred: 2 };
    run(s, (ctx) => will(ctx, ev), ['0']);
    expect(ev.distance).toBe(3);
  });
  it('Infiltrate：探索卡與地點同特質時移除 4 Treachery Progress', () => {
    const s = base('Wayfarer', 'attack', 'Justice');
    setSlot(s, 'explore', 'Fortitude');
    setLocation(s, 'Stillwood');
    s.world.treacheryProgress = 5;
    expect(useSkill(s, 'Infiltrate').s.world.treacheryProgress).toBe(1);
  });
  it('Field Advantage：行動卡與地點同特質時 Disarm 3 個敵人', () => {
    const s = base('Wayfarer', 'attack', 'Justice');
    setSlot(s, 'action', 'Fortitude');
    setLocation(s, 'Stillwood');
    const e = addEnemy(s, 'Sol Scout');
    expect(useSkill(s, 'Field Advantage').s.roundState.disarmed).toEqual([e]);
  });
  it('All-Terrain：加 Obstacle 並 push', () => {
    const s = base('Wayfarer', 'defend', 'Justice');
    const e = addEnemy(s, 'Sol Scout');
    const r = useSkill(s, 'All-Terrain', [1]);
    expect(r.s.world.questArea).toContain(e);
  });
  it('In the Wind：push X+1 個敵人並造成防禦值傷害', () => {
    const s = base('Wayfarer', 'attack', 'Justice');
    const e = addEnemy(s, 'Cursed Banneret');
    const r = useSkill(s, 'In the Wind');
    expect(r.s.world.questArea).toContain(e);
    expect(r.s.world.enemies[e].wounds).toBe(3);
  });
});

function* woundGen(ctx: Ctx) {
  yield* woundPlayer(ctx, 3, 'enemyAttack', 'T', 't');
}

void cardName;
void enemyToPlayer;
void travel;
void attach;
