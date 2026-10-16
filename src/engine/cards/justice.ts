// Justice：卡片 (基礎面 / 進階面 `+`) 與技能。
import { actionSetTraits, cardDefense, cardTraits, actionSetCards, attackBoost, exploreBoost } from '../calc';
import { ALL_TRAITS, cardName, enemyCard } from '../data';
import { defineCard, defineLingering, defineSkill } from '../effects';
import {
  addLingering,
  addThreatTokens,
  chooseEnemies,
  chooseEnemy,
  dealSelfWound,
  defeatEnemy,
  gainLight,
  grantTrait,
  pull,
  removeObstacle,
  revealEnemy,
  spendLight,
  woundEnemy,
} from '../ops';
import { placeLocationProgress } from '../world';
import { enemyInitiative } from '../calc';
import { attackCard, grantAttackTraits, playerEnemies, roundMod } from './util';

// ---------------------------------------------------------------- Ember Strike

defineCard('Ember Strike', [
  {
    key: 'Ember Strike/0',
    label: '受 1 傷 +2 MainAttack，或受 2 傷 +4 MainAttack',
    type: '1x',
    rule: 'KC-24',
    active: {
      run: function* (ctx, src) {
        const pick = yield* ctx.choose('KC-11', 'Ember Strike', [
          { id: '1', label: '受 1 傷：+2 MainAttack' },
          { id: '2', label: '受 2 傷：+4 MainAttack' },
        ]);
        const n = Number(pick);
        yield* dealSelfWound(ctx, n, 'KC-24', 'Ember Strike');
        roundMod(ctx, src, 'mainAttack', 2 * n);
      },
    },
  },
  {
    key: 'Ember Strike/1',
    label: '受 1 傷，給攻擊卡 1 個特質',
    type: '1x',
    active: {
      available: (s) => (attackCard(s) ? null : '沒有攻擊卡'),
      run: function* (ctx) {
        yield* dealSelfWound(ctx, 1, 'KC-24', 'Ember Strike');
        yield* grantAttackTraits(ctx, 1);
      },
    },
  },
]);

defineCard('Ember Strike+', [
  {
    key: 'Ember Strike+/0',
    label: '受 3 傷，AttackBoost 變 3 倍',
    type: '1x',
    active: {
      run: function* (ctx, src) {
        yield* dealSelfWound(ctx, 3, 'KC-24', 'Ember Strike');
        roundMod(ctx, src, 'attackBoost', 2 * attackBoost(ctx.s));
      },
    },
  },
  {
    key: 'Ember Strike+/1',
    label: '給攻擊卡 1 個特質',
    type: '1x',
    active: { available: (s) => (attackCard(s) ? null : '沒有攻擊卡'), run: (ctx) => grantAttackTraits(ctx, 1) },
  },
]);

// ---------------------------------------------------------------- Cold Roar

defineCard('Cold Roar', [
  {
    key: 'Cold Roar/0',
    label: '本回合每擊敗 2 個敵人後摧毀 1 個 Obstacle',
    type: 'Passive',
    trigger: {
      event: 'EnemyDefeated',
      timing: 'after',
      mandatory: true,
      filter: (s) => s.roundState.defeatedCount > 0 && s.roundState.defeatedCount % 2 === 0,
      run: function* (ctx) {
        yield* removeObstacle(ctx, 1, 'EE-10', 'Cold Roar', true);
      },
    },
  },
  {
    key: 'Cold Roar/1',
    label: 'Obstacle 被摧毀後 Pull 1 個敵人',
    type: 'Unrestricted',
    trigger: {
      event: 'ObstacleDestroyed',
      timing: 'after',
      mandatory: false,
      filter: (s) => s.world.questArea.length > 0,
      run: function* (ctx, _src, ev) {
        for (let i = 0; i < ((ev.n as number) ?? 1); i++) {
          const id = yield* chooseEnemy(ctx, 'KC-04', 'Cold Roar：Pull 1 個敵人', ctx.s.world.questArea);
          if (id) yield* pull(ctx, id, 'KC-04');
        }
      },
    },
  },
]);

