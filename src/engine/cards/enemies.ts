// 敵人效果 (KC-12d：{Quest}/{Player} 標示的部分只在該區生效)。
import { enemiesInPlay } from '../calc';
import { cardName } from '../data';
import { defineCard } from '../effects';
import {
  addThreatTokens,
  chooseNegative,
  dealSelfWound,
  enemyToPlayer,
  loseLight,
  placeTreacheryProgress,
  removeLocationProgress,
  rerevealEnemy,
  woundEnemy,
} from '../ops';
import { enemyAttacks } from '../phases';
import { checkExplored } from '../world';
import { self, withFaction } from './util';

// ---------------------------------------------------------------- Dusk

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

defineCard('Sol Scout', [
  {
    key: 'Sol Scout/0',
    label: '任務區下一個敵人立即接戰 (2 點溢出傷害可忽略)',
    whenDefeated: function* (ctx, src) {
      const surplus = (src.params?.surplus as number) ?? 0;
      const next = ctx.s.world.questArea[ctx.s.world.questArea.length - 1];
      if (!next) {
        ctx.log('KC-12c', 'Sol Scout：任務區沒有敵人');
        return;
      }
      if (surplus >= 2) {
        const pick = yield* ctx.choose('KC-12c', `Sol Scout：溢出傷害 ${surplus}，可以忽略效果`, [
          { id: 'ignore', label: '忽略 (2 點溢出傷害)' },
          { id: 'engage', label: `${cardName(next)} 接戰` },
        ]);
        if (pick === 'ignore') {
          ctx.log('P6-03', 'Sol Scout：以 2 點溢出傷害忽略效果');
          return;
        }
      }
      yield* enemyToPlayer(ctx, next, 'engage', 'P6-03');
    },
  },
]);

