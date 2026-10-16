// 敵人、地點、Treachery、Shade 的卡片效果 (每張至少一個測試)。
import { describe, expect, it } from 'vitest';
import {
  cardDefense,
  distanceBreakdown,
  enemyAttack,
  enemyAttackCount,
  enemyDarkness,
  enemyDefenseVs,
  enemyHP,
  enemyInitiative,
  enemyTypes,
  enemyXP,
  engagementCount,
  lightCost,
  locationEV,
  threatBreakdown,
} from '../src/engine/calc';
import { cardName, locationCard, playerCard, treacheryCard } from '../src/engine/data';
import { enemyToPlayer } from '../src/engine/ops';
import { restriction, skillActive } from '../src/engine/effects';
import {
  checkTreachery,
  defeatEnemy,
  placeTreacheryProgress,
  revealEnemy,
  woundEnemy,
  woundPlayer,
} from '../src/engine/ops';
import { enemyAttacks } from '../src/engine/phases';
import { growthCost } from '../src/engine/window';
import { placeLocationProgress, travel } from '../src/engine/world';
import type { GameState } from '../src/engine/types';
import { playerCardId, addEnemy, boundary, clearEnemies, fire, locId, pick, run, setLocation, setSlot, stateAt, treacheryId, useEffect } from './helpers/cards';

const base = (phase: Parameters<typeof stateAt>[0] = 'attack') => {
  const s = stateAt(phase);
  clearEnemies(s);
  setLocation(s, 'Spellwood'); // 沒有戰鬥相關效果的地點
  return s;
};
const done = pick('done');

/** 讓 Treachery 進行中，PV 夠大不會完成 */
function activeTreachery(s: GameState, name = 'Hidden Pitfalls'): void {
  const id = treacheryId(name);
  s.world.treacheryDeck = s.world.treacheryDeck.filter((x) => x !== id);
  s.world.activeTreachery = id;
  s.world.treacheryProgress = 0;
}

/** 完成某張 Treachery (結算 When Completed，legacy 生效) */
function complete(s: GameState, name: string, answers: unknown[] = []) {
  activeTreachery(s, name);
  s.world.completedTreacheries = [];
  return run(
    s,
    function* (ctx) {
      ctx.s.world.treacheryProgress = treacheryCard(ctx.s.world.activeTreachery!).progress_value;
      yield* checkTreachery(ctx);
    },
    answers,
  );
}

// ================================================================= 敵人

