// Temperance：卡片 (基礎面 / 進階面 `+`) 與技能。
// 特殊規則：技能文字中「Trait:」後面的部分，只在行動卡有該特質時結算 (actionHas)。
import { enemyDarkness, enemyInitiative } from '../calc';
import { cardName } from '../data';
import { defineCard, defineLingering, defineSkill } from '../effects';
import {
  addLingering,
  addObstacle,
  advanceThreat,
  chooseEnemies,
  chooseEnemy,
  chooseExhaustSkill,
  chooseHandCards,
  dealSelfWound,
  discardPlayerCard,
  disarm,
  distribute,
  gainLight,
  gainXP,
  loseLight,
  mill,
  placeTreacheryProgress,
  push,
  removeLocationProgress,
  removeTreacheryProgress,
  revealEnemy,
  scout,
  spendLight,
  spendXP,
  woundEnemy,
} from '../ops';
import { checkExplored } from '../world';
import { actionHas, attackOrExploreHas, playerEnemies, roundMod } from './util';
import type { Ctx, Gen } from '../core';
import type { Source } from '../effects';

/** Mandatory1x Start of Refresh Phase：攻擊卡或探索卡有某特質時的負面效果 */
function refreshPenalty(key: string, trait: string, label: string, run: (ctx: Ctx, src: Source) => Gen) {
  return {
    key,
    label: `Refresh 開始：攻擊卡或探索卡有 ${trait} 時${label}`,
    type: 'Mandatory1x' as const,
    phaseStart: {
      phase: 'refresh' as const,
      mandatory: true,
      run: function* (ctx: Ctx, src: Source) {
        if (!attackOrExploreHas(ctx.s, trait)) {
          ctx.log('KC-12a', `${src.name}：攻擊卡與探索卡都沒有 ${trait}`);
          return;
        }
        yield* run(ctx, src);
      },
    },
  };
}

/** 本回合第一次成長的折扣 (At All Costs) */
function* threatForGrowth(ctx: Ctx, max: number, per: number, excess?: number): Gen {
  const n = yield* ctx.chooseNumber('KC-11', `At All Costs：威脅軌道前進幾格？(每格成長 −${per} XP)`, 0, max);
  if (!n) return;
  yield* advanceThreat(ctx, n, 'KC-11', 'At All Costs');
  if (ctx.s.roundState.flags.grown) {
    ctx.log('KC-11', 'At All Costs：本回合已經成長過，折扣無效');
    return;
  }
  ctx.s.roundState.growthDiscounts.push({ track: 'any', kind: 'minus', value: n * per, excessToXP: excess, sourceName: 'At All Costs' });
  ctx.log('KC-11', `At All Costs：本回合第一次成長 −${n * per} XP`);
}

// ---------------------------------------------------------------- Unfettered Resolve

defineCard('Unfettered Resolve', [
  {
    key: 'Unfettered Resolve/0',
    label: '忽略 1 個敵人的效果 (本回合)',
    type: '1x',
    active: {
      run: function* (ctx) {
        const s = ctx.s;
        const id = yield* chooseEnemy(ctx, 'KC-11', 'Unfettered Resolve：忽略哪個敵人的效果？', [...s.world.questArea, ...s.world.playerArea]);
        if (!id) return;
        s.roundState.ignoredEnemies.push(id);
        ctx.log('EE-06', `本回合忽略 ${cardName(id)} 的效果`);
      },
    },
  },
  {
    key: 'Unfettered Resolve/1',
    label: '攻擊卡或探索卡是 reckless 時，擊敗敵人少得 1 XP',
    type: 'Passive',
    modify: (s, _src, q, v) => (q.stat === 'enemyXP' && attackOrExploreHas(s, 'Reckless') ? v - 1 : v),
  },
]);

defineCard('Unfettered Resolve+', [
  {
    key: 'Unfettered Resolve+/0',
    label: '至少 3 XP：本階段忽略任務區最多 5 Darkness',
    type: '1x',
    active: {
      phases: ['darkness'],
      available: (s) => (s.player.xp < 3 ? '需要至少 3 XP' : null),
      run: function* (ctx, src) {
        roundMod(ctx, src, 'ignoreDarkness', 5);
      },
    },
  },
  refreshPenalty('Unfettered Resolve+/1', 'Fatigued', 'Mill 1', function* (ctx) {
    yield* mill(ctx, 1, 'KC-12a', 'Unfettered Resolve');
  }),
]);

// ---------------------------------------------------------------- Controlled Disruption

