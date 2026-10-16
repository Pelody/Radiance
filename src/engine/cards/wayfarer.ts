// Wayfarer：卡片 (基礎面 / 進階面 `+`) 與技能。特質以圖示呈現 (KC-14)，常和地點的特質比對。
import { actionSetCards, actionSetTraits, cardTraits, cardsInPlay, engagementCount, enemyDefenseStat } from '../calc';
import { cardName, enemyCard, locationCard } from '../data';
import { defineCard, defineLingering, defineSkill } from '../effects';
import type { Ctx, Gen } from '../core';
import {
  addLingering,
  addObstacle,
  addPath,
  chooseEnemies,
  disarm,
  gainLight,
  push,
  removePath,
  removeObstacle,
  removeThreatToken,
  removeTreacheryProgress,
  spendLight,
  woundEnemy,
} from '../ops';
import { placeLocationProgress } from '../world';
import type { GameState } from '../types';
import { actionCard, attackCard, exploreCard, playerEnemies, roundMod, spendBeacons } from './util';

const locTraits = (s: GameState) => cardTraits(s, s.world.location.id);
const sharesWithLocation = (s: GameState, card: string | null) => !!card && cardTraits(s, card).some((t) => locTraits(s).includes(t));

function* spendUpTo(ctx: Ctx, max: number, why: string): Gen<number> {
  const n = yield* ctx.chooseNumber('KC-11', `${why}：花多少光？`, 0, Math.min(max, ctx.s.player.light));
  if (n) yield* spendLight(ctx, n, 'KC-11', why);
  return n;
}

// ---------------------------------------------------------------- Fortitude

defineCard('Fortitude', [
  {
    key: 'Fortitude/0',
    label: '移動時忽略 Obstacle',
    type: 'Passive',
    modify: (_s, _src, q, v) => (q.stat === 'flag' && q.flag === 'ignoreObstaclesTravel' ? v + 1 : v),
  },
]);

defineLingering({
  key: 'Fortitude+/double',
  label: '敵人的防禦值加倍',
  modify: (_s, src, q, v) => {
    if (q.stat !== 'enemyDefenseFinal' || !q.enemy) return v;
    const cls = enemyCard(q.enemy).class;
    return (src.params!.classes as string[]).includes(cls) ? v * 2 : v;
  },
});

defineCard('Fortitude+', [
  {
    key: 'Fortitude+/0',
    label: '付 1 光：Dusk 敵人防禦值加倍；付 2 光：Dusk 與 Doom 敵人',
    type: '1x',
    active: {
      available: (s) => (s.player.light < 1 ? '光不足' : null),
      run: function* (ctx, src) {
        const pick = yield* ctx.choose('KC-11', 'Fortitude', [
          { id: '1', label: '付 1 光：Dusk 敵人防禦加倍' },
          { id: '2', label: '付 2 光：Dusk 與 Doom 敵人防禦加倍', legal: ctx.s.player.light >= 2 },
        ]);
        yield* spendLight(ctx, Number(pick), 'KC-11', 'Fortitude');
        addLingering(ctx, 'Fortitude+/double', src, { classes: pick === '1' ? ['Dusk'] : ['Dusk', 'Doom'] });
      },
    },
  },
  {
    key: 'Fortitude+/1',
    label: '移動時，在場每個 Obstacle 移除 Treachery 2 Progress',
    type: 'Unrestricted',
    trigger: {
      event: 'TravelStarted',
      timing: 'when',
      mandatory: false,
      filter: (s) => s.world.location.obstacles > 0 && s.world.treacheryProgress > 0,
      run: function* (ctx) {
        yield* removeTreacheryProgress(ctx, 2 * ctx.s.world.location.obstacles, 'KC-11', 'Fortitude');
      },
    },
  },
]);

// ---------------------------------------------------------------- Hasten

defineCard('Hasten', [
  {
    key: 'Hasten/0',
    label: '給地點 1 個特質 (必須是行動組卡片上有的特質)',
    type: '1x',
    active: {
      run: function* (ctx) {
        const s = ctx.s;
        const lid = s.world.location.id;
        const opts = actionSetTraits(s).filter((t) => !cardTraits(s, lid).includes(t));
        if (!opts.length) return;
        const t = yield* ctx.choose('KC-16', `Hasten：給 ${cardName(lid)} 哪個特質？`, opts.map((x) => ({ id: x, label: x })));
        s.roundState.grantedTraits.push({ target: lid, trait: t });
        ctx.log('KC-16', `${cardName(lid)} 本回合獲得特質 ${t}`);
      },
    },
  },
]);