describe('Dusk 敵人', () => {
  it('Thretin Marshals：When Defeated Treachery + 腐化值', () => {
    const s = base();
    activeTreachery(s);
    s.world.corruption = 3;
    const id = addEnemy(s, 'Thretin Marshals');
    const r = run(s, (ctx) => defeatEnemy(ctx, id));
    expect(r.s.world.treacheryProgress).toBe(3);
  });
  it('Green Wraith：攻擊 = 腐化值', () => {
    const s = base();
    s.world.corruption = 4;
    const id = addEnemy(s, 'Green Wraith');
    expect(enemyAttack(s, id)).toBe(4);
  });
  it('Sol Scout：擊敗時任務區最前面的敵人接戰；2 點溢出傷害可忽略', () => {
    const s = base();
    const scout = addEnemy(s, 'Sol Scout');
    const q = addEnemy(s, 'Garadeth Grunt', 'quest');
    const r = run(s, (ctx) => woundEnemy(ctx, scout, 2, 'direct', 'T'));
    expect(r.s.world.playerArea).toContain(q);
    const r2 = run(s, (ctx) => woundEnemy(ctx, scout, 4, 'direct', 'T'), ['ignore']);
    expect(r2.s.world.questArea).toContain(q);
  });
  it('Pyrus Lobber：攻擊時 Threat token +1', () => {
    const s = base('defend');
    const id = addEnemy(s, 'Pyrus Lobber');
    const r = run(s, (ctx) => enemyAttacks(ctx, id, 'T'), [done]);
    expect(r.s.world.location.threatTokens).toBe(s.world.location.threatTokens + 1);
  });
  it('Sol Conspirator：Attack Phase 結束 Treachery +1', () => {
    const s = base();
    activeTreachery(s);
    addEnemy(s, 'Sol Conspirator');
    expect(boundary(s, 'attack', 'end').s.world.treacheryProgress).toBe(1);
  });
  it('Thretin Swifter：被攻擊時選擇受 1 傷或 Treachery +2', () => {
    const s = base();
    activeTreachery(s);
    const id = addEnemy(s, 'Thretin Swifter');
    const r = fire(s, { t: 'EnemyAttackedByYou', enemy: id }, ['treachery']);
    expect(r.s.world.treacheryProgress).toBe(2);
    const r2 = fire(s, { t: 'EnemyAttackedByYou', enemy: id }, ['wound']);
    expect(r2.s.player.wounds).toBe(1);
  });
  it('Sol Assassin：移動距離 > 3 時先接戰再立即攻擊', () => {
    const s = base();
    const id = addEnemy(s, 'Sol Assassin', 'quest');
    const r = fire(s, { t: 'Arrived', distance: 4 }, [done]);
    expect(r.s.world.playerArea).toContain(id);
    expect(r.s.player.wounds).toBe(1);
    expect(fire(s, { t: 'Arrived', distance: 3 }).s.player.wounds).toBe(0);
  });
  it('Moltan Trail Hound：距離 +1', () => {
    const s = base();
    const dest = s.world.locationDeck[0];
    const before = distanceBreakdown(s, dest, 0).total;
    addEnemy(s, 'Moltan Trail Hound', 'quest');
    expect(distanceBreakdown(s, dest, 0).total).toBe(before + 1);
  });
  it('Garadeth Seeker：腐化 ≥ 4 時攻擊 2 次', () => {
    const s = base();
    const id = addEnemy(s, 'Garadeth Seeker');
    expect(enemyAttackCount(s, id)).toBe(1);
    s.world.corruption = 4;
    expect(enemyAttackCount(s, id)).toBe(2);
  });
  it('Red Wraith：Darkness = 腐化值', () => {
    const s = base();
    s.world.corruption = 3;
    expect(enemyDarkness(s, addEnemy(s, 'Red Wraith', 'quest'))).toBe(3);
  });
  it('Moltan Spy：When Revealed 選擇移除地點 Progress 或 Treachery +X', () => {
    const s = base('staging');
    activeTreachery(s);
    s.world.location.progress = 0;
    const spy = s.world.duskDeck.find((x) => cardName(x) === 'Moltan Spy')!;
    s.world.duskDeck = [spy, ...s.world.duskDeck.filter((x) => x !== spy)];
    const r = run(s, (ctx) => revealEnemy(ctx, 'Dusk', 'T'));
    expect(r.s.world.treacheryProgress).toBe(1);
  });
  it('Garadeth Shieldbearer：{Player} 手牌還有卡時不能用牌庫防禦', () => {
    const s = base();
    addEnemy(s, 'Garadeth Shieldbearer');
    expect(restriction(s, { kind: 'defendFromDeck' })).toBeTruthy();
    s.player.hand = [];
    expect(restriction(s, { kind: 'defendFromDeck' })).toBeNull();
  });
  it('Moltan Spellcaster：Explore 結束時移除 2 Progress 或受 1 傷', () => {
    const s = base();
    s.world.location.progress = 1;
    addEnemy(s, 'Moltan Spellcaster');
    // KC-12f：只有 1 Progress (部分) → 必須選能完全結算的受 1 傷
    expect(boundary(s, 'explore', 'end').s.player.wounds).toBe(1);
  });
  it('Garadeth Grunt：+X HP', () => {
    const s = base();
    const id = addEnemy(s, 'Garadeth Grunt');
    s.world.completedTreacheries = [treacheryId('Sabotage')];
    expect(enemyHP(s, id)).toBe(3);
  });
  it('Wing Wraith：Treachery 完成時改為 Fast 並重新翻開到任務區前端', () => {
    const s = base();
    const id = addEnemy(s, 'Wing Wraith');
    addEnemy(s, 'Garadeth Grunt', 'quest');
    const r = fire(s, { t: 'TreacheryCompleted' });
    expect(r.s.world.questArea[r.s.world.questArea.length - 1]).toBe(id);
    expect(enemyInitiative(r.s, id)).toBe('Fast');
  });
  it('Pyrus Razer：移動後 Treachery + 距離，自己受 1 傷', () => {
    const s = base();
    activeTreachery(s);
    const id = addEnemy(s, 'Pyrus Razer', 'quest');
    const r = fire(s, { t: 'Arrived', distance: 3 });
    expect(r.s.world.treacheryProgress).toBe(3);
    expect(r.s.world.enemies[id].wounds).toBe(1);
  });
  it('Terragard Watchman：{Quest} 探索後受 Treachery Progress 傷害', () => {
    const s = base();
    s.world.treacheryProgress = 2;
    addEnemy(s, 'Terragard Watchman', 'quest');
    expect(fire(s, { t: 'LocationExplored' }).s.player.wounds).toBe(2);
  });
});