defineCard('Controlled Disruption', [
  {
    key: 'Controlled Disruption/0',
    label: '翻新的 Treachery 時抽 3 張選 1 張，其他 cycle',
    type: '1x',
    trigger: {
      event: 'WillRevealTreachery',
      timing: 'will',
      mandatory: false,
      run: function* (_ctx, _src, ev) {
        ev.draw = 3;
      },
    },
  },
  refreshPenalty('Controlled Disruption/1', 'Hopeless', '失去 1 光', (ctx) => loseLight(ctx, 1, 'KC-12a', 'Controlled Disruption')),
]);

defineCard('Controlled Disruption+', [
  {
    key: 'Controlled Disruption+/0',
    label: '可以花 1 XP 移除 Treachery 所有 Progress；移除至少 4 個時得 2 光',
    type: '1x',
    active: {
      available: (s) => (s.player.xp < 1 ? '需要 1 XP' : null),
      run: function* (ctx) {
        yield* spendXP(ctx, 1, 'KC-11', 'Controlled Disruption');
        const n = yield* removeTreacheryProgress(ctx, ctx.s.world.treacheryProgress, 'KC-11', 'Controlled Disruption');
        if (n >= 4) yield* gainLight(ctx, 2, 'KC-11', 'Controlled Disruption');
      },
    },
  },
  refreshPenalty('Controlled Disruption+/1', 'Hopeless', '受 1 傷', (ctx) => dealSelfWound(ctx, 1, 'KC-24', 'Controlled Disruption')),
]);

// ---------------------------------------------------------------- Calculated Risk

defineLingering({
  key: 'Calculated Risk/discard',
  label: '補完手牌後棄 1 張',
  trigger: {
    event: 'HandRefilled',
    timing: 'when',
    mandatory: true,
    run: function* (ctx) {
      const [c] = yield* chooseHandCards(ctx, 'KC-12a', 'Calculated Risk：棄 1 張手牌', 1, 1);
      if (c) yield* discardPlayerCard(ctx, c, 'hand', 'KC-12a');
    },
  },
});

defineCard('Calculated Risk', [
  {
    key: 'Calculated Risk/0',
    label: 'Treachery 完成後得 3 XP',
    type: 'MandatoryUnrestricted',
    trigger: { event: 'TreacheryCompleted', timing: 'after', mandatory: true, run: (ctx) => gainXP(ctx, 3, 'KC-11', 'Calculated Risk') },
  },
  refreshPenalty('Calculated Risk/1', 'Fatigued', '補完手牌後棄 1 張', function* (ctx, src) {
    addLingering(ctx, 'Calculated Risk/discard', src);
  }),
]);

defineCard('Calculated Risk+', [
  {
    key: 'Calculated Risk+/0',
    label: '成長時每個信標可以當 3 XP 使用',
    type: 'Passive',
    modify: (_s, _src, q, v) => (q.stat === 'flag' && q.flag === 'beaconsAsXP' ? v + 1 : v),
  },
  refreshPenalty('Calculated Risk+/1', 'Lost', '移除地點所有 Progress', function* (ctx) {
    yield* removeLocationProgress(ctx, ctx.s.world.location.progress, 'KC-12a', 'Calculated Risk');
    yield* checkExplored(ctx);
  }),
]);

// ---------------------------------------------------------------- At All Costs

defineCard('At All Costs', [
  {
    key: 'At All Costs/0',
    label: '威脅軌道前進最多 2 格，本回合第一次成長每格 −2 XP',
    type: '1x',
    active: { run: (ctx) => threatForGrowth(ctx, 2, 2) },
  },
  {
    key: 'At All Costs/1',
    label: 'Refresh：玩家區至少有 1 個敵人時 Treachery +3 Progress',
    type: 'Mandatory1x',
    phaseStart: {
      phase: 'refresh',
      mandatory: true,
      run: function* (ctx) {
        if (ctx.s.world.playerArea.length) yield* placeTreacheryProgress(ctx, 3, 'KC-12a', 'At All Costs');
      },
    },
  },
]);

defineCard('At All Costs+', [
  {
    key: 'At All Costs+/0',
    label: '威脅軌道前進最多 3 格，本回合第一次成長每格 −3 XP；低於 0 的部分換成 XP (最多 4)',
    type: '1x',
    active: { run: (ctx) => threatForGrowth(ctx, 3, 3, 4) },
  },
  {
    key: 'At All Costs+/1',
    label: 'Refresh：玩家區至少有 1 個敵人時 Obstacle +2',
    type: 'Mandatory1x',
    phaseStart: {
      phase: 'refresh',
      mandatory: true,
      run: function* (ctx) {
        if (ctx.s.world.playerArea.length) yield* addObstacle(ctx, 2, 'KC-12a', 'At All Costs');
      },
    },
  },
]);