function* reduceResistance(ctx: Ctx, n: number): Gen {
  const w = ctx.s.world;
  const before = w.resistance;
  w.resistance = Math.max(0, w.resistance - n);
  ctx.log('KC-11', `抗性軌道 ${before} → ${w.resistance} (Hasten)`);
}

defineCard('Hasten+', [
  {
    key: 'Hasten+/0',
    label: '攻擊卡與地點有相同特質時抗性軌道 −2；然後可以花 1 光再 −2',
    type: '1x',
    active: {
      available: (s) => (sharesWithLocation(s, attackCard(s)) ? null : '攻擊卡與地點沒有相同特質'),
      run: function* (ctx) {
        yield* reduceResistance(ctx, 2);
        if (ctx.s.player.light < 1) return;
        const more = yield* ctx.choose('KC-11', 'Hasten：花 1 光再 −2？', [
          { id: 'yes', label: '花 1 光' },
          { id: 'no', label: '不要' },
        ]);
        if (more === 'yes') {
          yield* spendLight(ctx, 1, 'KC-11', 'Hasten');
          yield* reduceResistance(ctx, 2);
        }
      },
    },
  },
]);

// ---------------------------------------------------------------- Step Lightly

defineCard('Step Lightly', [
  {
    key: 'Step Lightly/0',
    label: '花 1 光接戰 −2，或 2 光 −3；每少接戰 1 個敵人地點 +2 Progress',
    type: '1x',
    active: {
      available: (s) => (s.player.light < 1 ? '光不足' : null),
      run: function* (ctx, src) {
        const s = ctx.s;
        const pick = yield* ctx.choose('KC-11', 'Step Lightly', [
          { id: '1', label: '花 1 光：接戰 −2' },
          { id: '2', label: '花 2 光：接戰 −3', legal: s.player.light >= 2 },
        ]);
        yield* spendLight(ctx, Number(pick), 'KC-11', 'Step Lightly');
        // ⚠ INTERP：避免的接戰數以使用當下的接戰數計算
        const before = engagementCount(s);
        roundMod(ctx, src, 'engagement', pick === '1' ? -2 : -3);
        const prevented = before - engagementCount(s);
        yield* placeLocationProgress(ctx, 2 * prevented, 'KC-11', 'Step Lightly');
      },
    },
  },
]);

defineCard('Step Lightly+', [
  {
    key: 'Step Lightly+/0',
    label: '花最多 3 光，每 1 光選擇：push 2 個敵人、移除 1 Threat token、或 Path +2',
    type: '1x',
    active: {
      run: function* (ctx) {
        const n = yield* spendUpTo(ctx, 3, 'Step Lightly');
        for (let i = 0; i < n; i++) {
          const s = ctx.s;
          const pick = yield* ctx.choose('KC-11', `Step Lightly (${i + 1}/${n})`, [
            { id: 'push', label: 'push 2 個敵人', legal: s.world.playerArea.length > 0 },
            { id: 'token', label: '移除 1 Threat token', legal: s.world.location.threatTokens > 0 },
            { id: 'path', label: 'Path +2' },
          ]);
          if (pick === 'push') {
            const ids = yield* chooseEnemies(ctx, 'KC-04', 'push 哪些敵人？', playerEnemies(s), Math.min(2, s.world.playerArea.length), 2);
            for (const e of ids) yield* push(ctx, e, 'KC-04');
          } else if (pick === 'token') yield* removeThreatToken(ctx, 1, 'KC-11', 'Step Lightly');
          else yield* addPath(ctx, 2, 'KC-11', 'Step Lightly');
        }
      },
    },
  },
]);

// ---------------------------------------------------------------- Light the Path

defineCard('Light the Path', [
  {
    key: 'Light the Path/0',
    label: '花最多 2 光，每 1 光：Path +2 或移除 2 Obstacle',
    type: '1x',
    active: {
      run: function* (ctx) {
        const n = yield* spendUpTo(ctx, 2, 'Light the Path');
        for (let i = 0; i < n; i++) {
          const pick = yield* ctx.choose('KC-11', `Light the Path (${i + 1}/${n})`, [
            { id: 'path', label: 'Path +2' },
            { id: 'obstacle', label: '移除 2 Obstacle', legal: ctx.s.world.location.obstacles > 0 },
          ]);
          if (pick === 'path') yield* addPath(ctx, 2, 'KC-11', 'Light the Path');
          else yield* removeObstacle(ctx, 2, 'KC-11', 'Light the Path');
        }
      },
    },
  },
]);