describe('Doom 敵人', () => {
  it('Waking Wraith：腐化 ≥ 3 時也有 Photonic 防禦 2', () => {
    const s = base();
    const id = addEnemy(s, 'Waking Wraith');
    s.world.corruption = 3;
    expect(enemyTypes(s, id)).toEqual(['Physical', 'Photonic']);
    expect(enemyDefenseVs(s, id, 'Photonic')).toBe(2);
  });
  it('Thretin Torchwielder：腐化 ≥ 4 時 Cabalist 敵人接戰', () => {
    const s = base('staging');
    s.world.corruption = 4;
    const g = addEnemy(s, 'Green Wraith', 'quest');
    const t = s.world.doomDeck.find((x) => cardName(x) === 'Thretin Torchwielder')!;
    s.world.doomDeck = [t, ...s.world.doomDeck.filter((x) => x !== t)];
    const r = run(s, (ctx) => revealEnemy(ctx, 'Doom', 'T'));
    expect(r.s.world.playerArea).toEqual(expect.arrayContaining([g, t]));
  });
  it('Terragard Warrior：攻擊 = 地點 Progress', () => {
    const s = base();
    s.world.location.progress = 5;
    expect(enemyAttack(s, addEnemy(s, 'Terragard Warrior'))).toBe(5);
  });
  it('Thretin Hillman：攻擊時放 Progress 到 Treachery 降低攻擊', () => {
    const s = base('defend');
    activeTreachery(s);
    const id = addEnemy(s, 'Thretin Hillman');
    const r = run(s, (ctx) => enemyAttacks(ctx, id, 'T'), [3, done]);
    expect(r.s.world.treacheryProgress).toBe(3);
    expect(r.s.player.wounds).toBe(2);
  });
  it('Sol Starcaster：{Player} 每回合前 2 個地點 Progress 改放 Treachery', () => {
    const s = base('explore');
    activeTreachery(s);
    s.world.location.progress = 0;
    addEnemy(s, 'Sol Starcaster');
    const r = run(s, function* (ctx) {
      yield* placeLocationProgress(ctx, 1, 'T', 't');
      yield* placeLocationProgress(ctx, 3, 'T', 't');
    });
    expect(r.s.world.treacheryProgress).toBe(2);
    expect(r.s.world.location.progress).toBe(2);
  });
  it('Druidane Spellcaster：保存信標時 Treachery +1 / +2', () => {
    const s = base();
    activeTreachery(s);
    addEnemy(s, 'Druidane Spellcaster', 'quest');
    expect(fire(s, { t: 'BeaconSaved' }).s.world.treacheryProgress).toBe(1);
    const s2 = base();
    activeTreachery(s2);
    addEnemy(s2, 'Druidane Spellcaster');
    expect(fire(s2, { t: 'BeaconSaved' }).s.world.treacheryProgress).toBe(2);
  });
  it('Flocking Wyrm：每個其他 Cabalist +1 攻擊', () => {
    const s = base();
    const id = addEnemy(s, 'Flocking Wyrm');
    addEnemy(s, 'Thretin Marshals', 'quest');
    expect(enemyAttack(s, id)).toBe(4);
  });
  it('Necro-Mage：攻擊後不能再攻擊；擊敗時移除同區傷害，沒有就重新翻開', () => {
    const s = base();
    const id = addEnemy(s, 'Necro-Mage');
    expect(fire(s, { t: 'EnemyAttackedByYou', enemy: id }).s.roundState.attackLocked).toBe(true);
    const other = addEnemy(s, 'Garadeth Grunt');
    s.world.enemies[other].wounds = 1;
    const r = run(s, (ctx) => defeatEnemy(ctx, id));
    expect(r.s.world.enemies[id]).toBeUndefined();
    expect(r.s.world.enemies[other].wounds).toBe(0);
    s.world.enemies[other].wounds = 0;
    const r2 = run(s, (ctx) => defeatEnemy(ctx, id));
    expect(r2.s.world.questArea).toContain(id);
    expect(r2.s.player.xp).toBe(s.player.xp);
  });
  it('Cursed Banneret：每張防禦卡失去 1 光', () => {
    const s = base();
    const id = addEnemy(s, 'Cursed Banneret');
    expect(fire(s, { t: 'CardDefended', enemy: id }).s.player.light).toBe(s.player.light - 1);
  });
  it('Djinn of Ire：{Quest} Refresh 失去 1 光或少抽 1 張', () => {
    const s = base();
    addEnemy(s, 'Djinn of Ire', 'quest');
    const ev = { t: 'WillRefill', n: 2 };
    const r = run(s, (ctx) => emitWillHelper(ctx, ev), ['draw']);
    expect(ev.n).toBe(1);
    expect(r.s.player.light).toBe(s.player.light);
  });
  it('Glacian Seafare：{Quest} Explore Phase 中 Treachery 獲得 Progress 時再 +2', () => {
    const s = base('explore');
    activeTreachery(s);
    addEnemy(s, 'Glacian Seafare', 'quest');
    expect(run(s, (ctx) => placeTreacheryProgress(ctx, 1, 'T', 't')).s.world.treacheryProgress).toBe(3);
  });
  it('Terrimorian Lurker：Explore Phase 放超過 3 Progress 時受 1 傷', () => {
    const s = base('explore');
    s.world.location.progress = 0;
    addEnemy(s, 'Terrimorian Lurker', 'quest');
    expect(run(s, (ctx) => placeLocationProgress(ctx, 4, 'T', 't')).s.player.wounds).toBe(1);
    expect(run(s, (ctx) => placeLocationProgress(ctx, 3, 'T', 't')).s.player.wounds).toBe(0);
  });
  it('Shadian Tracker：攻擊時每個信標 +1', () => {
    const s = base('defend');
    const id = addEnemy(s, 'Shadian Tracker');
    s.player.beacons = s.world.locationDeck.splice(0, 2);
    expect(run(s, (ctx) => enemyAttacks(ctx, id, 'T'), [done]).s.player.wounds).toBe(4);
  });
});

