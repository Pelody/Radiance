// 地點效果 (EE-07：目前地點有效；最終地點橫置後仍有效 FL-04；Envy 放在玩家區的地點也有效)。
import { cardTraits, enemiesInPlay, face } from '../calc';
import { locationCard } from '../data';
import { defineCard, defineLingering, flag, type Source } from '../effects';
import {
  addLingering,
  addObstacle,
  addPath,
  addThreatTokens,
  chooseExhaustSkill,
  chooseNegative,
  dealSelfWound,
  engageEnemies,
  enemyToPlayer,
  enemyToQuest,
  gainLight,
  healEnemy,
  loseLight,
  loseXP,
  placeTreacheryProgress,
  removeTreacheryProgress,
  spendLight,
} from '../ops';
import { lightMax } from '../tracks';
import type { GameState } from '../types';
import { frontQuest, withTrait } from './util';
import type { Ctx } from '../core';

const traitIn = (s: GameState, trait: string) => withTrait(s, enemiesInPlay(s), trait);
const isDread = (s: GameState, id?: string) => !!id && cardTraits(s, id).includes('Dread');

/** 結束一個回合內持續效果 (一次性的「抵達時」效果用) */
function endLingering(ctx: Ctx, src: Source): void {
  ctx.s.lingering = ctx.s.lingering.filter((l) => `linger:${l.uid}` !== src.id);
}

/** 移動後在目的地放指示物 (Northwood Mountains、Stirith) */
defineLingering({
  key: 'location/onArrive',
  label: '抵達時在新地點放指示物',
  trigger: {
    event: 'Arrived',
    timing: 'when',
    mandatory: true,
    run: function* (ctx, src) {
      endLingering(ctx, src);
      const p = src.params ?? {};
      if (p.obstacles) yield* addObstacle(ctx, p.obstacles as number, 'EE-09', src.name);
      if (p.threatTokens) yield* addThreatTokens(ctx, p.threatTokens as number, 'EE-09', src.name);
    },
  },
});

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