defineCard('Cold Roar+', [
  {
    key: 'Cold Roar+/0',
    label: '對自己造成最多 3 傷，每 1 傷 Pull 1 個敵人；被拉的敵人把特質給玩家區其他敵人',
    type: '1x',
    active: {
      run: function* (ctx) {
        const n = yield* ctx.chooseNumber('KC-24', 'Cold Roar：對自己造成幾點傷害？', 0, 3);
        if (!n) return;
        yield* dealSelfWound(ctx, n, 'KC-24', 'Cold Roar');
        const pulled: string[] = [];
        for (let i = 0; i < n; i++) {
          const id = yield* chooseEnemy(ctx, 'KC-04', `Cold Roar：Pull 敵人 (${i + 1}/${n})`, ctx.s.world.questArea);
          if (!id) break;
          yield* pull(ctx, id, 'KC-04');
          pulled.push(id);
        }
        const s = ctx.s;
        for (const p of pulled) {
          const traits = cardTraits(s, p);
          for (const o of s.world.playerArea) {
            if (o === p) continue;
            for (const t of traits) if (!cardTraits(s, o).includes(t)) s.roundState.grantedTraits.push({ target: o, trait: t });
          }
          ctx.log('KC-16', `${cardName(p)} 的特質 (${traits.join('、')}) 給玩家區其他敵人`);
        }
      },
    },
  },
]);

// ---------------------------------------------------------------- Useful Rage

defineCard('Useful Rage', [
  {
    key: 'Useful Rage/0',
    label: 'Defend Phase 結束：對玩家區 1 個敵人造成 3X 傷害 (X = 本回合防禦用的卡數)',
    type: '1x',
    phaseEnd: {
      phase: 'defend',
      mandatory: false,
      run: function* (ctx) {
        const x = ctx.s.roundState.defendedWithCount;
        const id = yield* chooseEnemy(ctx, 'KC-25', `Useful Rage：${3 * x} 傷害給誰？`, playerEnemies(ctx.s));
        if (id) yield* woundEnemy(ctx, id, 3 * x, 'direct', 'KC-25');
      },
    },
  },
]);

defineCard('Useful Rage+', [
  {
    key: 'Useful Rage+/0',
    label: 'MainAttack +2X (X = 行動組卡片的防禦值總和)',
    type: '1x',
    active: {
      run: function* (ctx, src) {
        const x = actionSetCards(ctx.s).reduce((n, id) => n + cardDefense(ctx.s, id), 0);
        roundMod(ctx, src, 'mainAttack', 2 * x);
      },
    },
  },
  {
    key: 'Useful Rage+/1',
    label: '對自己造成傷害後，給攻擊卡 1 個特質',
    type: '1x',
    trigger: { event: 'SelfDamage', timing: 'after', mandatory: false, filter: (s) => !!attackCard(s), run: (ctx) => grantAttackTraits(ctx, 1) },
  },
]);

// ---------------------------------------------------------------- Equal Measure

defineCard('Equal Measure', [
  {
    key: 'Equal Measure/0',
    label: '行動組有 fire 和 ice：選 1 個特質，有該特質的敵人受 2 傷；然後除非玩家區有 3+ 敵人，對自己造成 2 傷',
    type: '1x',
    active: {
      available: (s) => (actionSetTraits(s).includes('Fire') && actionSetTraits(s).includes('Ice') ? null : '行動組需要同時有 Fire 與 Ice'),
      run: function* (ctx) {
        const s = ctx.s;
        const enemyTraits = [...new Set([...s.world.questArea, ...s.world.playerArea].flatMap((id) => cardTraits(s, id)))].sort();
        const trait = yield* ctx.choose('KC-11', 'Equal Measure：選擇特質', (enemyTraits.length ? enemyTraits : ALL_TRAITS).map((t) => ({ id: t, label: t })));
        for (const id of [...s.world.questArea, ...s.world.playerArea]) if (cardTraits(s, id).includes(trait)) yield* woundEnemy(ctx, id, 2, 'direct', 'KC-25');
        if (ctx.s.world.playerArea.length < 3) yield* dealSelfWound(ctx, 2, 'KC-24', 'Equal Measure');
      },
    },
  },
]);