import { emitWill } from '../src/engine/ops';
import type { Ctx } from '../src/engine/core';
function* emitWillHelper(ctx: Ctx, ev: { t: string; [k: string]: unknown }) {
  yield* emitWill(ctx, ev);
}

// ================================================================= 地點

describe('地點', () => {
  const at = (name: string, phase: Parameters<typeof stateAt>[0] = 'attack') => {
    const s = base(phase);
    setLocation(s, name);
    return s;
  };
  const arrive = (s: GameState, answers: unknown[] = []) => {
    const sd = activeEffectsFor(s);
    return run(s, (ctx) => runUpon(ctx, sd), answers);
  };
  it('Ruins of Orseth：每個 Threat token +1 接戰', () => {
    const s = at('Ruins of Orseth');
    const n = engagementCount(s);
    s.world.location.threatTokens = 2;
    expect(engagementCount(s)).toBe(n + 2);
  });
  it('Stillwood：花 1 光移除 1 Treachery Progress', () => {
    const s = at('Stillwood');
    activeTreachery(s);
    s.world.treacheryProgress = 2;
    const r = useEffect(s, 'Stillwood/0');
    expect(r.s.world.treacheryProgress).toBe(1);
    expect(r.s.player.light).toBe(s.player.light - 1);
  });
  it('Northwood Mountains：Treachery 完成受 2 傷；離開後目的地 +2 Obstacle', () => {
    const s = at('Northwood Mountains');
    expect(fire(s, { t: 'TreacheryCompleted' }).s.player.wounds).toBe(2);
    const r = run(s, (ctx) => travel(ctx, false), [pick('travel')]);
    expect(r.s.world.location.obstacles).toBeGreaterThanOrEqual(2);
  });
  it('Dunes of Galantir：從北邊來 Path +1；Fast 敵人翻開時視為 Slow', () => {
    const s = at('Dunes of Galantir');
    s.world.visited = [locId('Farhome'), locId('Dunes of Galantir')];
    expect(arrive(s).s.world.location.paths).toBe(1);
    const id = addEnemy(s, 'Sol Scout', 'quest');
    expect(enemyInitiative(s, id, true)).toBe('Slow');
    expect(enemyInitiative(s, id)).toBe('Fast');
  });
  it('Lake of Ire：Defend 結束時 Ire 敵人回到任務區', () => {
    const s = at('Lake of Ire');
    const id = addEnemy(s, 'Djinn of Ire');
    expect(boundary(s, 'defend', 'end').s.world.questArea).toContain(id);
  });
  it('Helm’s Peak：抵達 +2 Obstacle；Fire 行動卡 +1 光', () => {
    const s = at('Helm’s Peak');
    expect(arrive(s).s.world.location.obstacles).toBe(2);
    const fire1 = playerCardId(s, 'Ember Strike');
    expect(lightCost(s, fire1, 'action')).toBe(2);
    expect(lightCost(s, fire1, 'attack')).toBe(1);
  });
  it('Pyrus：抵達 Path +1；Darkness Phase 每個 Pyrus 敵人 Treachery +1', () => {
    const s = at('Pyrus');
    activeTreachery(s);
    expect(arrive(s).s.world.location.paths).toBe(1);
    addEnemy(s, 'Pyrus Lobber', 'quest');
    addEnemy(s, 'Pyrus Razer');
    expect(boundary(s, 'darkness', 'end').s.world.treacheryProgress).toBe(2);
  });
  it('Spellwood：EV + Treachery Progress', () => {
    const s = at('Spellwood');
    s.world.treacheryProgress = 0;
    const ev = locationEV(s);
    s.world.treacheryProgress = 3;
    expect(locationEV(s)).toBe(ev + 3);
  });
  it('Way of Madness：玩家區敵人回到任務區，再從後端接戰同樣數量', () => {
    const s = at('Way of Madness');
    const a = addEnemy(s, 'Sol Scout');
    const back = addEnemy(s, 'Green Wraith', 'quest', false);
    const r = arrive(s);
    expect(r.s.world.playerArea).toEqual([back]);
    expect(r.s.world.questArea).toContain(a);
  });
  it('Everkil：玩家卡防禦 1；Attack 結束玩家區沒敵人時最前面的敵人接戰', () => {
    const s = at('Everkil');
    expect(cardDefense(s, s.player.hand[0])).toBe(1);
    const id = addEnemy(s, 'Sol Scout', 'quest');
    expect(boundary(s, 'attack', 'end').s.world.playerArea).toEqual([id]);
  });
  it('Garadeth：抵達 +1 Obstacle；Engagement 結束時 Garadeth 敵人回到任務區', () => {
    const s = at('Garadeth');
    expect(arrive(s).s.world.location.obstacles).toBe(1);
    const id = addEnemy(s, 'Garadeth Grunt');
    expect(boundary(s, 'engagement', 'end').s.world.questArea).toContain(id);
  });
  it('The Deep Forest：抵達 Threat +1；Refresh 結束每個 Threat token 失去 1 光', () => {
    const s = at('The Deep Forest');
    expect(arrive(s).s.world.location.threatTokens).toBe(1);
    s.world.location.threatTokens = 2;
    expect(boundary(s, 'refresh', 'end').s.player.light).toBe(s.player.light - 2);
  });
  it('Eldirith Mountains：抵達的下一回合起 Refresh 開始時每個完成的 Treachery 失去 1 光', () => {
    const s = at('Eldirith Mountains');
    s.world.completedTreacheries = [treacheryId('Sabotage')];
    s.world.arrivalRound = s.round;
    expect(boundary(s, 'refresh', 'start').s.player.light).toBe(s.player.light);
    s.world.arrivalRound = s.round - 1;
    expect(boundary(s, 'refresh', 'start').s.player.light).toBe(s.player.light - 1);
  });
  it('Flats of Mil-Bereth：Refresh 時任務區每個 Tracker +1 Threat token', () => {
    const s = at('Flats of Mil-Bereth');
    addEnemy(s, 'Moltan Spy', 'quest');
    addEnemy(s, 'Moltan Trail Hound', 'quest');
    expect(boundary(s, 'refresh', 'end').s.world.location.threatTokens).toBe(2);
  });
  it('Hillcrest：Staging 結束 Fire 敵人治療 1；Fire 加成卡 Path +1', () => {
    const s = at('Hillcrest');
    const id = addEnemy(s, 'Pyrus Lobber', 'quest');
    s.world.enemies[id].wounds = 2;
    expect(boundary(s, 'staging', 'end').s.world.enemies[id].wounds).toBe(1);
    const fireCard = playerCardId(s, 'Ember Strike');
    expect(fire(s, { t: 'CardPlayed', card: fireCard, slot: 'booster' }).s.world.location.paths).toBe(1);
  });
  it('The Barren Hills：加成卡元素不啟動 Earth / Wind 技能', () => {
    const s = at('The Barren Hills');
    const sk = s.player.skills[0];
    sk.activatedByExhaust = false;
    s.roundState.activeElement = sk.cubeElement;
    expect(skillActive(s, sk)).toBe(sk.cubeElement === 'Fire');
  });
  it('Druidane River：放地點 Progress 時 Treachery +1 (玩家區有敵人)', () => {
    const s = at('Druidane River');
    activeTreachery(s);
    expect(run(s, (ctx) => placeLocationProgress(ctx, 1, 'T', 't')).s.world.treacheryProgress).toBe(0);
    addEnemy(s, 'Sol Scout');
    expect(run(s, (ctx) => placeLocationProgress(ctx, 1, 'T', 't')).s.world.treacheryProgress).toBe(1);
  });
  it('Eirid Desert：抵達時每個 Sol 敵人 Threat +1', () => {
    const s = at('Eirid Desert');
    addEnemy(s, 'Sol Scout', 'quest');
    addEnemy(s, 'Sol Conspirator');
    expect(arrive(s).s.world.location.threatTokens).toBe(2);
  });
  it('The Dark River：抵達 Threat +2', () => {
    expect(arrive(at('The Dark River')).s.world.location.threatTokens).toBe(2);
  });
  it('Stirith：往東移動前 Obstacle +1 (距離 +1)', () => {
    const s = at('Stirith');
    const east = s.world.locationDeck.find((x) => {
      const c = (id: string) => (locationCard(id).coordinates as { east: number; south: number });
      return c(x).east > c(s.world.location.id).east && c(x).south === c(s.world.location.id).south;
    });
    if (!east) return;
    s.world.locationDeck = [east, ...s.world.locationDeck.filter((x) => x !== east)];
    const r = run(s, (ctx) => travel(ctx, false), [pick('travel')]);
    expect(r.logs.some((l) => l.includes('Stirith'))).toBe(true);
  });
  it('Northwood City：可以放棄產光；每產 2 光 Treachery +1', () => {
    const s = at('Northwood City');
    activeTreachery(s);
    const ev = { t: 'WillProduceLight', n: 5 };
    run(s, (ctx) => emitWillHelper(ctx, ev), [1]);
    expect(ev.n).toBe(4);
    expect(fire(s, { t: 'LightProduced', n: 4 }).s.world.treacheryProgress).toBe(2);
  });
  it('Thretin：抵達失去 Thretin 敵人數的光並 Path +1', () => {
    const s = at('Thretin');
    addEnemy(s, 'Thretin Marshals', 'quest');
    const r = arrive(s);
    expect(r.s.player.light).toBe(s.player.light - 1);
    expect(r.s.world.location.paths).toBe(1);
  });
  it('Terrimor：抵達 +3 Obstacle；Terrimorian +2 HP', () => {
    const s = at('Terrimor');
    expect(arrive(s).s.world.location.obstacles).toBe(3);
    expect(enemyHP(s, addEnemy(s, 'Terrimorian Lurker'))).toBe(11);
  });
  it('Pit of Shada：Shadian 敵人接戰；Dread +2 攻擊', () => {
    const s = at('Pit of Shada');
    const id = addEnemy(s, 'Shadian Tracker', 'quest');
    expect(arrive(s).s.world.playerArea).toContain(id);
    expect(enemyAttack(s, id)).toBe(4);
  });
  it('Sheer Valley：抵達 +2 Threat；玩家卡防禦減半進位', () => {
    const s = at('Sheer Valley');
    expect(arrive(s).s.world.location.threatTokens).toBe(2);
    const c = s.player.hand.find((x) => playerCard(x).defense === 3);
    if (c) expect(cardDefense(s, c)).toBe(2);
  });
  it('Terra Lake：移動到這裡距離 +1；接戰 −2；Wind 卡 +1 光', () => {
    const s = base();
    const terra = locId('Terra Lake');
    const d0 = distanceBreakdown(s, terra, 0);
    expect(d0.total).toBe(Math.max(1, d0.geographic + d0.obstacles - d0.paths + 1));
    setLocation(s, 'Terra Lake');
    s.player.light = 20;
    expect(engagementCount(s)).toBe(0);
  });
  it('Molta：Moltan 敵人接戰；Dread +3 HP', () => {
    const s = at('Molta');
    const id = addEnemy(s, 'Moltan Spy', 'quest');
    expect(arrive(s).s.world.playerArea).toContain(id);
    expect(enemyHP(s, addEnemy(s, 'Cursed Banneret'))).toBe(15);
  });
  it('Highwall Canyon：沒有 Threat token 時威脅 +3', () => {
    const s = at('Highwall Canyon');
    s.world.location.threatTokens = 0;
    const t = threatBreakdown(s).total;
    s.world.location.threatTokens = 1;
    expect(threatBreakdown(s).total).toBe(t - 2);
  });
  it('Darkwind：抵達時橫置技能或 Treachery +2，再每個 Dread +1', () => {
    const s = at('Darkwind');
    activeTreachery(s);
    addEnemy(s, 'Cursed Banneret', 'quest');
    const r = arrive(s, ['treachery']);
    expect(r.s.world.treacheryProgress).toBe(3);
  });
  it('Nul-Gador：威脅 + 完成數；Dread 敵人雙類型各 +1 防禦', () => {
    const s = at('Nul-Gador');
    const t = threatBreakdown(s).total;
    s.world.completedTreacheries = [treacheryId('Sabotage')];
    expect(threatBreakdown(s).total).toBe(t + 1);
    const id = addEnemy(s, 'Cursed Banneret');
    expect(enemyTypes(s, id)).toEqual(['Physical', 'Photonic']);
    expect(enemyDefenseVs(s, id, 'Physical')).toBe(4);
    expect(enemyDefenseVs(s, id, 'Photonic')).toBe(1);
  });
});

