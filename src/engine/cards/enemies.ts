// 敵人效果 (KC-12d：{Quest}/{Player} 標示的部分只在該區生效)。
import { enemyCard } from '../data';
import { defineCard } from '../effects';
import {
  chooseNegative,
  dealSelfWound,
  enemyToPlayer,
  loseLight,
  placeTreacheryProgress,
  removeLocationProgress,
} from '../ops';
import { checkExplored } from '../world';
import type { GameState } from '../types';

const inPlay = (s: GameState) => [...s.world.questArea, ...s.world.playerArea];
const self = (src: { cardId?: string }, id?: string) => !!id && id === src.cardId;

defineCard('Moltan Spy', [
  {
    key: 'Moltan Spy/0',
    label: '移除地點 X Progress，或 Treachery +X Progress',
    whenRevealed: function* (ctx) {
      const s = ctx.s;
      // X = 在場的 Disruptor 敵人數 (含自己)；KC-05a 為 0 時 X = 1
      const x = Math.max(1, inPlay(s).filter((id) => enemyCard(id).faction === 'Disruptor').length);
      const prog = s.world.location.progress;
      yield* chooseNegative(ctx, 'KC-12f', `Moltan Spy (X = ${x})`, [
        {
          id: 'location',
          label: `移除地點 ${x} Progress`,
          resolvable: prog >= x ? 'full' : prog > 0 ? 'partial' : 'none',
          run: function* () {
            yield* removeLocationProgress(ctx, x, 'KC-30', 'Moltan Spy');
            yield* checkExplored(ctx);
          },
        },
        {
          id: 'treachery',
          label: `Treachery +${x} Progress`,
          resolvable: s.world.activeTreachery ? 'full' : 'none',
          run: () => placeTreacheryProgress(ctx, x, 'KC-30', 'Moltan Spy'),
        },
      ]);
    },
  },
]);

defineCard('Moltan Spellcaster', [
  {
    key: 'Moltan Spellcaster/0',
    label: '移除地點 2 Progress 或受 1 傷',
    phaseEnd: {
      phase: 'explore',
      mandatory: true,
      run: function* (ctx) {
        const prog = ctx.s.world.location.progress;
        yield* chooseNegative(ctx, 'KC-12f', 'Moltan Spellcaster', [
          {
            id: 'location',
            label: '移除地點 2 Progress',
            resolvable: prog >= 2 ? 'full' : prog > 0 ? 'partial' : 'none',
            run: function* () {
              yield* removeLocationProgress(ctx, 2, 'KC-12a', 'Moltan Spellcaster');
              yield* checkExplored(ctx);
            },
          },
          { id: 'wound', label: '受 1 傷', resolvable: 'full', run: () => dealSelfWound(ctx, 1, 'KC-24', 'Moltan Spellcaster') },
        ]);
      },
    },
  },
]);

defineCard('Sol Conspirator', [
  {
    key: 'Sol Conspirator/0',
    label: 'Attack Phase 結束：Treachery +1 Progress',
    phaseEnd: { phase: 'attack', mandatory: true, run: (ctx) => placeTreacheryProgress(ctx, 1, 'KC-12a', 'Sol Conspirator') },
  },
]);

defineCard('Garadeth Grunt', [
  {
    key: 'Garadeth Grunt/0',
    label: '+X HP (X = 已完成 Treachery 數)',
    modify: (s, src, q, v) => (q.stat === 'enemyHP' && self(src, q.enemy) ? v + s.world.completedTreacheries.length : v),
  },
]);

defineCard('Terragard Watchman', [
  {
    key: 'Terragard Watchman/0',
    label: '探索地點後，受到等於 Treachery Progress 的傷害',
    zone: 'quest',
    trigger: {
      event: 'LocationExplored',
      timing: 'after',
      mandatory: true,
      run: (ctx) => dealSelfWound(ctx, ctx.s.world.treacheryProgress, 'KC-24', 'Terragard Watchman'),
    },
  },
]);

defineCard('Thretin Marshals', [
  {
    key: 'Thretin Marshals/0',
    label: 'Treachery + 腐化值 Progress',
    whenDefeated: (ctx) => placeTreacheryProgress(ctx, ctx.s.world.corruption, 'P6-03', 'Thretin Marshals'),
  },
]);

defineCard('Green Wraith', [
  {
    key: 'Green Wraith/0',
    label: '攻擊 = 腐化值',
    modify: (s, src, q, v) => (q.stat === 'enemyAttack' && self(src, q.enemy) ? v + s.world.corruption : v),
  },
]);

defineCard('Thretin Torchwielder', [
  {
    key: 'Thretin Torchwielder/0',
    label: '腐化 ≥ 4 時任務區所有 Cabalist 敵人接戰',
    whenRevealed: function* (ctx) {
      const s = ctx.s;
      if (s.world.corruption < 4) {
        ctx.log('KC-30', `Thretin Torchwielder：腐化 ${s.world.corruption} < 4，沒有效果`);
        return;
      }
      const cab = s.world.questArea.filter((id) => enemyCard(id).faction === 'Cabalist').reverse();
      for (const id of cab) yield* enemyToPlayer(ctx, id, 'effect', 'KC-03');
    },
  },
]);

defineCard('Waking Wraith', [
  {
    key: 'Waking Wraith/0',
    label: '腐化 ≥ 3 時另有 2 PhotonicDefense',
    modify: (s, src, q, v) =>
      q.stat === 'enemyDefense' && self(src, q.enemy) && q.attackType === 'Photonic' && s.world.corruption >= 3 ? v + 2 : v,
  },
]);

defineCard('Cursed Banneret', [
  {
    key: 'Cursed Banneret/0',
    label: '每用 1 張卡防禦它的攻擊，失去 1 光',
    trigger: {
      event: 'CardDefended',
      timing: 'when',
      mandatory: true,
      filter: (_s, src, ev) => ev.enemy === src.cardId,
      run: (ctx) => loseLight(ctx, 1, 'EE-09', 'Cursed Banneret'),
    },
  },
]);