defineCard('Equal Measure+', [
  { key: 'Equal Measure+/0', label: '給攻擊卡 1 個特質', type: '1x', active: { available: (s) => (attackCard(s) ? null : '沒有攻擊卡'), run: (ctx) => grantAttackTraits(ctx, 1) } },
  {
    key: 'Equal Measure+/1',
    label: '敵人進入玩家區後，地點 +1 Progress (Fast) 或 +2 (Slow)',
    type: 'MandatoryUnrestricted',
    trigger: {
      event: 'EnemyEnteredPlayer',
      timing: 'after',
      mandatory: true,
      run: function* (ctx, _src, ev) {
        const id = ev.enemy as string;
        const fast = ctx.s.world.enemies[id] ? enemyInitiative(ctx.s, id) === 'Fast' : enemyCard(id).initiative === 'Fast';
        yield* placeLocationProgress(ctx, fast ? 1 : 2, 'EE-10', 'Equal Measure');
      },
    },
  },
]);

// ---------------------------------------------------------------- Momentum Shift

defineCard('Momentum Shift', [
  {
    key: 'Momentum Shift/0',
    label: 'Action Set 結束：ExploreBoost 變 0，AttackBoost 增加該數 +1',
    type: '1x',
    phaseEnd: {
      phase: 'actionSet',
      mandatory: false,
      run: function* (ctx, src) {
        const eb = exploreBoost(ctx.s);
        roundMod(ctx, src, 'exploreBoost', -eb);
        roundMod(ctx, src, 'attackBoost', eb + 1);
      },
    },
  },
  {
    key: 'Momentum Shift/1',
    label: '敵人進入玩家區後，可以對自己造成 1 傷，對它造成 1 傷',
    type: 'Unrestricted',
    trigger: {
      event: 'EnemyEnteredPlayer',
      timing: 'after',
      mandatory: false,
      run: function* (ctx, _src, ev) {
        yield* dealSelfWound(ctx, 1, 'KC-24', 'Momentum Shift');
        yield* woundEnemy(ctx, ev.enemy as string, 1, 'direct', 'KC-25');
      },
    },
  },
]);

defineCard('Momentum Shift+', [
  {
    key: 'Momentum Shift+/0',
    label: '給攻擊卡 2 個特質',
    type: '1x',
    active: { available: (s) => (attackCard(s) ? null : '沒有攻擊卡'), run: (ctx) => grantAttackTraits(ctx, 2) },
  },
  {
    key: 'Momentum Shift+/1',
    label: '對自己造成 1 傷；然後最多 2 次：Threat token +1、翻 1 個 Dusk 敵人、MainAttack +10',
    type: '1x',
    active: {
      phases: ['attack'],
      run: function* (ctx, src) {
        yield* dealSelfWound(ctx, 1, 'KC-24', 'Momentum Shift');
        const n = yield* ctx.chooseNumber('KC-11', 'Momentum Shift：重複幾次？(Threat token +1、翻 Dusk 敵人、MainAttack +10)', 0, 2);
        for (let i = 0; i < n; i++) {
          yield* addThreatTokens(ctx, 1, 'KC-11', 'Momentum Shift');
          yield* revealEnemy(ctx, 'Dusk', 'KC-11');
          roundMod(ctx, src, 'mainAttack', 10);
        }
      },
    },
  },
]);

// ---------------------------------------------------------------- Frenzy

defineCard('Frenzy', [
  {
    key: 'Frenzy/0',
    label: '對玩家區 1 個敵人造成 X 傷害 (X = 玩家區敵人數)；可以對自己造成 1 傷使其加倍',
    type: '1x',
    active: {
      phases: ['defend'],
      available: (s) => (s.world.playerArea.length ? null : '玩家區沒有敵人'),
      run: function* (ctx) {
        let x = ctx.s.world.playerArea.length;
        const id = yield* chooseEnemy(ctx, 'KC-25', `Frenzy：${x} 傷害給誰？`, playerEnemies(ctx.s));
        const dbl = yield* ctx.choose('KC-11', 'Frenzy：對自己造成 1 傷使傷害加倍？', [
          { id: 'no', label: `不要 (${x} 傷害)` },
          { id: 'yes', label: `受 1 傷 (${2 * x} 傷害)` },
        ]);
        if (dbl === 'yes') {
          yield* dealSelfWound(ctx, 1, 'KC-24', 'Frenzy');
          x *= 2;
        }
        if (id) yield* woundEnemy(ctx, id, x, 'direct', 'KC-25');
      },
    },
  },
]);