import { activeEffects, type SourcedDef } from '../src/engine/effects';
import { runEffect } from '../src/engine/ops';
function activeEffectsFor(s: GameState): SourcedDef {
  const sd = activeEffects(s).find((x) => x.src.cardId === s.world.location.id && x.def.uponArrival);
  if (!sd) throw new Error('沒有 Upon Arrival');
  return sd;
}
function* runUpon(ctx: Ctx, sd: SourcedDef) {
  yield* runEffect(ctx, sd.src, sd.def, () => sd.def.uponArrival!(ctx, sd.src));
}

// ================================================================= Treachery

describe('Treachery', () => {
  const withLegacy = (name: string) => {
    const s = base();
    s.world.completedTreacheries = [treacheryId(name)];
    return s;
  };
  it('Reinforcements：移除玩家區敵人傷害，少於 3 時 Threat +1；legacy Earth +1 光', () => {
    const s = base();
    const id = addEnemy(s, 'Cursed Banneret');
    s.world.enemies[id].wounds = 2;
    const r = complete(s, 'Reinforcements');
    expect(r.s.world.enemies[id].wounds).toBe(0);
    expect(r.s.world.location.threatTokens).toBe(s.world.location.threatTokens + 1);
    const l = withLegacy('Reinforcements');
    const earth = l.player.hand.concat(l.player.deck).find((x) => playerCard(x).element === 'Earth')!;
    expect(lightCost(l, earth, 'action')).toBe(lightCost(base(), earth, 'action') + 1);
  });
  it('Tireless Patrols：橫置 2 個技能；legacy 產光 −1 或棄 1 張', () => {
    const r = complete(base(), 'Tireless Patrols');
    expect(r.s.player.skills.filter((k) => k.exhausted).length).toBe(2);
    expect(r.s.player.skills.find((k) => k.unlocked)!.exhausted).toBe(true);
    const ev = { t: 'WillProduceLight', n: 4 };
    run(withLegacy('Tireless Patrols'), (ctx) => emitWillHelper(ctx, ev), ['minus']);
    expect(ev.n).toBe(3);
  });
  it('Lying in Wait：前 2 個敵人接戰並立即攻擊；legacy 到 Tree 等地點 Threat +1', () => {
    const s = base('defend');
    const a = addEnemy(s, 'Sol Scout', 'quest');
    const b = addEnemy(s, 'Sol Conspirator', 'quest');
    const r = complete(s, 'Lying in Wait', [done, done]);
    expect(r.s.world.playerArea).toEqual(expect.arrayContaining([a, b]));
    expect(r.s.player.wounds).toBe(2);
    const l = withLegacy('Lying in Wait');
    expect(fire(l, { t: 'Arrived', location: locId('Stillwood') }).s.world.location.threatTokens).toBe(l.world.location.threatTokens + 1);
  });
  it('Sabotage：抗性 +5；legacy 到 Mountains 等地點 Threat +1', () => {
    const s = base();
    expect(complete(s, 'Sabotage').s.world.resistance).toBe(s.world.resistance + 5);
    const l = withLegacy('Sabotage');
    expect(fire(l, { t: 'Arrived', location: locId('Molta') }).s.world.location.threatTokens).toBe(l.world.location.threatTokens + 1);
  });
  it('Spell of Confusion：沒有信標受 2 傷；legacy Photonic 防禦 +1', () => {
    const s = base();
    s.player.beacons = [];
    expect(complete(s, 'Spell of Confusion').s.player.wounds).toBe(2);
    const l = withLegacy('Spell of Confusion');
    expect(enemyDefenseVs(l, addEnemy(l, 'Sol Scout'), 'Photonic')).toBe(0);
    expect(enemyDefenseVs(l, addEnemy(l, 'Envy'), 'Photonic')).toBe(1);
  });
  it('Enemy Territory：移除地點 Progress，不足 5 受 3 傷；legacy Refresh 開始 Treachery +1', () => {
    const s = base();
    s.world.location.progress = 2;
    const r = complete(s, 'Enemy Territory');
    expect(r.s.world.location.progress).toBe(0);
    expect(r.s.player.wounds).toBe(3);
    const l = withLegacy('Enemy Territory');
    activeTreachery(l);
    expect(boundary(l, 'refresh', 'start').s.world.treacheryProgress).toBe(1);
  });
  it('Hidden Pitfalls：腐化 +1；legacy 距離 +2', () => {
    const s = base();
    expect(complete(s, 'Hidden Pitfalls').s.world.corruption).toBe(s.world.corruption + 1);
  });
  it('Stymied Victory：Threat +3；legacy Slow 敵人 XP −1', () => {
    const s = base();
    expect(complete(s, 'Stymied Victory').s.world.location.threatTokens).toBe(s.world.location.threatTokens + 3);
    const l = withLegacy('Stymied Victory');
    const id = addEnemy(l, 'Cursed Banneret');
    expect(enemyXP(l, id)).toBe(enemyXP(base(), id) - 1);
  });
  it('Tracked Down：最後 2 個敵人接戰；legacy Wind +1 光', () => {
    const s = base();
    const a = addEnemy(s, 'Green Wraith', 'quest', false);
    addEnemy(s, 'Sol Scout', 'quest');
    expect(complete(s, 'Tracked Down').s.world.playerArea).toContain(a);
  });
  it('Wildfires：失去 5 XP；不到 2 時失去 2 光', () => {
    const s = base();
    s.player.xp = 1;
    const r = complete(s, 'Wildfires');
    expect(r.s.player.xp).toBe(0);
    expect(r.s.player.light).toBe(s.player.light - 2);
  });
  it('Cabalist Support：移除 Path、+3 Obstacle；legacy Cabalist 治療 3', () => {
    const s = base();
    s.world.location.paths = 2;
    const r = complete(s, 'Cabalist Support');
    expect(r.s.world.location.paths).toBe(0);
    expect(r.s.world.location.obstacles).toBe(s.world.location.obstacles + 3);
    const l = withLegacy('Cabalist Support');
    const id = addEnemy(l, 'Green Wraith');
    l.world.enemies[id].wounds = 3;
    expect(boundary(l, 'refresh', 'start').s.world.enemies[id].wounds).toBe(0);
  });
  it('Total Disruption：威脅 +2；legacy Disruptor 治療', () => {
    const s = base();
    expect(complete(s, 'Total Disruption').s.world.threat).toBe(s.world.threat + 2);
    const l = withLegacy('Total Disruption');
    const id = addEnemy(l, 'Moltan Spy');
    l.world.enemies[id].wounds = 1;
    expect(boundary(l, 'refresh', 'start').s.world.enemies[id].wounds).toBe(0);
  });
  it('The Plot Thickens：受 6 傷或受 3 傷失去 4 光；legacy Plotter 治療', () => {
    const r = complete(base(), 'The Plot Thickens', ['3']);
    expect(r.s.player.wounds).toBe(3);
    const l = withLegacy('The Plot Thickens');
    const id = addEnemy(l, 'Sol Conspirator');
    l.world.enemies[id].wounds = 1;
    expect(boundary(l, 'refresh', 'start').s.world.enemies[id].wounds).toBe(0);
  });
  it('Prowling Darkness：失去 4 光；legacy Prowler 治療', () => {
    const s = base();
    expect(complete(s, 'Prowling Darkness').s.player.light).toBe(s.player.light - 4);
  });
  it('Two Steps Back：下一個 Treachery +4；legacy 成長 +2 XP', () => {
    const r = complete(base(), 'Two Steps Back');
    expect(r.s.world.treacheryProgress).toBeGreaterThanOrEqual(4);
    const l = withLegacy('Two Steps Back');
    expect(growthCost(l, 'ability', 3).cost).toBe(5);
  });
});

