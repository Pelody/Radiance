// Courage：卡片 (基礎面 / 進階面 `+`) 與技能。
import { cardTraits, enemyDarkness, enemyInitiative, traitCountInPlay } from '../calc';
import { enemyCard } from '../data';
import { defineCard, defineLingering, defineSkill, findSkill, flag as applyFlag, skillUsable } from '../effects';
import {
  addLingering,
  chooseEnemies,
  chooseEnemy,
  disarm,
  drawCards,
  gainLight,
  gainXP,
  pull,
  push,
  spendLight,
  spendXP,
  woundEnemy,
} from '../ops';
import { placeLocationProgress } from '../world';
import type { GameState } from '../types';
import { addFlag, playerEnemies, roundMod, saveBeaconsFromDiscard, spendBeacons } from './util';

const slowEntered = (s: GameState, ev: Record<string, unknown>) => enemyInitiative(s, ev.enemy as string) === 'Slow';

// ---------------------------------------------------------------- Force of Will

defineCard('Force of Will', [
  {
    key: 'Force of Will/0',
    label: '每個信標在地點放 1 Progress',
    type: '1x',
    active: {
      phases: ['explore'],
      run: (ctx) => placeLocationProgress(ctx, ctx.s.player.beacons.length, 'KC-11', 'Force of Will'),
    },
  },
]);

defineCard('Force of Will+', [
  {
    key: 'Force of Will+/0',
    label: 'Engagement 結束：棄任意數量信標，每個 Pull 1 個敵人並得 1 光',
    type: '1x',
    phaseEnd: {
      phase: 'engagement',
      mandatory: false,
      run: function* (ctx) {
        const used = yield* spendBeacons(ctx, 0, ctx.s.player.beacons.length, 'KC-11', 'Force of Will');
        for (let i = 0; i < used.length; i++) {
          const id = yield* chooseEnemy(ctx, 'KC-04', `Force of Will：Pull 敵人 (${i + 1}/${used.length})`, ctx.s.world.questArea);
          if (id) yield* pull(ctx, id, 'KC-04');
          yield* gainLight(ctx, 1, 'KC-11', 'Force of Will');
        }
      },
    },
  },
]);

// ---------------------------------------------------------------- Tempest

defineCard('Tempest', [
  {
    key: 'Tempest/0',
    label: '探索地點時多得 2 XP',
    type: '1x',
    trigger: { event: 'LocationExplored', timing: 'when', mandatory: false, run: (ctx) => gainXP(ctx, 2, 'KC-11', 'Tempest') },
  },
]);

defineCard('Tempest+', [
  {
    key: 'Tempest+/0',
    label: 'Slow 敵人進入玩家區後得 1 XP',
    type: 'Unrestricted',
    trigger: { event: 'EnemyEnteredPlayer', timing: 'after', mandatory: false, filter: (s, _src, ev) => slowEntered(s, ev), run: (ctx) => gainXP(ctx, 1, 'KC-11', 'Tempest') },
  },
  {
    key: 'Tempest+/1',
    label: '在場每個 light charge 特質，對玩家區每個 Slow 敵人造成 1 傷',
    type: '1x',
    active: {
      run: function* (ctx) {
        const n = traitCountInPlay(ctx.s, 'Light Charge');
        for (const id of ctx.s.world.playerArea.filter((e) => enemyInitiative(ctx.s, e) === 'Slow')) yield* woundEnemy(ctx, id, n, 'direct', 'KC-25');
      },
    },
  },
]);

// ---------------------------------------------------------------- Against All Odds

defineCard('Against All Odds', [
  {
    key: 'Against All Odds/0',
    label: 'MainAttack + 玩家區敵人數',
    type: '1x',
    active: { phases: ['attack'], run: function* (ctx, src) { roundMod(ctx, src, 'mainAttack', ctx.s.world.playerArea.length); } },
  },
]);