// ---------------------------------------------------------------- Equilibrium

/** 行動卡讓某一欄技能本回合視為鎖定 */
function lockColumn(ctx: Ctx, column: number, why: string): void {
  const names = ctx.s.player.skills.filter((k) => k.mat === 'luminary' && k.column === column).map((k) => k.name);
  ctx.s.roundState.skillMods.locked.push(...names);
  ctx.log('EE-06', `${why}：本回合 ${names.join('、')} 視為鎖定`);
}

defineCard('Equilibrium', [
  {
    key: 'Equilibrium/0',
    label: '付 1 光得 1 XP，或付 2 光得 3 XP',
    type: '1x',
    active: {
      phases: ['refresh'],
      available: (s) => (s.player.light < 1 ? '光不足' : null),
      run: function* (ctx) {
        const pick = yield* ctx.choose('KC-11', 'Equilibrium', [
          { id: '1', label: '付 1 光：+1 XP' },
          { id: '2', label: '付 2 光：+3 XP', legal: ctx.s.player.light >= 2 },
        ]);
        yield* spendLight(ctx, Number(pick), 'KC-11', 'Equilibrium');
        yield* gainXP(ctx, pick === '1' ? 1 : 3, 'KC-11', 'Equilibrium');
      },
    },
  },
  {
    key: 'Equilibrium/1',
    label: 'Action Set 結束：攻擊卡或探索卡是 complacent 時，最左欄技能本回合視為鎖定',
    type: 'Mandatory1x',
    phaseEnd: {
      phase: 'actionSet',
      mandatory: true,
      run: function* (ctx) {
        if (attackOrExploreHas(ctx.s, 'Complacent')) lockColumn(ctx, 0, 'Equilibrium');
      },
    },
  },
]);

defineCard('Equilibrium+', [
  {
    key: 'Equilibrium+/0',
    label: 'Action Set 結束：翻 1 個 Dusk 敵人；本回合下一次成長只要 1 XP',
    type: '1x',
    phaseEnd: {
      phase: 'actionSet',
      mandatory: false,
      run: function* (ctx) {
        yield* revealEnemy(ctx, 'Dusk', 'KC-11');
        ctx.s.roundState.growthDiscounts.push({ track: 'any', kind: 'setTo', value: 1, sourceName: 'Equilibrium' });
        ctx.log('KC-11', 'Equilibrium：本回合下一次成長只要 1 XP');
      },
    },
  },
  {
    key: 'Equilibrium+/1',
    label: 'Action Set 結束：攻擊卡或探索卡是 reckless 時，第二欄技能本回合視為鎖定',
    type: 'Mandatory1x',
    phaseEnd: {
      phase: 'actionSet',
      mandatory: true,
      run: function* (ctx) {
        if (attackOrExploreHas(ctx.s, 'Reckless')) lockColumn(ctx, 1, 'Equilibrium');
      },
    },
  },
]);

// ---------------------------------------------------------------- Firm Footing

defineCard('Firm Footing', [
  {
    key: 'Firm Footing/0',
    label: '至少 5 XP 時得 4 光',
    type: '1x',
    active: {
      phases: ['refresh'],
      available: (s) => (s.player.xp < 5 ? '需要至少 5 XP' : null),
      run: (ctx) => gainLight(ctx, 4, 'KC-11', 'Firm Footing'),
    },
  },
  refreshPenalty('Firm Footing/1', 'Lost', '移除地點 4 Progress', function* (ctx) {
    yield* removeLocationProgress(ctx, 4, 'KC-12a', 'Firm Footing');
    yield* checkExplored(ctx);
  }),
]);

defineCard('Firm Footing+', [
  {
    key: 'Firm Footing+/0',
    label: '每 2 XP Disarm 1 個敵人；至少 7 XP 時也移除 Treachery 所有 Progress',
    type: '1x',
    active: {
      run: function* (ctx) {
        const s = ctx.s;
        const n = Math.floor(s.player.xp / 2);
        const ids = yield* chooseEnemies(ctx, 'KC-11', `Firm Footing：Disarm 最多 ${n} 個敵人`, playerEnemies(s), 0, n);
        for (const id of ids) disarm(ctx, id, 'KC-11');
        if (s.player.xp >= 7) yield* removeTreacheryProgress(ctx, s.world.treacheryProgress, 'KC-11', 'Firm Footing');
      },
    },
  },
  refreshPenalty('Firm Footing+/1', 'Lost', '橫置 1 個技能', function* (ctx) {
    yield* chooseExhaustSkill(ctx, 'KC-12a', 'Firm Footing：橫置 1 個技能');
  }),
]);

