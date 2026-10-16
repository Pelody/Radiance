// Treachery：When Completed (完成時一次) 與 legacy (完成後整局，KC-12e)。
// When Completed 的來源 params.wrath = true 表示是 Wrath 的效果翻開的 (不算完成)。
import { enemiesInPlay, enemyInitiative, enemyTypes, face } from '../calc';
import { cardName, enemyCard, locationCard } from '../data';
import { defineCard, type EffectDef } from '../effects';
import {
  addObstacle,
  addThreatTokens,
  advanceCorruption,
  advanceResistance,
  advanceThreat,
  chooseExhaustSkill,
  chooseHandCards,
  chooseNegative,
  dealSelfWound,
  discardPlayerCard,
  engageEnemies,
  healEnemy,
  loseLight,
  loseXP,
  placeTreacheryProgress,
  removeLocationProgress,
  removePath,
} from '../ops';
import { enemyAttacks } from '../phases';
import type { Element } from '../data';
import { checkExplored } from '../world';
import { backQuest, frontQuest } from './util';

/** legacy：某元素的卡當攻擊卡或行動卡時 +N 光 */
function elementCost(key: string, element: Element, n: number): EffectDef {
  return {
    key,
    label: `${element} 元素的卡當攻擊卡或行動卡 +${n} 光`,
    modify: (s, _src, q, v) =>
      q.stat === 'lightCost' && (q.slot === 'attack' || q.slot === 'action') && q.card && face(s, q.card).element === element ? v + n : v,
  };
}

/** legacy：移動到有某些特質的地點後放 1 個 Threat token */
function arriveToken(key: string, traits: string[]): EffectDef {
  return {
    key,
    label: `移動到 ${traits.join('/')} 地點後 Threat token +1`,
    trigger: {
      event: 'Arrived',
      timing: 'after',
      mandatory: true,
      filter: (_s, _src, ev) => locationCard(ev.location as string).trait_icons.some((t) => traits.includes(t)),
      run: (ctx, src) => addThreatTokens(ctx, 1, 'EE-10', src.name),
    },
  };
}

/** legacy：某陣營的敵人在 Refresh Phase 開始時治療 3 */
function factionHeal(key: string, faction: string): EffectDef {
  return {
    key,
    label: `Refresh Phase 開始時 ${faction} 敵人治療 3`,
    phaseStart: {
      phase: 'refresh',
      mandatory: true,
      run: function* (ctx, src) {
        for (const id of enemiesInPlay(ctx.s).filter((e) => enemyCard(e).faction === faction)) healEnemy(ctx, id, 3, 'KC-12a', src.name);
      },
    },
  };
}

defineCard('Reinforcements', [
  {
    key: 'Reinforcements/when',
    label: '移除玩家區敵人的所有傷害；少於 3 時 Threat token +1',
    whenCompleted: function* (ctx) {
      let n = 0;
      for (const id of ctx.s.world.playerArea) n += healEnemy(ctx, id, 99, 'TR-01', 'Reinforcements');
      ctx.log('TR-01', `Reinforcements：移除 ${n} 傷害`);
      if (n < 3) yield* addThreatTokens(ctx, 1, 'TR-01', 'Reinforcements');
    },
  },
  elementCost('Reinforcements/legacy', 'Earth', 1),
]);

defineCard('Tireless Patrols', [
  {
    key: 'Tireless Patrols/when',
    label: '橫置 2 個技能 (盡可能選已解鎖的)',
    whenCompleted: function* (ctx) {
      for (let i = 0; i < 2; i++) yield* chooseExhaustSkill(ctx, 'TR-01', `Tireless Patrols：橫置技能 (${i + 1}/2)`, true);
    },
  },
  {
    key: 'Tireless Patrols/legacy',
    label: 'Refresh：光產出 −1 (可以棄 1 張手牌忽略)',
    trigger: {
      event: 'WillProduceLight',
      timing: 'will',
      mandatory: true,
      run: function* (ctx, _src, ev) {
        if (ctx.s.player.hand.length) {
          const pick = yield* ctx.choose('KC-12e', 'Tireless Patrols：光產出 −1，或棄 1 張手牌忽略', [
            { id: 'minus', label: '光產出 −1' },
            { id: 'discard', label: '棄 1 張手牌' },
          ]);
          if (pick === 'discard') {
            const [c] = yield* chooseHandCards(ctx, 'KC-12e', 'Tireless Patrols：棄 1 張手牌', 1, 1);
            yield* discardPlayerCard(ctx, c, 'hand', 'KC-12e');
            return;
          }
        }
        ev.n = (ev.n as number) - 1;
        ctx.log('KC-12e', 'Tireless Patrols：光產出 −1');
      },
    },
  },
]);