defineCard('Against All Odds+', [
  {
    key: 'Against All Odds+/0',
    label: 'MainAttack + 玩家區敵人的 Darkness 總和；可以從地點棄牌堆保存 1 個信標',
    type: '1x',
    active: {
      phases: ['attack'],
      run: function* (ctx, src) {
        roundMod(ctx, src, 'mainAttack', ctx.s.world.playerArea.reduce((n, id) => n + enemyDarkness(ctx.s, id), 0));
        yield* saveBeaconsFromDiscard(ctx, 1, 'KC-11', 'Against All Odds');
      },
    },
  },
]);

// ---------------------------------------------------------------- Blinding Light

defineLingering({
  key: 'Blinding Light/ignore',
  label: '忽略玩家區敵人的 PhotonicDefense',
  modify: (s, src, q, v) =>
    q.stat === 'enemyDefense' && q.attackType === 'Photonic' && q.enemy && s.world.playerArea.includes(q.enemy) ? v - (src.params!.n as number) : v,
});

defineCard('Blinding Light', [
  {
    key: 'Blinding Light/0',
    label: '花最多 2 光：本回合忽略玩家區敵人 X+1 PhotonicDefense；花 2 光時得到等於在場 brave 特質數的光',
    type: '1x',
    active: {
      run: function* (ctx, src) {
        const x = yield* ctx.chooseNumber('KC-11', 'Blinding Light：花多少光？', 0, Math.min(2, ctx.s.player.light));
        if (x) yield* spendLight(ctx, x, 'KC-11', 'Blinding Light');
        addLingering(ctx, 'Blinding Light/ignore', src, { n: x + 1 });
        ctx.log('EE-06', `Blinding Light：本回合忽略玩家區敵人 ${x + 1} PhotonicDefense`);
        if (x === 2) yield* gainLight(ctx, traitCountInPlay(ctx.s, 'Brave'), 'KC-11', 'Blinding Light');
      },
    },
  },
]);

defineCard('Blinding Light+', [
  {
    key: 'Blinding Light+/0',
    label: '用地點棄牌堆的卡填滿信標；可以 push 等於得到信標數的敵人',
    type: '1x',
    active: {
      run: function* (ctx) {
        const got = yield* saveBeaconsFromDiscard(ctx, 99, 'KC-11', 'Blinding Light');
        if (!got.length) return;
        const ids = yield* chooseEnemies(ctx, 'KC-04', `Blinding Light：push 最多 ${got.length} 個敵人`, playerEnemies(ctx.s), 0, got.length);
        for (const id of ids) yield* push(ctx, id, 'KC-04');
      },
    },
  },
]);

// ---------------------------------------------------------------- Terrible and Swift

defineCard('Terrible and Swift', [
  {
    key: 'Terrible and Swift/0',
    label: 'Slow 敵人進入玩家區時抽 1 張',
    type: 'MandatoryUnrestricted',
    trigger: { event: 'EnemyEnteredPlayer', timing: 'when', mandatory: true, filter: (s, _src, ev) => slowEntered(s, ev), run: (ctx) => draw1(ctx) },
  },
  {
    key: 'Terrible and Swift/1',
    label: 'Burning Light 已解鎖且啟動時多造成 1 傷',
    type: 'Passive',
    modify: (_s, _src, q, v) => (q.stat === 'flag' && q.flag === 'burningLightPlus1' ? v + 1 : v),
  },
]);

function* draw1(ctx: import('../core').Ctx) {
  yield* drawCards(ctx, 1, 'KC-11', 'Terrible and Swift');
}