defineCard('Light the Path+', [
  {
    key: 'Light the Path+/0',
    label: '得 2 × (行動組中與地點有相同特質的卡數) 光；然後可以花 2 光移除 1 Threat token',
    type: '1x',
    active: {
      run: function* (ctx) {
        const s = ctx.s;
        const x = actionSetCards(s).filter((c) => sharesWithLocation(s, c)).length;
        yield* gainLight(ctx, 2 * x, 'KC-11', 'Light the Path');
        if (s.player.light < 2 || !s.world.location.threatTokens) return;
        const go = yield* ctx.choose('KC-11', 'Light the Path：花 2 光移除 1 Threat token？', [
          { id: 'yes', label: '花 2 光' },
          { id: 'no', label: '不要' },
        ]);
        if (go === 'yes') {
          yield* spendLight(ctx, 2, 'KC-11', 'Light the Path');
          yield* removeThreatToken(ctx, 1, 'KC-11', 'Light the Path');
        }
      },
    },
  },
]);


// ---------------------------------------------------------------- Foresight

defineCard('Foresight', [
  {
    key: 'Foresight/0',
    label: '花最多 3 光，每 1 光：1 個 Obstacle 換成 Path，或忽略任務區 3 Darkness',
    type: '1x',
    active: {
      run: function* (ctx, src) {
        const n = yield* spendUpTo(ctx, 3, 'Foresight');
        for (let i = 0; i < n; i++) {
          const pick = yield* ctx.choose('KC-11', `Foresight (${i + 1}/${n})`, [
            { id: 'convert', label: 'Obstacle 換成 Path', legal: ctx.s.world.location.obstacles > 0 },
            { id: 'dark', label: '忽略 3 Darkness' },
          ]);
          if (pick === 'convert') {
            yield* removeObstacle(ctx, 1, 'KC-11', 'Foresight');
            yield* addPath(ctx, 1, 'KC-11', 'Foresight');
          } else roundMod(ctx, src, 'ignoreDarkness', 3);
        }
      },
    },
  },
]);

defineCard('Foresight+', [
  {
    key: 'Foresight+/0',
    label: '移動時棄任意數量信標，每個距離 −2 (最低 0)',
    type: '1x',
    trigger: {
      event: 'WillResolveDistance',
      timing: 'will',
      mandatory: false,
      filter: (s) => s.player.beacons.length > 0,
      run: function* (ctx, _src, ev) {
        const used = yield* spendBeacons(ctx, 0, ctx.s.player.beacons.length, 'KC-11', 'Foresight');
        if (!used.length) return;
        ev.distance = (ev.distance as number) - 2 * used.length;
        ev.min = 0;
      },
    },
  },
]);

// ---------------------------------------------------------------- Ever Onward

defineCard('Ever Onward', [
  {
    key: 'Ever Onward/0',
    label: '效果移除 Treachery Progress 之後，地點 + (移除數 + 2) Progress',
    type: 'Unrestricted',
    trigger: {
      event: 'ProgressRemoved',
      timing: 'after',
      mandatory: false,
      filter: (_s, _src, ev) => ev.target === 'treachery',
      run: (ctx, _src, ev) => placeLocationProgress(ctx, (ev.n as number) + 2, 'KC-11', 'Ever Onward'),
    },
  },
]);

defineCard('Ever Onward+', [
  {
    key: 'Ever Onward+/0',
    label: '查看並重新排列地點牌庫頂端 2X 張 (X = 行動組中地點也有的特質數)',
    type: '1x',
    active: {
      run: function* (ctx) {
        const s = ctx.s;
        const x = actionSetTraits(s).filter((t) => locTraits(s).includes(t)).length;
        const top = s.world.locationDeck.slice(0, 2 * x);
        if (top.length < 2) {
          if (top.length) ctx.log('KC-11', `Ever Onward：查看 ${top.map((c) => locationCard(c).name).join('、')}`);
          return;
        }
        ctx.revealInfo();
        const order = (yield* ctx.decide({
          type: 'order',
          rule: 'KC-11',
          prompt: 'Ever Onward：排列地點牌庫頂端 (第一張在最上面)',
          cards: top,
          validate: (a) => (Array.isArray(a) && a.length === top.length && top.every((c) => a.includes(c)) ? null : '請排列全部的卡'),
        })) as string[];
        s.world.locationDeck.splice(0, top.length, ...order);
        ctx.log('KC-11', `Ever Onward：重新排列地點牌庫頂端 ${top.length} 張`);
      },
    },
  },
]);

// ---------------------------------------------------------------- 技能