defineCard('Pyrus Lobber', [
  {
    key: 'Pyrus Lobber/0',
    label: '攻擊時地點 +1 Threat token',
    trigger: {
      event: 'EnemyAttacks',
      timing: 'when',
      mandatory: true,
      filter: (_s, src, ev) => self(src, ev.enemy),
      run: (ctx) => addThreatTokens(ctx, 1, 'EE-09', 'Pyrus Lobber'),
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

defineCard('Thretin Swifter', [
  {
    key: 'Thretin Swifter/0',
    label: '被攻擊時：受 1 傷或 Treachery +2 Progress',
    trigger: {
      event: 'EnemyAttackedByYou',
      timing: 'when',
      mandatory: true,
      filter: (_s, src, ev) => self(src, ev.enemy),
      run: (ctx) =>
        chooseNegative(ctx, 'KC-12f', 'Thretin Swifter', [
          { id: 'wound', label: '受 1 傷', resolvable: 'full', run: () => dealSelfWound(ctx, 1, 'KC-24', 'Thretin Swifter') },
          {
            id: 'treachery',
            label: 'Treachery +2 Progress',
            resolvable: ctx.s.world.activeTreachery ? 'full' : 'none',
            run: () => placeTreacheryProgress(ctx, 2, 'EE-09', 'Thretin Swifter'),
          },
        ]),
    },
  },
]);

defineCard('Sol Assassin', [
  {
    key: 'Sol Assassin/0',
    label: '移動距離 > 3 時立即攻擊 (在任務區時先接戰)',
    trigger: {
      event: 'Arrived',
      timing: 'after',
      mandatory: true,
      filter: (_s, _src, ev) => (ev.distance as number) > 3,
      run: function* (ctx, src) {
        const id = src.cardId!;
        if (ctx.s.world.questArea.includes(id)) yield* enemyToPlayer(ctx, id, 'engage', 'KC-23');
        yield* enemyAttacks(ctx, id, 'KC-23'); // KC-23 立即攻擊
      },
    },
  },
]);

defineCard('Moltan Trail Hound', [
  {
    key: 'Moltan Trail Hound/0',
    label: '移動距離 +1',
    modify: (_s, _src, q, v) => (q.stat === 'distance' ? v + 1 : v),
  },
]);

defineCard('Garadeth Seeker', [
  {
    key: 'Garadeth Seeker/0',
    label: '腐化 ≥ 4 時 Defend Phase 攻擊 2 次',
    modify: (s, src, q, v) => (q.stat === 'enemyAttackCount' && self(src, q.enemy) && s.world.corruption >= 4 ? Math.max(v, 2) : v),
  },
]);

defineCard('Red Wraith', [
  {
    key: 'Red Wraith/0',
    label: 'Darkness = 腐化值',
    modify: (s, src, q, v) => (q.stat === 'enemyDarkness' && self(src, q.enemy) ? v + s.world.corruption : v),
  },
]);

defineCard('Moltan Spy', [
  {
    key: 'Moltan Spy/0',
    label: '移除地點 X Progress，或 Treachery +X Progress',
    whenRevealed: function* (ctx) {
      const s = ctx.s;
      // X = 在場的 Disruptor 敵人數 (含自己)；KC-05a 為 0 時 X = 1
      const x = Math.max(1, withFaction(enemiesInPlay(s), 'Disruptor').length);
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

defineCard('Garadeth Shieldbearer', [
  {
    key: 'Garadeth Shieldbearer/0',
    label: '手牌還有卡時不能用牌庫的卡防禦',
    zone: 'player',
    restrict: (s, _src, r) => (r.kind === 'defendFromDeck' && s.player.hand.length > 0 ? 'Garadeth Shieldbearer：手牌還有卡時不能用牌庫防禦' : null),
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

defineCard('Garadeth Grunt', [
  {
    key: 'Garadeth Grunt/0',
    label: '+X HP (X = 已完成 Treachery 數)',
    modify: (s, src, q, v) => (q.stat === 'enemyHP' && self(src, q.enemy) ? v + s.world.completedTreacheries.length : v),
  },
]);

defineCard('Wing Wraith', [
  {
    key: 'Wing Wraith/0',
    label: 'Treachery 完成時改為 Fast 並重新翻開',
    trigger: {
      event: 'TreacheryCompleted',
      timing: 'when',
      mandatory: true,
      run: function* (ctx, src) {
        const id = src.cardId!;
        ctx.s.world.enemies[id].initiative = 'Fast';
        yield* rerevealEnemy(ctx, id, 'EE-09');
      },
    },
  },
]);

defineCard('Pyrus Razer', [
  {
    key: 'Pyrus Razer/0',
    label: '移動後 Treachery + 距離 Progress，然後自己受 1 傷',
    trigger: {
      event: 'Arrived',
      timing: 'after',
      mandatory: true,
      run: function* (ctx, src, ev) {
        yield* placeTreacheryProgress(ctx, (ev.distance as number) ?? 0, 'EE-10', 'Pyrus Razer');
        yield* woundEnemy(ctx, src.cardId!, 1, 'direct', 'EE-10');
      },
    },
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

// ---------------------------------------------------------------- Doom

defineCard('Waking Wraith', [
  {
    key: 'Waking Wraith/0',
    label: '腐化 ≥ 3 時另有 2 PhotonicDefense (攻擊也具有 Photonic 類型，P7-01a)',
    extraTypes: (s, src, id) => (self(src, id) && s.world.corruption >= 3 ? ['Photonic'] : []),
    modify: (s, src, q, v) =>
      q.stat === 'enemyDefense' && self(src, q.enemy) && q.attackType === 'Photonic' && s.world.corruption >= 3 ? v + 2 : v,
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
      const cab = withFaction(s.world.questArea, 'Cabalist').reverse();
      for (const id of cab) yield* enemyToPlayer(ctx, id, 'effect', 'KC-03');
    },
  },
]);

defineCard('Terragard Warrior', [
  {
    key: 'Terragard Warrior/0',
    label: '攻擊 X = 地點上的 Progress',
    modify: (s, src, q, v) => (q.stat === 'enemyAttack' && self(src, q.enemy) ? v + s.world.location.progress : v),
  },
]);

defineCard('Thretin Hillman', [
  {
    key: 'Thretin Hillman/0',
    label: '攻擊時可以在 Treachery 放最多 5 Progress，每放 1 個攻擊 −1',
    trigger: {
      event: 'EnemyAttacks',
      timing: 'when',
      mandatory: true,
      filter: (_s, src, ev) => self(src, ev.enemy),
      run: function* (ctx, _src, ev) {
        if (!ctx.s.world.activeTreachery) return;
        const k = yield* ctx.chooseNumber('EE-09', 'Thretin Hillman：在 Treachery 放多少 Progress (每個攻擊 −1)？', 0, 5);
        if (!k) return;
        yield* placeTreacheryProgress(ctx, k, 'EE-09', 'Thretin Hillman');
        ev.delta = (ev.delta as number) - k;
        ctx.log('EE-09', `Thretin Hillman 這次攻擊 −${k}`);
      },
    },
  },
]);

defineCard('Sol Starcaster', [
  {
    key: 'Sol Starcaster/0',
    label: '每回合前 2 個要放到地點的 Progress 改放到 Treachery (EE-03、EE-21)',
    zone: 'player',
    trigger: {
      event: 'WillPlaceLocationProgress',
      timing: 'will',
      mandatory: true,
      filter: (s, src) => (s.roundState.flags[`starcaster:${src.cardId}`] ?? 0) < 2,
      run: function* (ctx, src, ev) {
        const key = `starcaster:${src.cardId}`;
        const used = ctx.s.roundState.flags[key] ?? 0;
        const k = Math.min(2 - used, ev.n as number);
        if (k <= 0) return;
        ctx.s.roundState.flags[key] = used + k;
        ev.n = (ev.n as number) - k;
        ctx.log('EE-03', `Sol Starcaster：${k} Progress 改放到 Treachery`);
        yield* placeTreacheryProgress(ctx, k, 'EE-03', 'Sol Starcaster');
      },
    },
  },
]);

defineCard('Druidane Spellcaster', [
  {
    key: 'Druidane Spellcaster/0',
    label: '{Quest} 移動中每保存 1 個信標 Treachery +1 Progress',
    zone: 'quest',
    trigger: { event: 'BeaconSaved', timing: 'when', mandatory: true, filter: (_s, _src, ev) => ev.travel !== false, run: (ctx) => placeTreacheryProgress(ctx, 1, 'EE-09', 'Druidane Spellcaster') },
  },
  {
    key: 'Druidane Spellcaster/1',
    label: '{Player} 移動中每保存 1 個信標 Treachery +2 Progress',
    zone: 'player',
    trigger: { event: 'BeaconSaved', timing: 'when', mandatory: true, filter: (_s, _src, ev) => ev.travel !== false, run: (ctx) => placeTreacheryProgress(ctx, 2, 'EE-09', 'Druidane Spellcaster') },
  },
]);

defineCard('Flocking Wyrm', [
  {
    key: 'Flocking Wyrm/0',
    label: '在場每個其他 Cabalist 敵人 +1 攻擊',
    modify: (s, src, q, v) =>
      q.stat === 'enemyAttack' && self(src, q.enemy) ? v + withFaction(enemiesInPlay(s), 'Cabalist').filter((x) => x !== src.cardId).length : v,
  },
]);

defineCard('Necro-Mage', [
  {
    key: 'Necro-Mage/0',
    label: '攻擊 Necro-Mage 之後本回合不能再攻擊其他敵人',
    trigger: {
      event: 'EnemyAttackedByYou',
      timing: 'after',
      mandatory: true,
      filter: (_s, src, ev) => self(src, ev.enemy),
      run: function* (ctx) {
        ctx.s.roundState.attackLocked = true;
        ctx.log('EE-02', 'Necro-Mage：本回合不能再攻擊');
      },
    },
  },
  {
    key: 'Necro-Mage/1',
    label: 'When Defeated：移除同區所有敵人的傷害；沒有移除任何傷害就重新翻開',
    trigger: {
      event: 'WillDefeatEnemy',
      timing: 'will',
      mandatory: true,
      filter: (_s, src, ev) => self(src, ev.enemy),
      run: function* (ctx, src, ev) {
        const s = ctx.s;
        const id = src.cardId!;
        const area = s.world.questArea.includes(id) ? s.world.questArea : s.world.playerArea;
        let removed = 0;
        for (const e of area) {
          if (e === id) continue;
          const inst = s.world.enemies[e];
          removed += inst.wounds;
          inst.wounds = 0;
        }
        if (removed > 0) {
          ctx.log('P6-03', `Necro-Mage When Defeated：移除同區敵人共 ${removed} 傷害`);
          return;
        }
        ev.cancel = true;
        s.world.enemies[id].wounds = 0;
        ctx.log('P6-03', 'Necro-Mage When Defeated：沒有移除任何傷害，改為重新翻開 (不算擊敗)');
        yield* rerevealEnemy(ctx, id, 'P6-03');
      },
    },
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

defineCard('Djinn of Ire', [
  {
    key: 'Djinn of Ire/0',
    label: '{Quest} Refresh：失去 1 光，或補牌少抽 1 張',
    zone: 'quest',
    trigger: {
      event: 'WillRefill',
      timing: 'will',
      mandatory: true,
      run: (ctx, _src, ev) =>
        chooseNegative(ctx, 'KC-12f', 'Djinn of Ire', [
          { id: 'light', label: '失去 1 光', resolvable: ctx.s.player.light >= 1 ? 'full' : 'none', run: () => loseLight(ctx, 1, 'EE-09', 'Djinn of Ire') },
          {
            id: 'draw',
            label: '少抽 1 張',
            resolvable: (ev.n as number) >= 1 ? 'full' : 'none',
            run: function* () {
              ev.n = (ev.n as number) - 1;
            },
          },
        ]),
    },
  },
]);

defineCard('Glacian Seafare', [
  {
    key: 'Glacian Seafare/0',
    label: '{Quest} Explore Phase 中 Treachery 獲得 Progress 時再 +2',
    zone: 'quest',
    trigger: {
      event: 'ProgressPlaced',
      timing: 'when',
      mandatory: true,
      filter: (s, src, ev) => ev.target === 'treachery' && s.phase === 'explore' && ev.by !== src.id,
      run: (ctx) => placeTreacheryProgress(ctx, 2, 'EE-09', 'Glacian Seafare'),
    },
  },
]);

defineCard('Terrimorian Lurker', [
  {
    key: 'Terrimorian Lurker/0',
    label: 'Explore Phase 在地點放超過 3 Progress 時受 1 傷',
    trigger: {
      event: 'ProgressPlaced',
      timing: 'when',
      mandatory: true,
      filter: (s, _src, ev) => ev.target === 'location' && s.phase === 'explore' && (ev.n as number) > 3,
      run: (ctx) => dealSelfWound(ctx, 1, 'KC-24', 'Terrimorian Lurker'),
    },
  },
]);

defineCard('Shadian Tracker', [
  {
    key: 'Shadian Tracker/0',
    label: '攻擊時每有 1 個信標 +1 攻擊',
    trigger: {
      event: 'EnemyAttacks',
      timing: 'when',
      mandatory: true,
      filter: (_s, src, ev) => self(src, ev.enemy),
      run: function* (ctx, _src, ev) {
        const n = ctx.s.player.beacons.length;
        ev.delta = (ev.delta as number) + n;
        if (n) ctx.log('EE-09', `Shadian Tracker：信標 ${n} 個，這次攻擊 +${n}`);
      },
    },
  },
]);