defineCard('Terrible and Swift+', [
  {
    key: 'Terrible and Swift+/0',
    label: 'Burning Light 啟動時不用花信標',
    type: 'Passive',
    modify: (_s, _src, q, v) => (q.stat === 'flag' && q.flag === 'burningLightFree' ? v + 1 : v),
  },
  {
    key: 'Terrible and Swift+/1',
    label: 'Disarm 玩家區所有非 Shade 敵人，或花 2 光 Disarm 1 個 Shade',
    type: '1x',
    active: {
      run: function* (ctx) {
        const s = ctx.s;
        const shades = s.world.playerArea.filter((id) => enemyCard(id).class === 'Shade');
        const pick =
          shades.length && s.player.light >= 2
            ? yield* ctx.choose('KC-11', 'Terrible and Swift', [
                { id: 'all', label: 'Disarm 所有非 Shade 敵人' },
                { id: 'shade', label: '花 2 光 Disarm Shade' },
              ])
            : 'all';
        if (pick === 'shade') {
          yield* spendLight(ctx, 2, 'KC-11', 'Terrible and Swift');
          disarm(ctx, shades[0], 'KC-11');
        } else for (const id of s.world.playerArea) if (enemyCard(id).class !== 'Shade') disarm(ctx, id, 'KC-11');
      },
    },
  },
]);

// ---------------------------------------------------------------- Striking Gold

defineCard('Striking Gold', [
  {
    key: 'Striking Gold/0',
    label: '花最多 2 個信標，每個得 1 XP 與 1 光',
    type: '1x',
    active: {
      run: function* (ctx) {
        const used = yield* spendBeacons(ctx, 0, 2, 'KC-11', 'Striking Gold');
        if (!used.length) return;
        yield* gainXP(ctx, used.length, 'KC-11', 'Striking Gold');
        yield* gainLight(ctx, used.length, 'KC-11', 'Striking Gold');
      },
    },
  },
]);

defineLingering({
  key: 'Striking Gold+/defense',
  label: '所有敵人防禦值提高',
  modify: (_s, src, q, v) => (q.stat === 'enemyDefense' && q.enemy ? v + (src.params!.n as number) : v),
});
defineLingering({
  key: 'Striking Gold+/discard',
  label: '棄掉 light charge 卡時，對玩家區 1 個敵人造成 2 傷',
  trigger: {
    event: 'CardDiscarded',
    timing: 'when',
    mandatory: false,
    filter: (s, _src, ev) => cardTraits(s, ev.card as string).includes('Light Charge') && s.world.playerArea.length > 0,
    run: function* (ctx) {
      const id = yield* chooseEnemy(ctx, 'KC-25', 'Striking Gold：2 傷害給誰？', playerEnemies(ctx.s));
      if (id) yield* woundEnemy(ctx, id, 2, 'direct', 'KC-25');
    },
  },
});

defineCard('Striking Gold+', [
  {
    key: 'Striking Gold+/0',
    label: '所有敵人防禦值 +最多 3；Burning Light 傷害增加同樣數量',
    type: '1x',
    active: {
      phases: ['actionSet'],
      run: function* (ctx, src) {
        const n = yield* ctx.chooseNumber('KC-11', 'Striking Gold：敵人防禦值 + 多少？', 0, 3);
        if (!n) return;
        addLingering(ctx, 'Striking Gold+/defense', src, { n });
        addFlag(ctx.s, 'burningLightBonus', n);
        ctx.log('EE-06', `Striking Gold：本回合所有敵人防禦 +${n}，Burning Light +${n} 傷`);
      },
    },
  },
  {
    key: 'Striking Gold+/1',
    label: '棄掉 light charge 卡時對玩家區 1 個敵人造成 2 傷 (含 Refresh 棄掉行動組)',
    type: 'Unrestricted',
    // 行動組在 P8-04 棄掉後這張卡就不是行動卡了；打出時登記到回合結束，讓棄行動組也能觸發
    trigger: {
      event: 'CardPlayed',
      timing: 'when',
      mandatory: true,
      filter: (_s, src, ev) => ev.card === src.cardId && ev.slot === 'action',
      run: function* (ctx, src) {
        addLingering(ctx, 'Striking Gold+/discard', src);
      },
    },
  },
]);

// ---------------------------------------------------------------- 技能