defineSkill('Secret Ways', [
  {
    key: 'Secret Ways',
    label: '受到敵人攻擊傷害時，移除 1 Path 抵銷 2 傷',
    type: 'Unrestricted',
    trigger: {
      event: 'WillWoundPlayer',
      timing: 'will',
      mandatory: false,
      filter: (s, _src, ev) => ev.source === 'enemyAttack' && s.world.location.paths > 0,
      run: function* (ctx, _src, ev) {
        yield* removePath(ctx, 1, 'KC-18', 'Secret Ways');
        ev.n = Math.max(0, (ev.n as number) - 2);
        ctx.log('KC-18', 'Secret Ways：抵銷 2 傷');
      },
    },
  },
]);


defineSkill('Familiar Places', [
  {
    key: 'Familiar Places',
    label: '移動時，探索卡與目的地有相同特質時距離 −2',
    type: 'MandatoryUnrestricted',
    trigger: {
      event: 'WillResolveDistance',
      timing: 'will',
      mandatory: true,
      filter: (s, _src, ev) => {
        const e = exploreCard(s);
        return !!e && cardTraits(s, e).some((t) => locationCard(ev.dest as string).trait_icons.includes(t));
      },
      run: function* (ctx, _src, ev) {
        ev.distance = (ev.distance as number) - 2;
        ctx.log('KC-18', 'Familiar Places：距離 −2');
      },
    },
  },
]);

defineSkill('Choose Wisely', [
  {
    key: 'Choose Wisely',
    label: '結算距離時，前 3 個延後的地點不加距離',
    type: '1x',
    trigger: {
      event: 'WillResolveDistance',
      timing: 'will',
      mandatory: false,
      filter: (_s, _src, ev) => (ev.deferred as number) > 0,
      run: function* (ctx, _src, ev) {
        const k = Math.min(3, ev.deferred as number);
        ev.distance = (ev.distance as number) - k;
        ctx.log('KC-18', `Choose Wisely：延後的 ${k} 個地點不加距離`);
      },
    },
  },
]);

defineSkill('Infiltrate', [
  {
    key: 'Infiltrate',
    label: '探索卡與地點有相同特質時，移除 Treachery 4 Progress',
    type: '1x',
    active: {
      available: (s) => (sharesWithLocation(s, exploreCard(s)) ? null : '探索卡與地點沒有相同特質'),
      run: function* (ctx) {
        yield* removeTreacheryProgress(ctx, 4, 'KC-18', 'Infiltrate');
      },
    },
  },
]);

defineSkill('Field Advantage', [
  {
    key: 'Field Advantage',
    label: '行動卡與地點有相同特質時，選 3 個敵人 Disarm',
    type: '1x',
    active: {
      available: (s) => (sharesWithLocation(s, actionCard(s)) ? null : '行動卡與地點沒有相同特質'),
      run: function* (ctx) {
        const ids = yield* chooseEnemies(ctx, 'KC-18', 'Field Advantage：Disarm 最多 3 個敵人', playerEnemies(ctx.s), Math.min(3, ctx.s.world.playerArea.length), 3);
        for (const e of ids) disarm(ctx, e, 'KC-18');
      },
    },
  },
]);

defineSkill('All-Terrain', [
  {
    key: 'All-Terrain',
    label: '加最多 2 個 Obstacle，每個 push 1 個敵人',
    type: '1x',
    active: {
      phases: ['defend'],
      run: function* (ctx) {
        const n = yield* ctx.chooseNumber('KC-18', 'All-Terrain：加幾個 Obstacle？', 0, 2);
        if (!n) return;
        yield* addObstacle(ctx, n, 'KC-18', 'All-Terrain');
        const ids = yield* chooseEnemies(ctx, 'KC-04', `All-Terrain：push ${n} 個敵人`, playerEnemies(ctx.s), Math.min(n, ctx.s.world.playerArea.length), n);
        for (const e of ids) yield* push(ctx, e, 'KC-04');
      },
    },
  },
]);

defineSkill('In the Wind', [
  {
    key: 'In the Wind',
    label: 'push X+1 個敵人，各受等於自己防禦值的傷害 (X = 在場與地點相同的特質數)',
    type: '1x',
    active: {
      run: function* (ctx) {
        const s = ctx.s;
        const lt = locTraits(s);
        const x = cardsInPlay(s).reduce((n, c) => n + cardTraits(s, c).filter((t) => lt.includes(t)).length, 0);
        const ids = yield* chooseEnemies(ctx, 'KC-04', `In the Wind：push ${x + 1} 個敵人`, playerEnemies(s), Math.min(x + 1, s.world.playerArea.length), x + 1);
        for (const e of ids) {
          const d = enemyDefenseStat(s, e);
          yield* push(ctx, e, 'KC-04');
          yield* woundEnemy(ctx, e, d, 'direct', 'KC-25');
        }
      },
    },
  },
]);

