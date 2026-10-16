// 地點效果 (EE-07：目前地點有效；最終地點橫置後仍有效 FL-04)。
import { cardTraits } from '../calc';
import { defineCard } from '../effects';
import {
  addObstacle,
  addPath,
  chooseNegative,
  enemyToPlayer,
  gainLight,
  loseLight,
  loseXP,
  placeTreacheryProgress,
} from '../ops';
import { lightMax } from '../tracks';

defineCard('Farhome', [
  {
    key: 'Farhome/0',
    label: '免費光 (本回合花光時少付 1)',
    rule: 'EE-23',
    // EE-23 免費光：讓 P2-05 的「付得起」多 1；花光時可以少付 1
    modify: (_s, _src, q, v) => (q.stat === 'freeLight' ? v + 1 : v),
    active: {
      available: (s) =>
        s.roundState.freeLightUsed ? '本回合已使用' : s.roundState.lightSpent < 1 ? '本回合還沒有花光' : s.player.light >= lightMax(s) ? '光已滿' : null,
      run: function* (ctx) {
        ctx.s.roundState.freeLightUsed = true;
        yield* gainLight(ctx, 1, 'EE-23', 'Farhome 免費光 (少付 1)');
      },
    },
  },
]);

defineCard('Sol', [
  {
    key: 'Sol/0',
    label: 'Staging 結束時任務區的 Sol 敵人接戰',
    phaseEnd: {
      phase: 'staging',
      mandatory: true,
      run: function* (ctx) {
        const sols = ctx.s.world.questArea.filter((id) => cardTraits(ctx.s, id).includes('Sol')).reverse();
        if (!sols.length) ctx.log('KC-12a', 'Sol：任務區沒有 Sol 敵人');
        for (const id of sols) yield* enemyToPlayer(ctx, id, 'engage', 'KC-03');
      },
    },
  },
  {
    key: 'Sol/1',
    label: 'Refresh Phase：Path +1',
    phaseDuring: { phase: 'refresh', run: (ctx) => addPath(ctx, 1, 'EE-18a', 'Sol') },
  },
]);

defineCard('Wrath Marshes', [
  {
    key: 'Wrath Marshes/0',
    label: '抵達時：失去 2 XP 或 2 光',
    uponArrival: function* (ctx) {
      const p = ctx.s.player;
      yield* chooseNegative(ctx, 'KC-12f', 'Wrath Marshes', [
        { id: 'xp', label: '失去 2 XP', resolvable: p.xp >= 2 ? 'full' : p.xp > 0 ? 'partial' : 'none', run: () => loseXP(ctx, 2, 'T5', 'Wrath Marshes') },
        { id: 'light', label: '失去 2 光', resolvable: p.light >= 2 ? 'full' : p.light > 0 ? 'partial' : 'none', run: () => loseLight(ctx, 2, 'T5', 'Wrath Marshes') },
      ]);
    },
  },
  {
    key: 'Wrath Marshes/1',
    label: 'Wraith 敵人攻擊時 Treachery +2 Progress',
    trigger: {
      event: 'EnemyAttacks',
      timing: 'when',
      mandatory: true,
      filter: (s, _src, ev) => cardTraits(s, ev.enemy as string).includes('Wraith'),
      run: (ctx) => placeTreacheryProgress(ctx, 2, 'EE-09', 'Wrath Marshes'),
    },
  },
]);

defineCard('Flaming Headwaters', [
  {
    key: 'Flaming Headwaters/0',
    label: 'Defend Phase 中每個敵人 +2 攻擊',
    modify: (_s, _src, q, v) => (q.stat === 'enemyAttack' && q.phase === 'defend' ? v + 2 : v),
  },
]);

defineCard('Wilderforth', [
  {
    key: 'Wilderforth/0',
    label: '抵達時：Obstacle +1；攻擊為 Photonic 時 Treachery +2 Progress',
    uponArrival: function* (ctx) {
      yield* addObstacle(ctx, 1, 'T5', 'Wilderforth');
      if (ctx.s.roundState.attackType === 'Photonic') yield* placeTreacheryProgress(ctx, 2, 'T5', 'Wilderforth');
    },
  },
]);

defineCard('Ruins of Crowbridge', [
  {
    key: 'Ruins of Crowbridge/0',
    label: 'Darkness Phase：任務區每個敵人 Treachery +1 Progress',
    phaseDuring: {
      phase: 'darkness',
      run: (ctx) => placeTreacheryProgress(ctx, ctx.s.world.questArea.length, 'EE-18a', 'Ruins of Crowbridge'),
    },
  },
  {
    key: 'Ruins of Crowbridge/1',
    label: 'Dread 敵人 +2 Darkness',
    modify: (s, _src, q, v) => (q.stat === 'enemyDarkness' && q.enemy && cardTraits(s, q.enemy).includes('Dread') ? v + 2 : v),
  },
]);