// ---------------------------------------------------------------- 技能

defineSkill('Resist', [
  {
    key: 'Resist',
    label: '每 2 XP 給卡片 +1 防禦 (最多 +5)。Tireless：移除 Treachery 3 Progress',
    type: '1x',
    active: {
      run: function* (ctx, src) {
        const s = ctx.s;
        const n = Math.min(5, Math.floor(s.player.xp / 2));
        const dist = yield* distribute(ctx, 'KC-18', 'Resist：+1 防禦給哪張卡', s.player.hand.slice(), n);
        for (const [card, k] of Object.entries(dist)) roundMod(ctx, src, 'cardDefense', k, { card });
        if (actionHas(s, 'Tireless')) yield* removeTreacheryProgress(ctx, 3, 'KC-18', 'Resist (Tireless)');
      },
    },
  },
]);

defineSkill('Repel', [
  {
    key: 'Repel',
    label: 'Push 1 個敵人。Ranged：對任務區 1 個 Slow 敵人造成等於被推敵人 Darkness 的傷害',
    type: '1x',
    active: {
      phases: ['engagement'],
      run: function* (ctx) {
        const s = ctx.s;
        const id = yield* chooseEnemy(ctx, 'KC-04', 'Repel：Push 1 個敵人', playerEnemies(s));
        if (!id) return;
        yield* push(ctx, id, 'KC-04');
        if (!actionHas(s, 'Ranged') || !s.world.enemies[id]) return;
        const d = enemyDarkness(s, id);
        const slow = s.world.questArea.filter((e) => enemyInitiative(s, e) === 'Slow');
        const t = yield* chooseEnemy(ctx, 'KC-25', `Repel (Ranged)：${d} 傷害給哪個 Slow 敵人？`, slow);
        if (t) yield* woundEnemy(ctx, t, d, 'direct', 'KC-25');
      },
    },
  },
]);

defineSkill('Brightsword', [
  {
    key: 'Brightsword',
    label: 'Attack 開始：每 2 XP MainAttack +1 (Fire：每 1 XP)，最多 +10',
    type: '1x',
    phaseStart: {
      phase: 'attack',
      mandatory: false,
      run: function* (ctx, src) {
        const xp = ctx.s.player.xp;
        roundMod(ctx, src, 'mainAttack', Math.min(10, actionHas(ctx.s, 'Fire') ? xp : Math.floor(xp / 2)));
      },
    },
  },
]);

defineSkill('Reflection', [
  {
    key: 'Reflection',
    label: '至少 4 XP：Scout 1 張地點、敵人或 Treachery。Ice：可以 cycle',
    type: '1x',
    active: {
      available: (s) => (s.player.xp < 4 ? '需要至少 4 XP' : null),
      run: function* (ctx) {
        const w = ctx.s.world;
        const decks: Record<string, string[]> = { location: w.locationDeck, dusk: w.duskDeck, doom: w.doomDeck, treachery: w.treacheryDeck };
        const which = yield* ctx.choose('KC-18', 'Reflection：Scout 哪個牌庫？', [
          { id: 'location', label: '地點牌庫', legal: w.locationDeck.length > 0 },
          { id: 'dusk', label: 'Dusk 牌庫', legal: w.duskDeck.length > 0 },
          { id: 'doom', label: 'Doom 牌庫', legal: w.doomDeck.length > 0 },
          { id: 'treachery', label: 'Treachery 牌庫', legal: w.treacheryDeck.length > 0 },
        ]);
        const deck = decks[which];
        const [top] = scout(ctx, deck, 1, 'KC-18', which);
        if (!top || !actionHas(ctx.s, 'Ice')) return;
        const c = yield* ctx.choose('KC-18', `Reflection (Ice)：cycle ${cardName(top)}？`, [
          { id: 'keep', label: '留在頂端' },
          { id: 'cycle', label: '放到底部' },
        ]);
        if (c === 'cycle') {
          deck.push(deck.shift()!);
          ctx.log('KC-30', `Cycle ${cardName(top)}`);
        }
      },
    },
  },
]);

defineSkill('Discipline', [
  {
    key: 'Discipline',
    label: '每 2 XP 忽略任務區 1 Darkness (Alert：每 1 XP)',
    type: '1x',
    active: {
      run: function* (ctx, src) {
        const xp = ctx.s.player.xp;
        roundMod(ctx, src, 'ignoreDarkness', actionHas(ctx.s, 'Alert') ? xp : Math.floor(xp / 2));
      },
    },
  },
]);