defineCard('Ruins of Orseth', [
  {
    key: 'Ruins of Orseth/0',
    label: '每個 Threat token 多 1 個敵人接戰',
    modify: (s, _src, q, v) => (q.stat === 'engagement' ? v + s.world.location.threatTokens : v),
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

defineCard('Stillwood', [
  {
    key: 'Stillwood/0',
    label: '花 1 光移除 Treachery 1 Progress (每回合 1 次)',
    perRound: 1,
    active: {
      available: (s) => (s.world.treacheryProgress < 1 ? 'Treachery 沒有 Progress' : s.player.light < 1 ? '光不足' : null),
      run: function* (ctx) {
        yield* spendLight(ctx, 1, 'EE-05', 'Stillwood');
        yield* removeTreacheryProgress(ctx, 1, 'EE-05', 'Stillwood');
      },
    },
  },
]);

defineCard('Northwood Mountains', [
  {
    key: 'Northwood Mountains/0',
    label: 'Treachery 完成時受 2 傷',
    trigger: { event: 'TreacheryCompleted', timing: 'when', mandatory: true, run: (ctx) => dealSelfWound(ctx, 2, 'KC-24', 'Northwood Mountains') },
  },
  {
    key: 'Northwood Mountains/1',
    label: '離開後在目的地放 2 Obstacle',
    trigger: {
      event: 'DistanceResolved',
      timing: 'when',
      mandatory: true,
      run: function* (ctx, src) {
        addLingering(ctx, 'location/onArrive', src, { obstacles: 2 });
      },
    },
  },
]);

defineCard('Dunes of Galantir', [
  {
    key: 'Dunes of Galantir/0',
    label: '從北邊移動過來時 Path +1',
    uponArrival: function* (ctx, src) {
      const v = ctx.s.world.visited;
      const from = v.length >= 2 ? v[v.length - 2] : null;
      if (from && locationCard(from).coordinates.south < locationCard(src.cardId!).coordinates.south) yield* addPath(ctx, 1, 'T5', 'Dunes of Galantir');
      else ctx.log('T5', 'Dunes of Galantir：不是從北邊過來');
    },
  },
  {
    key: 'Dunes of Galantir/1',
    label: 'Fast 敵人翻開時視為 Slow',
    initiative: (_s, _src, _id, v, revealing) => (revealing && v === 'Fast' ? 'Slow' : v),
  },
]);

defineCard('Lake of Ire', [
  {
    key: 'Lake of Ire/0',
    label: 'Defend Phase 之後玩家區的 Ire 敵人回到任務區',
    phaseEnd: {
      phase: 'defend',
      mandatory: true,
      run: function* (ctx) {
        for (const id of withTrait(ctx.s, ctx.s.world.playerArea, 'Ire')) yield* enemyToQuest(ctx, id, 'effect', 'KC-12a');
      },
    },
  },
]);

defineCard('Helm’s Peak', [
  { key: 'Helm’s Peak/0', label: '抵達時：Obstacle +2', uponArrival: (ctx) => addObstacle(ctx, 2, 'T5', 'Helm’s Peak') },
  {
    key: 'Helm’s Peak/1',
    label: 'Fire 元素的卡當行動卡 +1 光',
    modify: (s, _src, q, v) => (q.stat === 'lightCost' && q.slot === 'action' && q.card && face(s, q.card).element === 'Fire' ? v + 1 : v),
  },
]);

defineCard('Pyrus', [
  { key: 'Pyrus/0', label: '抵達時：Path +1', uponArrival: (ctx) => addPath(ctx, 1, 'T5', 'Pyrus') },
  {
    key: 'Pyrus/1',
    label: 'Darkness Phase：在場每個 Pyrus 敵人 Treachery +1 Progress',
    phaseDuring: { phase: 'darkness', run: (ctx) => placeTreacheryProgress(ctx, traitIn(ctx.s, 'Pyrus').length, 'EE-18a', 'Pyrus') },
  },
]);

defineCard('Spellwood', [
  {
    key: 'Spellwood/0',
    label: '每個 Treachery Progress EV +1',
    modify: (s, src, q, v) => (q.stat === 'locationEV' && q.location === src.cardId ? v + s.world.treacheryProgress : v),
  },
]);

defineCard('Way of Madness', [
  {
    key: 'Way of Madness/0',
    label: '抵達時：玩家區敵人回到任務區，再從後端同樣數量的敵人接戰',
    uponArrival: function* (ctx) {
      const w = ctx.s.world;
      const k = w.playerArea.length;
      for (const id of w.playerArea.slice().reverse()) yield* enemyToQuest(ctx, id, 'effect', 'T5');
      yield* engageEnemies(ctx, w.questArea.slice(0, k), 'T5', 'engage');
    },
  },
]);

defineCard('Everkil', [
  {
    key: 'Everkil/0',
    label: '所有玩家卡防禦值為 1',
    modify: (_s, _src, q, v) => (q.stat === 'cardDefenseFinal' ? 1 : v),
  },
  {
    key: 'Everkil/1',
    label: 'Attack Phase 結束時玩家區沒有敵人：任務區最前面的敵人接戰',
    phaseEnd: {
      phase: 'attack',
      mandatory: true,
      run: function* (ctx) {
        if (ctx.s.world.playerArea.length) return;
        yield* engageEnemies(ctx, frontQuest(ctx.s, 1), 'KC-12a', 'engage');
      },
    },
  },
]);

defineCard('Garadeth', [
  { key: 'Garadeth/0', label: '抵達時：Obstacle +1', uponArrival: (ctx) => addObstacle(ctx, 1, 'T5', 'Garadeth') },
  {
    key: 'Garadeth/1',
    label: 'Engagement Phase 結束時玩家區的 Garadeth 敵人回到任務區',
    phaseEnd: {
      phase: 'engagement',
      mandatory: true,
      run: function* (ctx) {
        for (const id of withTrait(ctx.s, ctx.s.world.playerArea, 'Garadeth')) yield* enemyToQuest(ctx, id, 'effect', 'KC-12a');
      },
    },
  },
]);

defineCard('The Deep Forest', [
  { key: 'The Deep Forest/0', label: '抵達時：Threat token +1', uponArrival: (ctx) => addThreatTokens(ctx, 1, 'T5', 'The Deep Forest') },
  {
    key: 'The Deep Forest/1',
    label: 'Refresh Phase 結束時每個 Threat token 失去 1 光',
    phaseEnd: { phase: 'refresh', mandatory: true, run: (ctx) => loseLight(ctx, ctx.s.world.location.threatTokens, 'KC-12a', 'The Deep Forest') },
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

defineCard('Eldirith Mountains', [
  {
    key: 'Eldirith Mountains/0',
    label: '抵達的下一回合起：Refresh Phase 開始時每個已完成 Treachery 失去 1 光',
    phaseStart: {
      phase: 'refresh',
      mandatory: true,
      run: function* (ctx, src) {
        const envy = !!src.params?.envy;
        if (!envy && ctx.s.round <= ctx.s.world.arrivalRound) {
          ctx.log('KC-12a', 'Eldirith Mountains：抵達的回合，還沒生效');
          return;
        }
        yield* loseLight(ctx, ctx.s.world.completedTreacheries.length, 'KC-12a', 'Eldirith Mountains');
      },
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
    modify: (s, _src, q, v) => (q.stat === 'enemyDarkness' && isDread(s, q.enemy) ? v + 2 : v),
  },
]);

defineCard('Flats of Mil-Bereth', [
  {
    key: 'Flats of Mil-Bereth/0',
    label: 'Refresh Phase：任務區每個 Tracker 敵人 Threat token +1',
    phaseDuring: { phase: 'refresh', run: (ctx) => addThreatTokens(ctx, withTrait(ctx.s, ctx.s.world.questArea, 'Tracker').length, 'EE-18a', 'Flats of Mil-Bereth') },
  },
]);

defineCard('Hillcrest', [
  {
    key: 'Hillcrest/0',
    label: 'Staging Phase 結束時 Fire 敵人治療 1',
    phaseEnd: {
      phase: 'staging',
      mandatory: true,
      run: function* (ctx) {
        for (const id of traitIn(ctx.s, 'Fire')) healEnemy(ctx, id, 1, 'KC-12a', 'Hillcrest');
      },
    },
  },
  {
    key: 'Hillcrest/1',
    label: '打出 Fire 元素加成卡後 Path +1',
    trigger: {
      event: 'CardPlayed',
      timing: 'after',
      mandatory: true,
      filter: (s, _src, ev) => ev.slot === 'booster' && face(s, ev.card as string).element === 'Fire',
      run: (ctx) => addPath(ctx, 1, 'EE-10', 'Hillcrest'),
    },
  },
]);

defineCard('The Barren Hills', [
  {
    key: 'The Barren Hills/0',
    label: '加成卡元素不會啟動 Earth 或 Wind 技能',
    blocksSkillElements: ['Earth', 'Wind'],
  },
]);

defineCard('Druidane River', [
  {
    key: 'Druidane River/0',
    label: '在這個地點放 Progress 時 Treachery +1 Progress (玩家區沒有敵人時忽略)',
    trigger: {
      event: 'ProgressPlaced',
      timing: 'when',
      mandatory: true,
      filter: (s, _src, ev) => ev.target === 'location' && s.world.playerArea.length > 0,
      run: (ctx) => placeTreacheryProgress(ctx, 1, 'EE-09', 'Druidane River'),
    },
  },
]);

defineCard('Eirid Desert', [
  {
    key: 'Eirid Desert/0',
    label: '抵達時：在場每個 Sol 敵人 Threat token +1',
    uponArrival: (ctx) => addThreatTokens(ctx, traitIn(ctx.s, 'Sol').length, 'T5', 'Eirid Desert'),
  },
]);

defineCard('The Dark River', [
  { key: 'The Dark River/0', label: '抵達時：Threat token +2', uponArrival: (ctx) => addThreatTokens(ctx, 2, 'T5', 'The Dark River') },
]);

defineCard('Stirith', [
  {
    key: 'Stirith/0',
    label: '往南移動時 Threat token 帶到目的地',
    trigger: {
      event: 'DistanceResolved',
      timing: 'when',
      mandatory: true,
      filter: (s, src, ev) => locationCard(ev.dest as string).coordinates.south > locationCard(src.cardId!).coordinates.south && s.world.location.threatTokens > 0,
      run: function* (ctx, src) {
        addLingering(ctx, 'location/onArrive', src, { threatTokens: ctx.s.world.location.threatTokens });
      },
    },
  },
  {
    key: 'Stirith/1',
    label: '往東移動前 Obstacle +1',
    trigger: {
      event: 'WillResolveDistance',
      timing: 'will',
      mandatory: true,
      filter: (_s, src, ev) => locationCard(ev.dest as string).coordinates.east > locationCard(src.cardId!).coordinates.east,
      run: function* (ctx, _src, ev) {
        yield* addObstacle(ctx, 1, 'EE-09', 'Stirith');
        if (!flag(ctx.s, 'ignoreObstaclesTravel')) ev.distance = (ev.distance as number) + 1;
      },
    },
  },
]);

defineCard('Northwood City', [
  {
    key: 'Northwood City/0',
    label: 'Refresh 產光：可以放棄部分產光；每產 2 光 Treachery +1 Progress',
    trigger: {
      event: 'WillProduceLight',
      timing: 'will',
      mandatory: true,
      run: function* (ctx, _src, ev) {
        const n = ev.n as number;
        if (n <= 0) return;
        const forgo = yield* ctx.chooseNumber('EE-03', `Northwood City：放棄多少產光？(產 ${n}，每 2 光 Treachery +1)`, 0, n);
        ev.n = n - forgo;
        if (forgo) ctx.log('EE-03', `Northwood City：放棄 ${forgo} 光產出`);
      },
    },
  },
  {
    key: 'Northwood City/1',
    label: '每產 2 光 Treachery +1 Progress',
    trigger: {
      event: 'LightProduced',
      timing: 'when',
      mandatory: true,
      run: (ctx, _src, ev) => placeTreacheryProgress(ctx, Math.floor((ev.n as number) / 2), 'EE-09', 'Northwood City'),
    },
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

defineCard('Thretin', [
  {
    key: 'Thretin/0',
    label: '抵達時：在場每個 Thretin 敵人失去 1 光，Path +1',
    uponArrival: function* (ctx) {
      yield* loseLight(ctx, traitIn(ctx.s, 'Thretin').length, 'T5', 'Thretin');
      yield* addPath(ctx, 1, 'T5', 'Thretin');
    },
  },
]);

defineCard('Terrimor', [
  { key: 'Terrimor/0', label: '抵達時：Obstacle +3', uponArrival: (ctx) => addObstacle(ctx, 3, 'T5', 'Terrimor') },
  {
    key: 'Terrimor/1',
    label: 'Terrimorian 敵人 +2 HP',
    modify: (s, _src, q, v) => (q.stat === 'enemyHP' && q.enemy && cardTraits(s, q.enemy).includes('Terrimorian') ? v + 2 : v),
  },
]);

defineCard('Pit of Shada', [
  {
    key: 'Pit of Shada/0',
    label: '抵達時：所有 Shadian 敵人立即接戰',
    uponArrival: (ctx) => engageEnemies(ctx, withTrait(ctx.s, ctx.s.world.questArea, 'Shadian').reverse(), 'T5'),
  },
  {
    key: 'Pit of Shada/1',
    label: 'Dread 敵人 +2 攻擊',
    modify: (s, _src, q, v) => (q.stat === 'enemyAttack' && isDread(s, q.enemy) ? v + 2 : v),
  },
]);

defineCard('Sheer Valley', [
  { key: 'Sheer Valley/0', label: '抵達時：Threat token +2', uponArrival: (ctx) => addThreatTokens(ctx, 2, 'T5', 'Sheer Valley') },
  {
    key: 'Sheer Valley/1',
    label: '玩家卡防禦值減半 (無條件進位)',
    modify: (_s, _src, q, v) => (q.stat === 'cardDefenseFinal' ? Math.ceil(v / 2) : v),
  },
]);

defineCard('Terra Lake', [
  {
    key: 'Terra Lake/0',
    label: '移動到這裡距離 +1',
    modify: (_s, _src, q, v) => (q.stat === 'distanceHere' ? v + 1 : v),
  },
  {
    key: 'Terra Lake/1',
    label: '每回合少 2 個敵人接戰',
    modify: (_s, _src, q, v) => (q.stat === 'engagement' ? v - 2 : v),
  },
  {
    key: 'Terra Lake/2',
    label: 'Wind 元素的卡打出 +1 光',
    modify: (s, _src, q, v) => (q.stat === 'lightCost' && q.card && face(s, q.card).element === 'Wind' ? v + 1 : v),
  },
]);

defineCard('Molta', [
  {
    key: 'Molta/0',
    label: '抵達時：所有 Moltan 敵人立即接戰',
    uponArrival: (ctx) => engageEnemies(ctx, withTrait(ctx.s, ctx.s.world.questArea, 'Moltan').reverse(), 'T5'),
  },
  {
    key: 'Molta/1',
    label: 'Dread 敵人 +3 HP',
    modify: (s, _src, q, v) => (q.stat === 'enemyHP' && isDread(s, q.enemy) ? v + 3 : v),
  },
]);

defineCard('Highwall Canyon', [
  {
    key: 'Highwall Canyon/0',
    label: '這個地點沒有 Threat token 時，Staging 翻敵人威脅 +3',
    modify: (s, src, q, v) => {
      if (q.stat !== 'threat') return v;
      const loc = s.world.location.id === src.cardId ? s.world.location : s.world.envyLocations.find((l) => l.id === src.cardId);
      return loc && loc.threatTokens === 0 ? v + 3 : v;
    },
  },
]);

defineCard('Darkwind', [
  {
    key: 'Darkwind/0',
    label: '抵達時：橫置 1 個技能或 Treachery +2 Progress；然後在場每個 Dread 敵人 Treachery +1',
    uponArrival: function* (ctx) {
      const s = ctx.s;
      const ready = s.player.skills.some((k) => !k.exhausted);
      yield* chooseNegative(ctx, 'KC-12f', 'Darkwind', [
        { id: 'skill', label: '橫置 1 個技能', resolvable: ready ? 'full' : 'none', run: () => chooseExhaustSkillGen(ctx) },
        { id: 'treachery', label: 'Treachery +2 Progress', resolvable: s.world.activeTreachery ? 'full' : 'none', run: () => placeTreacheryProgress(ctx, 2, 'T5', 'Darkwind') },
      ]);
      yield* placeTreacheryProgress(ctx, traitIn(s, 'Dread').length, 'T5', 'Darkwind');
    },
  },
]);

function* chooseExhaustSkillGen(ctx: Ctx) {
  yield* chooseExhaustSkill(ctx, 'T5', 'Darkwind：橫置 1 個技能');
}

defineCard('Nul-Gador', [
  {
    key: 'Nul-Gador/0',
    label: '威脅 + 已完成 Treachery 數',
    modify: (s, _src, q, v) => (q.stat === 'threat' ? v + s.world.completedTreacheries.length : v),
  },
  {
    key: 'Nul-Gador/1',
    label: 'Dread 敵人 +1 PhysicalDefense、+1 PhotonicDefense (兩種攻擊類型，P7-01a)',
    extraTypes: (s, _src, id) => (isDread(s, id) ? ['Physical', 'Photonic'] : []),
    modify: (s, _src, q, v) => (q.stat === 'enemyDefense' && isDread(s, q.enemy) ? v + 1 : v),
  },
]);