defineSkill('Flares', [
  {
    key: 'Flares',
    label: 'Pull 1 個 Fast 敵人；或花 1 XP 改為 Pull 所有 Slow 敵人',
    type: '1x',
    active: {
      run: function* (ctx) {
        const s = ctx.s;
        const slow = s.world.questArea.filter((id) => enemyInitiative(s, id) === 'Slow');
        const fast = s.world.questArea.filter((id) => enemyInitiative(s, id) === 'Fast');
        const pick =
          s.player.xp >= 1 && slow.length
            ? yield* ctx.choose('KC-18', 'Flares', [
                { id: 'fast', label: 'Pull 1 個 Fast 敵人', legal: fast.length > 0 },
                { id: 'slow', label: `花 1 XP Pull 所有 Slow 敵人 (${slow.length})` },
              ])
            : 'fast';
        if (pick === 'slow') {
          yield* spendXP(ctx, 1, 'KC-18', 'Flares');
          for (const id of slow.slice().reverse()) yield* pull(ctx, id, 'KC-04');
        } else {
          const id = yield* chooseEnemy(ctx, 'KC-04', 'Flares：Pull 1 個 Fast 敵人', fast);
          if (id) yield* pull(ctx, id, 'KC-04');
        }
      },
    },
  },
]);

defineSkill('Spark', [
  {
    key: 'Spark',
    label: '花最多 2 個信標，下一次 Character Growth 每個少 1 XP',
    type: '1x',
    active: {
      run: function* (ctx) {
        const used = yield* spendBeacons(ctx, 0, 2, 'KC-18', 'Spark');
        if (!used.length) return;
        ctx.s.roundState.growthDiscounts.push({ track: 'character', kind: 'minus', value: used.length, sourceName: 'Spark' });
        ctx.log('KC-18', `Spark：下一次 Character Growth −${used.length} XP`);
      },
    },
  },
]);

defineSkill('Illuminate', [
  {
    key: 'Illuminate',
    label: '忽略任務區 Darkness = 玩家區敵人數 +1',
    type: 'Passive',
    modify: (s, _src, q, v) => (q.stat === 'ignoreDarkness' ? v + s.world.playerArea.length + 1 : v),
  },
]);

defineSkill('Burning Light', [
  {
    key: 'Burning Light',
    label: '敵人進入玩家區時，花 1 個信標對它造成 2 傷',
    type: 'Unrestricted',
    trigger: {
      event: 'EnemyEnteredPlayer',
      timing: 'when',
      mandatory: false,
      filter: (s) => s.player.beacons.length > 0 || hasFreeBurn(s),
      run: function* (ctx, _src, ev) {
        const s = ctx.s;
        if (!hasFreeBurn(s)) {
          const used = yield* spendBeacons(ctx, 1, 1, 'KC-18', 'Burning Light');
          if (!used.length) return;
        }
        const n = 2 + (applyFlag(s, 'burningLightPlus1') ? 1 : 0) + (s.roundState.flags.burningLightBonus ?? 0);
        yield* woundEnemy(ctx, ev.enemy as string, n, 'direct', 'KC-25');
      },
    },
  },
]);

function hasFreeBurn(s: GameState): boolean {
  const sk = findSkill(s, 'Burning Light');
  return !!sk && skillUsable(s, sk) && applyFlag(s, 'burningLightFree');
}

defineSkill('Sun Shield', [
  {
    key: 'Sun Shield',
    label: '花 1 XP：每 2 個信標 Disarm 1 個敵人',
    type: '1x',
    active: {
      available: (s) => (s.player.xp < 1 ? '需要 1 XP' : null),
      run: function* (ctx) {
        yield* spendXP(ctx, 1, 'KC-18', 'Sun Shield');
        const n = Math.floor(ctx.s.player.beacons.length / 2);
        const ids = yield* chooseEnemies(ctx, 'KC-18', `Sun Shield：Disarm 最多 ${n} 個敵人`, playerEnemies(ctx.s), 0, n);
        for (const id of ids) disarm(ctx, id, 'KC-18');
      },
    },
  },
]);