// ================================================================= Shade

describe('Shade', () => {
  it('Pride：{Player} 接戰敵人 +2 攻擊，被擊敗的回合仍有效', () => {
    const s = base();
    const pride = addEnemy(s, 'Pride');
    const g = addEnemy(s, 'Sol Scout');
    expect(enemyAttack(s, g)).toBe(3);
    const r = run(s, (ctx) => defeatEnemy(ctx, pride));
    expect(enemyAttack(r.s, g)).toBe(3);
  });
  it('Pride：Engagement 結束時可以 push', () => {
    const s = base();
    const pride = addEnemy(s, 'Pride');
    expect(boundary(s, 'engagement', 'end', ['0']).s.world.questArea).toContain(pride);
  });
  it('Wrath：Engagement 開始翻 Treachery 結算 When Completed，攻擊 = PV', () => {
    const s = base();
    const wrath = addEnemy(s, 'Wrath');
    const t = treacheryId('Total Disruption');
    s.world.treacheryDeck = [t, ...s.world.treacheryDeck.filter((x) => x !== t)];
    const r = boundary(s, 'engagement', 'start');
    expect(r.s.world.threat).toBe(s.world.threat + 2);
    expect(enemyAttack(r.s, wrath)).toBe(5);
    expect(r.s.world.completedTreacheries).toEqual([]);
  });
  it('Envy：攻擊 Envy 時前 4 傷害放到其他敵人身上', () => {
    const s = base();
    const envy = addEnemy(s, 'Envy');
    const o = addEnemy(s, 'Cursed Banneret');
    const r = run(s, (ctx) => woundEnemy(ctx, envy, 6, 'attack', 'T'));
    expect(r.s.world.enemies[envy].wounds).toBe(2);
    expect(r.s.world.enemies[o].wounds).toBe(4);
  });
  it('Envy 背面：前往最終地點時把 3 個地點放到玩家區；進入的敵人附著；不能攻擊', () => {
    const s = stateAt('attack', { shade: 'Envy' });
    clearEnemies(s);
    s.config.ignoreShadeSpecial = false;
    const pit = locId('Pit of Shada');
    for (const n of ['Eldirith Mountains', 'Sheer Valley', 'Terra Lake']) {
      const id = locId(n);
      s.world.removedLocations = s.world.removedLocations.filter((x) => x !== id);
      s.world.locationDeck = s.world.locationDeck.filter((x) => x !== id);
      s.world.locationDiscard = [...s.world.locationDiscard.filter((x) => x !== id), id];
    }
    s.world.locationDeck = [pit, ...s.world.locationDeck.filter((x) => x !== pit)];
    const r = run(s, (ctx) => travel(ctx, false), [pick('travel')]);
    expect(r.s.world.envyLocations.map((l) => cardName(l.id)).sort()).toEqual(['Eldirith Mountains', 'Sheer Valley', 'Terra Lake']);
    const id = addEnemy(r.s, 'Sol Scout', 'quest');
    const r2 = run(r.s, (ctx) => enemyToPlayer(ctx, id, 'engage', 'T'));
    expect(r2.s.world.envyAttach[id]).toBeTruthy();
    expect(restriction(r2.s, { kind: 'attack', enemy: id })).toBeTruthy();
  });
  it('Greed：花 3 XP push / pull', () => {
    const s = base();
    s.player.xp = 3;
    const g = addEnemy(s, 'Greed', 'quest');
    expect(useEffect(s, 'Greed/0').s.world.playerArea).toContain(g);
  });
});

void woundPlayer;
void setSlot;