defineCard('Lying in Wait', [
  {
    key: 'Lying in Wait/when',
    label: '任務區最前面 2 個敵人接戰並立即攻擊',
    whenCompleted: function* (ctx) {
      const ids = frontQuest(ctx.s, 2);
      yield* engageEnemies(ctx, ids, 'TR-01');
      for (const id of ids) if (ctx.s.world.enemies[id]) yield* enemyAttacks(ctx, id, 'KC-23');
    },
  },
  arriveToken('Lying in Wait/legacy', ['Thorn', 'Tree', 'Plant', 'Pond']),
]);

defineCard('Sabotage', [
  { key: 'Sabotage/when', label: '抗性軌道 +5', whenCompleted: (ctx) => advanceResistance(ctx, 5, 'TR-01', 'Sabotage') },
  arriveToken('Sabotage/legacy', ['Hills', 'DeadTree', 'Skull', 'Mountains']),
]);

defineCard('Spell of Confusion', [
  {
    key: 'Spell of Confusion/when',
    label: '每個信標：棄掉或失去 2 光；沒有信標時受 2 傷',
    whenCompleted: function* (ctx) {
      const p = ctx.s.player;
      if (!p.beacons.length) {
        yield* dealSelfWound(ctx, 2, 'TR-01', 'Spell of Confusion');
        return;
      }
      for (const b of p.beacons.slice()) {
        const pick = yield* ctx.choose('TR-01', `Spell of Confusion：信標 ${cardName(b)}`, [
          { id: 'discard', label: '棄掉信標' },
          { id: 'light', label: '失去 2 光' },
        ]);
        if (pick === 'discard') {
          p.beacons = p.beacons.filter((x) => x !== b);
          ctx.s.world.locationDiscard.push(b);
          ctx.log('TR-01', `棄掉信標 ${cardName(b)}`);
        } else yield* loseLight(ctx, 2, 'TR-01', 'Spell of Confusion');
      }
    },
  },
  {
    key: 'Spell of Confusion/legacy',
    label: '有 PhotonicDefense 的敵人 +1 PhotonicDefense',
    modify: (s, _src, q, v) => (q.stat === 'enemyDefense' && q.attackType === 'Photonic' && q.enemy && enemyTypes(s, q.enemy).includes('Photonic') ? v + 1 : v),
  },
]);

defineCard('Enemy Territory', [
  {
    key: 'Enemy Territory/when',
    label: '移除地點所有 Progress；少於 5 時受 3 傷',
    whenCompleted: function* (ctx) {
      const n = yield* removeLocationProgress(ctx, ctx.s.world.location.progress, 'TR-01', 'Enemy Territory');
      yield* checkExplored(ctx);
      if (n < 5) yield* dealSelfWound(ctx, 3, 'TR-01', 'Enemy Territory');
    },
  },
  {
    key: 'Enemy Territory/legacy',
    label: '每個 Refresh Phase 開始時 Treachery +1 Progress',
    phaseStart: {
      phase: 'refresh',
      mandatory: true,
      run: (ctx) => placeTreacheryProgress(ctx, 1, 'KC-12a', 'Enemy Territory'),
    },
  },
]);


defineCard('Hidden Pitfalls', [
  { key: 'Hidden Pitfalls/when', label: '腐化 +1', whenCompleted: (ctx) => advanceCorruption(ctx, 1, 'TR-01', 'Hidden Pitfalls') },
  {
    key: 'Hidden Pitfalls/legacy',
    label: '移動時距離 +2',
    modify: (_s, _src, q, v) => (q.stat === 'distance' ? v + 2 : v),
  },
]);

