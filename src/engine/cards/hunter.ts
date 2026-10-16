// Hunter：卡片 (基礎面 / 進階面 `+`) 與技能。trap 卡附著在敵人身上後 Eager 效果生效。
// Tracked：敵人的 Progress ≥ Darkness (KC-30)。
import { enemyAttack, enemyDarkness, enemyInitiative, exploreBoost, handSize, isTracked, isTrapped, printedMain } from '../calc';
import { cardName, locationCard } from '../data';
import { applyMods, defineCard, defineLingering, defineSkill, findSkill, flag, type EffectDef, type Source } from '../effects';
import {
  addEnemyProgress,
  addLingering,
  chooseCards,
  chooseEnemy,
  discardPlayerCard,
  distribute,
  engageEnemies,
  gainXP,
  pull,
  push,
  readySkill,
  removeEnemyProgress,
  removeLocationProgress,
  woundEnemy,
} from '../ops';
import { recruit } from '../window';
import { checkExplored, placeLocationProgress } from '../world';
import type { GameState } from '../types';
import { attachWithTrait, enemiesInPlay, enemyAttacksEnemy, inArea, playerEnemies, questEnemies, roundMod, spendBeacons } from './util';

const host = (src: Source) => src.params?.attachedTo as string | undefined;
const isHost = (src: Source, id?: string) => !!id && host(src) === id;

/** 附著時才有效的 Eager 被動 */
function attachedPassive(key: string, label: string, modify: EffectDef['modify']): EffectDef {
  return { key, label, type: 'EagerPassive', modify: (s, src, q, v) => (host(src) ? modify!(s, src, q, v) : v) };
}

// ---------------------------------------------------------------- Double Back

defineCard('Double Back', [
  {
    key: 'Double Back/0',
    label: '把地點任意數量的 Progress 移到玩家區 1 個敵人身上',
    type: '1x',
    active: {
      run: function* (ctx) {
        const s = ctx.s;
        const e = yield* chooseEnemy(ctx, 'KC-11', 'Double Back：移到哪個敵人？', playerEnemies(s));
        if (!e) return;
        const n = yield* ctx.chooseNumber('KC-11', 'Double Back：移幾個 Progress？', 0, s.world.location.progress);
        const k = yield* removeLocationProgress(ctx, n, 'KC-11', 'Double Back');
        yield* checkExplored(ctx);
        yield* addEnemyProgress(ctx, e, k, 'KC-11', 'Double Back');
      },
    },
  },
  attachedPassive('Double Back/1', '附著時：這個敵人 −2 PhysicalDefense', (_s, src, q, v) =>
    q.stat === 'enemyDefense' && q.attackType === 'Physical' && isHost(src, q.enemy) ? v - 2 : v,
  ),
]);

defineCard('Double Back+', [
  {
    key: 'Double Back+/0',
    label: '移除 1 個敵人所有 Progress，造成等量傷害',
    type: '1x',
    active: {
      run: function* (ctx) {
        const e = yield* chooseEnemy(ctx, 'KC-11', 'Double Back：哪個敵人？', enemiesInPlay(ctx.s).filter((x) => ctx.s.world.enemies[x].progress > 0));
        if (!e) return;
        const n = yield* removeEnemyProgress(ctx, e, 99, 'KC-11', 'Double Back');
        yield* woundEnemy(ctx, e, n, 'direct', 'KC-25');
      },
    },
  },
  attachedPassive('Double Back+/1', '附著時：Track the Enemy 可以用 MainExplore 代替 ExploreBoost', (_s, _src, q, v) =>
    q.stat === 'flag' && q.flag === 'trackUsesMainExplore' ? v + 1 : v,
  ),
]);

// ---------------------------------------------------------------- Farsight