defineCard('Frenzy+', [
  { key: 'Frenzy+/0', label: '給攻擊卡 1 個特質', type: '1x', active: { available: (s) => (attackCard(s) ? null : '沒有攻擊卡'), run: (ctx) => grantAttackTraits(ctx, 1) } },
  {
    key: 'Frenzy+/1',
    label: '擊敗玩家區 1 個與行動組有 3+ 個相同特質的 Dusk/Doom 敵人 (受 3 傷可擊敗 2 個)',
    type: '1x',
    active: {
      run: function* (ctx) {
        const s = ctx.s;
        const mine = actionSetTraits(s);
        const ok = s.world.playerArea.filter((id) => {
          const c = enemyCard(id).class;
          return (c === 'Dusk' || c === 'Doom') && cardTraits(s, id).filter((t) => mine.includes(t)).length >= 3;
        });
        if (!ok.length) {
          ctx.log('KC-12c', 'Frenzy：沒有符合的敵人');
          return;
        }
        let max = 1;
        if (ok.length >= 2) {
          const two = yield* ctx.choose('KC-11', 'Frenzy：受 3 傷改為擊敗 2 個？', [
            { id: 'one', label: '擊敗 1 個' },
            { id: 'two', label: '受 3 傷，擊敗 2 個' },
          ]);
          if (two === 'two') {
            yield* dealSelfWound(ctx, 3, 'KC-24', 'Frenzy');
            max = 2;
          }
        }
        const picks = yield* chooseEnemies(ctx, 'KC-11', `Frenzy：選 ${max} 個敵人擊敗`, ok, max, max);
        for (const id of picks) yield* defeatEnemy(ctx, id);
      },
    },
  },
]);

// ---------------------------------------------------------------- 技能

/** Shout：Pull 1 Slow 敵人；本回合每次擊敗 Fast 敵人後，Pull 1 Fast 敵人 */
defineSkill('Shout', [
  {
    key: 'Shout',
    label: 'Pull 1 Slow 敵人；本回合擊敗 Fast 敵人後 Pull 1 Fast 敵人',
    type: '1x',
    rule: 'KC-18',
    active: {
      run: function* (ctx, src) {
        const slow = ctx.s.world.questArea.filter((id) => enemyInitiative(ctx.s, id) === 'Slow');
        const id = yield* chooseEnemy(ctx, 'KC-04', 'Shout：Pull 1 個 Slow 敵人', slow);
        if (id) yield* pull(ctx, id, 'KC-04');
        else ctx.log('KC-12c', 'Shout：任務區沒有 Slow 敵人');
        addLingering(ctx, 'Shout/fastPull', src); // EE-06 到回合結束
      },
    },
  },
]);

defineLingering({
  key: 'Shout/fastPull',
  label: '擊敗 Fast 敵人後 Pull 1 Fast 敵人',
  rule: 'EE-10',
  trigger: {
    event: 'EnemyDefeated',
    timing: 'after',
    mandatory: true, // 沒有 may (KC-12c)
    filter: (_s, _src, ev) => ev.initiative === 'Fast',
    run: function* (ctx) {
      const fast = ctx.s.world.questArea.filter((id) => enemyInitiative(ctx.s, id) === 'Fast');
      const id = yield* chooseEnemy(ctx, 'KC-04', 'Shout：Pull 1 個 Fast 敵人', fast);
      if (id) yield* pull(ctx, id, 'KC-04');
      else ctx.log('KC-12c', 'Shout：任務區沒有 Fast 敵人');
    },
  },
});

defineSkill('Grit', [
  {
    key: 'Grit',
    label: '受 1 傷得 1 光，或受 4 傷得 3 光',
    type: '1x',
    active: {
      run: function* (ctx) {
        const pick = yield* ctx.choose('KC-18', 'Grit', [
          { id: '1', label: '受 1 傷：+1 光' },
          { id: '4', label: '受 4 傷：+3 光' },
        ]);
        yield* dealSelfWound(ctx, Number(pick), 'KC-24', 'Grit');
        yield* gainLight(ctx, pick === '1' ? 1 : 3, 'KC-18', 'Grit');
      },
    },
  },
]);