defineCard('Stymied Victory', [
  { key: 'Stymied Victory/when', label: '地點 Threat token +3', whenCompleted: (ctx) => addThreatTokens(ctx, 3, 'TR-01', 'Stymied Victory') },
  {
    key: 'Stymied Victory/legacy',
    label: 'Slow 敵人擊敗時 XP −1',
    modify: (s, _src, q, v) => (q.stat === 'enemyXP' && q.enemy && enemyInitiative(s, q.enemy) === 'Slow' ? v - 1 : v),
  },
]);

defineCard('Tracked Down', [
  { key: 'Tracked Down/when', label: '任務區最後面 2 個敵人立即接戰', whenCompleted: (ctx) => engageEnemies(ctx, backQuest(ctx.s, 2), 'TR-01') },
  elementCost('Tracked Down/legacy', 'Wind', 1),
]);

defineCard('Wildfires', [
  {
    key: 'Wildfires/when',
    label: '失去 5 XP；失去不到 2 XP 時失去 2 光',
    whenCompleted: function* (ctx) {
      const before = ctx.s.player.xp;
      yield* loseXP(ctx, 5, 'TR-01', 'Wildfires');
      if (before - ctx.s.player.xp < 2) yield* loseLight(ctx, 2, 'TR-01', 'Wildfires');
    },
  },
  elementCost('Wildfires/legacy', 'Fire', 1),
]);

defineCard('Cabalist Support', [
  {
    key: 'Cabalist Support/when',
    label: '移除所有 Path，Obstacle +3',
    whenCompleted: function* (ctx) {
      yield* removePath(ctx, ctx.s.world.location.paths, 'TR-01', 'Cabalist Support');
      yield* addObstacle(ctx, 3, 'TR-01', 'Cabalist Support');
    },
  },
  factionHeal('Cabalist Support/legacy', 'Cabalist'),
]);

defineCard('Total Disruption', [
  { key: 'Total Disruption/when', label: '威脅軌道 +2', whenCompleted: (ctx) => advanceThreat(ctx, 2, 'TR-01', 'Total Disruption') },
  factionHeal('Total Disruption/legacy', 'Disruptor'),
]);

defineCard('The Plot Thickens', [
  {
    key: 'The Plot Thickens/when',
    label: '受 6 傷，或受 3 傷並失去 4 光',
    whenCompleted: (ctx) =>
      chooseNegative(ctx, 'KC-12f', 'The Plot Thickens', [
        { id: '6', label: '受 6 傷', resolvable: 'full', run: () => dealSelfWound(ctx, 6, 'TR-01', 'The Plot Thickens') },
        {
          id: '3',
          label: '受 3 傷並失去 4 光',
          resolvable: ctx.s.player.light >= 4 ? 'full' : 'partial',
          run: function* () {
            yield* dealSelfWound(ctx, 3, 'TR-01', 'The Plot Thickens');
            yield* loseLight(ctx, 4, 'TR-01', 'The Plot Thickens');
          },
        },
      ]),
  },
  factionHeal('The Plot Thickens/legacy', 'Plotter'),
]);

defineCard('Prowling Darkness', [
  { key: 'Prowling Darkness/when', label: '失去 4 光', whenCompleted: (ctx) => loseLight(ctx, 4, 'TR-01', 'Prowling Darkness') },
  factionHeal('Prowling Darkness/legacy', 'Prowler'),
]);

defineCard('Two Steps Back', [
  {
    key: 'Two Steps Back/when',
    label: '下一個 Treachery +4 Progress (Wrath 翻開時改為 Wrath 移除 7 傷害)',
    whenCompleted: function* (ctx, src) {
      if (src.params?.wrath) {
        const wrath = enemiesInPlay(ctx.s).find((id) => cardName(id) === 'Wrath');
        if (wrath) healEnemy(ctx, wrath, 7, 'TR-01', 'Two Steps Back');
        return;
      }
      // 第 3 步移除 PV 後，剩餘的 Progress 轉移到新的 Treachery (TR-01 第 5 步)
      ctx.s.world.treacheryProgress += 4;
      ctx.log('TR-01', 'Two Steps Back：下一個 Treachery +4 Progress');
    },
  },
  {
    key: 'Two Steps Back/legacy',
    label: '成長費用 +2 XP',
    modify: (_s, _src, q, v) => (q.stat === 'growthCost' ? v + 2 : v),
  },
]);