defineCard('Farsight', [
  {
    key: 'Farsight/0',
    label: '本回合只能攻擊 1 個敵人，不能 push 敵人',
    type: 'Passive',
    restrict: (s, _src, r) => {
      if (r.kind === 'push') return 'Farsight：本回合不能 push 敵人';
      if (r.kind === 'attack' && s.roundState.attackedThisPhase.length >= 1 && !s.roundState.attackedThisPhase.includes(r.enemy))
        return 'Farsight：本回合只能攻擊 1 個敵人';
      return null;
    },
  },
  {
    key: 'Farsight/1',
    label: '攻擊任務區 1 個敵人；MainAttack + 玩家區 Fast 敵人的攻擊總和',
    type: '1x',
    active: {
      phases: ['attack'],
      run: function* (ctx, src) {
        const s = ctx.s;
        s.roundState.questAttacks += 1;
        const fast = s.world.playerArea.filter((e) => enemyInitiative(s, e) === 'Fast');
        roundMod(ctx, src, 'mainAttack', fast.reduce((n, e) => n + enemyAttack(s, e), 0));
        ctx.log('KC-11', 'Farsight：可以用 AP 攻擊任務區 1 個敵人');
      },
    },
  },
]);

defineCard('Farsight+', [
  {
    key: 'Farsight+/0',
    label: '棄 1 張進階面卡 (可以是牌庫頂端) 來 Recruit',
    type: '1x',
    active: {
      run: function* (ctx) {
        const s = ctx.s;
        const adv = (id: string) => s.player.upgraded.includes(id);
        const cands = s.player.hand.filter(adv);
        const top = s.player.deck[0];
        const opts = [...cands.map((id) => ({ id, label: cardName(id) })), ...(top && adv(top) ? [{ id: 'top', label: `牌庫頂端 ${cardName(top)}` }] : [])];
        if (!opts.length) {
          ctx.log('KC-12c', 'Farsight：沒有進階面的卡可以棄');
          return;
        }
        const pick = yield* ctx.choose('KC-11', 'Farsight：棄哪張進階面卡？', opts);
        const id = pick === 'top' ? top! : pick;
        yield* discardPlayerCard(ctx, id, pick === 'top' ? 'deckTop' : 'hand', 'KC-11');
        yield* recruit(ctx, 'KC-11');
      },
    },
  },
  attachedPassive('Farsight+/1', '附著時：這個敵人 −5 HP (最少 1)', (_s, src, q, v) => (q.stat === 'enemyHP' && isHost(src, q.enemy) ? Math.max(1, v - 5) : v)),
]);

// ---------------------------------------------------------------- Unfailing Stamina

/** 本回合補牌時是否需要重洗 (會前進腐化) */
function willReshuffle(s: GameState): boolean {
  return s.player.deck.length < handSize(s) - s.player.hand.length;
}

defineCard('Unfailing Stamina', [
  {
    key: 'Unfailing Stamina/0',
    label: '本回合會前進腐化時 Recruit',
    type: '1x',
    active: {
      phases: ['refresh'],
      available: (s) => (willReshuffle(s) ? null : '本回合補牌不會重洗 (不會前進腐化)'),
      run: (ctx) => recruit(ctx, 'KC-11'),
    },
  },
  attachedPassive('Unfailing Stamina/1', '附著時：這個敵人 −1 攻擊', (_s, src, q, v) => (q.stat === 'enemyAttack' && isHost(src, q.enemy) ? v - 1 : v)),
]);

defineCard('Unfailing Stamina+', [
  {
    key: 'Unfailing Stamina+/0',
    label: 'MainAttack + 所有 tracked 敵人的攻擊總和',
    type: '1x',
    active: {
      run: function* (ctx, src) {
        const s = ctx.s;
        roundMod(ctx, src, 'mainAttack', enemiesInPlay(s).filter((e) => isTracked(s, e)).reduce((n, e) => n + enemyAttack(s, e), 0));
      },
    },
  },
  {
    key: 'Unfailing Stamina+/1',
    label: '附著時：同區其他敵人各 +1 Progress',
    type: 'Eager1x',
    active: {
      available: (_s, src) => (host(src) ? null : '沒有附著在敵人身上'),
      run: function* (ctx, src) {
        const s = ctx.s;
        const h = host(src)!;
        const area = inArea(s, h) === 'quest' ? questEnemies(s) : playerEnemies(s);
        for (const e of area) if (e !== h) yield* addEnemyProgress(ctx, e, 1, 'KC-11', 'Unfailing Stamina');
      },
    },
  },
]);