defineSkill('Call Your Shot', [
  {
    key: 'Call Your Shot',
    label: '選 1 個特質：本回合攻擊有該特質的敵人時它受 2 傷，你受 1 傷',
    type: '1x',
    active: {
      run: function* (ctx, src) {
        const s = ctx.s;
        const traits = [...new Set([...s.world.questArea, ...s.world.playerArea].flatMap((id) => cardTraits(s, id)))].sort();
        const trait = yield* ctx.choose('KC-18', 'Call Your Shot：選擇特質', (traits.length ? traits : ALL_TRAITS).map((t) => ({ id: t, label: t })));
        addLingering(ctx, 'Call Your Shot/hit', src, { trait });
        ctx.log('EE-06', `Call Your Shot：本回合攻擊 ${trait} 敵人時它受 2 傷`);
      },
    },
  },
]);

defineLingering({
  key: 'Call Your Shot/hit',
  label: '攻擊有指定特質的敵人時它受 2 傷，你受 1 傷',
  trigger: {
    event: 'EnemyAttackedByYou',
    timing: 'when',
    mandatory: true,
    filter: (s, src, ev) => !!s.world.enemies[ev.enemy as string] && cardTraits(s, ev.enemy as string).includes(src.params!.trait as string),
    run: function* (ctx, _src, ev) {
      yield* woundEnemy(ctx, ev.enemy as string, 2, 'direct', 'KC-25');
      yield* dealSelfWound(ctx, 1, 'KC-24', 'Call Your Shot');
    },
  },
});

defineSkill('Find Weakness', [
  {
    key: 'Find Weakness',
    label: '攻擊敵人時，每個與攻擊卡相同的特質它受 2 傷',
    type: 'MandatoryUnrestricted',
    trigger: {
      event: 'EnemyAttackedByYou',
      timing: 'when',
      mandatory: true,
      filter: (s, _src, ev) => {
        const a = attackCard(s);
        const e = ev.enemy as string;
        return !!a && !!s.world.enemies[e] && cardTraits(s, e).some((t) => cardTraits(s, a).includes(t));
      },
      run: function* (ctx, _src, ev) {
        const s = ctx.s;
        const e = ev.enemy as string;
        const shared = cardTraits(s, e).filter((t) => cardTraits(s, attackCard(s)!).includes(t));
        ctx.log('KC-18', `Find Weakness：相同特質 ${shared.join('、')}`);
        yield* woundEnemy(ctx, e, 2 * shared.length, 'direct', 'KC-25');
      },
    },
  },
]);

/** Use the Pain：Pull 敵人或對自己造成傷害後，花 1 光給玩家卡或敵人 1 個特質 (每回合最多 3 次) */
function useThePain(key: string, event: string, filter?: (ev: Record<string, unknown>) => boolean) {
  return {
    key,
    label: '花 1 光給 1 張玩家卡或敵人 1 個特質 (每回合最多 3 次)',
    type: 'Unrestricted' as const,
    trigger: {
      event,
      timing: 'after' as const,
      mandatory: false,
      filter: (s: import('../types').GameState, _src: unknown, ev: Record<string, unknown>) =>
        (s.roundState.flags.useThePain ?? 0) < 3 && s.player.light >= 1 && (!filter || filter(ev)),
      run: function* (ctx: import('../core').Ctx) {
        const s = ctx.s;
        const targets = [...actionSetCards(s), ...s.world.questArea, ...s.world.playerArea];
        if (!targets.length) return;
        yield* spendLight(ctx, 1, 'KC-18', 'Use the Pain');
        s.roundState.flags.useThePain = (s.roundState.flags.useThePain ?? 0) + 1;
        const t = yield* ctx.choose('KC-18', 'Use the Pain：給誰特質？', targets.map((id) => ({ id, label: cardName(id) })));
        yield* grantTrait(ctx, t, 'KC-16');
      },
    },
  };
}

defineSkill('Use the Pain', [
  useThePain('Use the Pain/pull', 'EnemyEnteredPlayer', (ev) => ev.cause === 'pull'),
  useThePain('Use the Pain/self', 'SelfDamage'),
]);