// ---------------------------------------------------------------- Arcing Shot

defineCard('Arcing Shot', [
  {
    key: 'Arcing Shot/0',
    label: 'Action Set 結束：任務區最左邊的敵人接戰',
    type: '1x',
    phaseEnd: {
      phase: 'actionSet',
      mandatory: false,
      run: function* (ctx) {
        const e = ctx.s.world.questArea[0];
        if (!e) return;
        ctx.s.roundState.flags.arcingShotDarkness = enemyDarkness(ctx.s, e);
        yield* engageEnemies(ctx, [e], 'KC-11', 'engage');
      },
    },
  },
  {
    key: 'Arcing Shot/1',
    label: '攻擊可以包含任務區 1 個敵人；攻擊 + 上面接戰的敵人的 Darkness',
    type: '1x',
    active: {
      phases: ['attack'],
      run: function* (ctx, src) {
        ctx.s.roundState.questAttacks += 1;
        roundMod(ctx, src, 'mainAttack', ctx.s.roundState.flags.arcingShotDarkness ?? 0);
      },
    },
  },
]);

defineLingering({
  key: 'Arcing Shot+/auto',
  label: '攻擊任務區的敵人時它自動受 3 傷',
  trigger: {
    event: 'EnemyAttackedByYou',
    timing: 'when',
    mandatory: true,
    filter: (_s, _src, ev) => ev.zone === 'quest',
    run: (ctx, _src, ev) => woundEnemy(ctx, ev.enemy as string, 3, 'direct', 'KC-25'),
  },
});

defineCard('Arcing Shot+', [
  {
    key: 'Arcing Shot+/0',
    label: '可以攻擊任務區最多 3 個敵人，它們自動受 3 傷',
    type: '1x',
    active: {
      phases: ['attack'],
      run: function* (ctx, src) {
        ctx.s.roundState.questAttacks += 3;
        addLingering(ctx, 'Arcing Shot+/auto', src);
      },
    },
  },
  { key: 'Arcing Shot+/1', label: '附著時：忽略這個敵人的效果', type: 'EagerPassive', ignoresHost: true },
]);

// ---------------------------------------------------------------- Lay of the Land

defineCard('Lay of the Land', [
  {
    key: 'Lay of the Land/0',
    label: '在玩家區敵人身上放 Progress，總數 = 地點座標和',
    type: '1x',
    active: {
      run: function* (ctx) {
        const s = ctx.s;
        const c = locationCard(s.world.location.id).coordinates;
        const dist = yield* distribute(ctx, 'KC-11', 'Lay of the Land：Progress 放在哪個敵人', playerEnemies(s), c.east + c.south);
        for (const [e, k] of Object.entries(dist)) yield* addEnemyProgress(ctx, e, k, 'KC-11', 'Lay of the Land');
      },
    },
  },
  {
    key: 'Lay of the Land/1',
    label: '附著時：在地點放等於這個敵人 Darkness 的 Progress',
    type: 'Eager1x',
    active: {
      phases: ['explore'],
      available: (_s, src) => (host(src) ? null : '沒有附著在敵人身上'),
      run: (ctx, src) => placeLocationProgress(ctx, enemyDarkness(ctx.s, host(src)!), 'KC-11', 'Lay of the Land'),
    },
  },
]);

defineCard('Lay of the Land+', [
  {
    key: 'Lay of the Land+/0',
    label: 'Immobilize 重新 Ready；本回合忽略 trapped 敵人的效果',
    type: '1x',
    active: {
      run: function* (ctx) {
        const sk = findSkill(ctx.s, 'Immobilize');
        if (sk) yield* readySkill(ctx, sk, 'KC-11');
        ctx.s.roundState.flags.ignoreTrapped = 1;
        ctx.log('EE-06', '本回合忽略 trapped 敵人的效果');
      },
    },
  },
  {
    key: 'Lay of the Land+/1',
    label: '附著時：移動距離 −2',
    type: 'Eager1x',
    trigger: {
      event: 'WillResolveDistance',
      timing: 'will',
      mandatory: false,
      filter: (_s, src) => !!host(src),
      run: function* (_ctx, _src, ev) {
        ev.distance = (ev.distance as number) - 2;
      },
    },
  },
]);

// ---------------------------------------------------------------- Trap of Madness

defineCard('Trap of Madness', [
  {
    key: 'Trap of Madness/0',
    label: '附著時：Attack 開始，這個敵人攻擊同區另 1 個敵人，然後攻擊自己',
    type: 'EagerMandatory1x',
    phaseStart: {
      phase: 'attack',
      mandatory: true,
      run: function* (ctx, src) {
        const h = host(src);
        if (!h) return;
        const s = ctx.s;
        const area = (inArea(s, h) === 'quest' ? questEnemies(s) : playerEnemies(s)).filter((e) => e !== h);
        const t = yield* chooseEnemy(ctx, 'KC-11', 'Trap of Madness：攻擊哪個敵人？', area);
        if (t) yield* enemyAttacksEnemy(ctx, h, t, 'KC-11');
        yield* enemyAttacksEnemy(ctx, h, h, 'KC-11');
      },
    },
  },
]);

defineCard('Trap of Madness+', [
  {
    key: 'Trap of Madness+/0',
    label: '移除敵人身上的 Progress 後，每個對它造成 3 傷',
    type: 'MandatoryUnrestricted',
    trigger: {
      event: 'ProgressRemoved',
      timing: 'after',
      mandatory: true,
      filter: (s, _src, ev) => ev.target === 'enemy' && !!s.world.enemies[ev.enemy as string],
      run: (ctx, _src, ev) => woundEnemy(ctx, ev.enemy as string, 3 * (ev.n as number), 'direct', 'KC-25'),
    },
  },
  {
    key: 'Trap of Madness+/1',
    label: '附著時：本回合接戰的敵人數 ±3 以內',
    type: 'Eager1x',
    active: {
      available: (_s, src) => (host(src) ? null : '沒有附著在敵人身上'),
      run: function* (ctx, src) {
        const k = yield* ctx.chooseNumber('KC-11', 'Trap of Madness：接戰數改變多少？(−3 ~ +3)', -3, 3);
        roundMod(ctx, src, 'engagement', k);
      },
    },
  },
]);

// ---------------------------------------------------------------- 技能

defineSkill('Track the Enemy', [
  {
    key: 'Track the Enemy',
    label: '在玩家區敵人身上放等於 ExploreBoost 的 Progress，自由分配',
    type: '1x',
    active: {
      run: function* (ctx) {
        const s = ctx.s;
        let n = exploreBoost(s);
        if (flag(s, 'trackUsesMainExplore')) {
          const me = applyMods(s, { stat: 'mainExplore' }, printedMain(s, s.player.actionSet.explore, 'explore'));
          const pick = yield* ctx.choose('KC-18', 'Track the Enemy：用哪個數值？', [
            { id: 'boost', label: `ExploreBoost (${n})` },
            { id: 'main', label: `MainExplore (${me})` },
          ]);
          if (pick === 'main') n = me;
        }
        const dist = yield* distribute(ctx, 'KC-18', 'Track the Enemy：Progress 放在哪個敵人', playerEnemies(s), n);
        for (const [e, k] of Object.entries(dist)) yield* addEnemyProgress(ctx, e, k, 'KC-18', 'Track the Enemy');
      },
    },
  },
]);

defineSkill('Baiting Game', [
  {
    key: 'Baiting Game',
    label: '從手牌或棄牌堆附著 trap 卡到任意數量的 tracked 敵人',
    type: '1x',
    active: {
      run: function* (ctx) {
        const s = ctx.s;
        for (const e of enemiesInPlay(s).filter((x) => isTracked(s, x))) {
          const go = yield* ctx.choose('KC-18', `Baiting Game：附著 trap 到 ${cardName(e)}？`, [
            { id: 'yes', label: '附著' },
            { id: 'no', label: '不要' },
          ]);
          if (go === 'yes' && !(yield* attachWithTrait(ctx, 'Trap', e, 'KC-17', true))) break;
        }
      },
    },
  },
]);

defineSkill('Stealth Tactics', [
  {
    key: 'Stealth Tactics',
    label: '花 1 個信標，接戰的敵人少 2 個',
    type: 'Unrestricted',
    active: {
      phases: ['engagement'],
      available: (s) => (s.player.beacons.length ? null : '沒有信標'),
      run: function* (ctx, src) {
        const used = yield* spendBeacons(ctx, 1, 1, 'KC-18', 'Stealth Tactics');
        if (used.length) roundMod(ctx, src, 'engagement', -2);
      },
    },
  },
]);

defineSkill('Winding Paths', [
  {
    key: 'Winding Paths',
    label: '任意數量 tracked 敵人各棄 1 Progress 來 push 或 pull 它',
    type: '1x',
    active: {
      run: function* (ctx) {
        const s = ctx.s;
        const ids = yield* chooseCards(ctx, 'KC-18', 'Winding Paths：選擇 tracked 敵人', enemiesInPlay(s).filter((x) => isTracked(s, x) && s.world.enemies[x].progress > 0), 0, 99);
        for (const e of ids) {
          yield* removeEnemyProgress(ctx, e, 1, 'KC-18', 'Winding Paths');
          if (s.world.playerArea.includes(e)) yield* push(ctx, e, 'KC-04');
          else yield* pull(ctx, e, 'KC-04');
        }
      },
    },
  },
]);

defineSkill('Immobilize', [
  {
    key: 'Immobilize',
    label: 'trapped 敵人的 Darkness 與攻擊變為 0',
    type: 'Passive',
    modify: (s, _src, q, v) => ((q.stat === 'enemyDarknessFinal' || q.stat === 'enemyAttackFinal') && q.enemy && isTrapped(s, q.enemy) ? 0 : v),
  },
]);

defineSkill('Side Quests', [
  {
    key: 'Side Quests',
    label: '任務區每個敵人得 1 XP',
    type: '1x',
    active: { phases: ['refresh'], run: (ctx) => gainXP(ctx, ctx.s.world.questArea.length, 'KC-18', 'Side Quests') },
  },
]);

defineSkill('Reprioritize', [
  {
    key: 'Reprioritize',
    label: '玩家區每個 trapped 敵人攻擊任務區 1 個敵人；然後所有敵人的 Progress 移到地點',
    type: '1x',
    active: {
      run: function* (ctx) {
        const s = ctx.s;
        for (const a of playerEnemies(s).filter((e) => isTrapped(s, e))) {
          const t = yield* chooseEnemy(ctx, 'KC-18', `Reprioritize：${cardName(a)} 攻擊哪個敵人？`, questEnemies(s));
          if (t) yield* enemyAttacksEnemy(ctx, a, t, 'KC-18');
        }
        let n = 0;
        for (const e of enemiesInPlay(s)) n += yield* removeEnemyProgress(ctx, e, 99, 'KC-18', 'Reprioritize');
        yield* placeLocationProgress(ctx, n, 'KC-18', 'Reprioritize');
      },
    },
  },
]);

