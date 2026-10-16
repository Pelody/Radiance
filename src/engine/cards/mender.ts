// Mender：卡片 (基礎面 / 進階面 `+`) 與技能。大量「棄牌」：棄掉的卡可以用 Hidden Depth 變成 clone。
import { cardDefense, cardTraits, enemyTypes, face, lightCost } from '../calc';
import { cardName, playerCard } from '../data';
import { defineCard, defineSkill, findSkill, flag, skillActive, skillUnlocked } from '../effects';
import type { Ctx, Gen } from '../core';
import {
  chooseEnemy,
  chooseHandCards,
  chooseNegative,
  currentEcho,
  dealSelfWound,
  discardPlayerCard,
  disarm,
  chooseEnemies,
  gainLight,
  heal,
  mill,
  pull,
  push,
  refreshEcho,
  regenerate,
  spendLight,
  woundEnemy,
} from '../ops';
import { playerEnemies, roundMod } from './util';

/** 從手牌棄 min–max 張 (效果)，回傳算作棄掉的張數 (含 clone) 與每張的結果 */
function* discardCards(ctx: Ctx, min: number, max: number, why: string): Gen<{ count: number; cards: { card: string; copies: number; cloneDefense: number | null }[] }> {
  const picks = yield* chooseHandCards(ctx, 'KC-11', `${why}：棄 ${min === max ? max : `${min}–${max}`} 張`, min, max);
  const cards: { card: string; copies: number; cloneDefense: number | null }[] = [];
  let count = 0;
  for (const c of picks) {
    const r = yield* discardPlayerCard(ctx, c, 'effect', 'KC-11');
    cards.push({ card: c, ...r });
    count += r.copies;
  }
  return { count, cards };
}

const echoNow = (ctx: Ctx) => currentEcho(ctx);

// ---------------------------------------------------------------- Winds of Change

defineCard('Winds of Change', [
  {
    key: 'Winds of Change/0',
    label: '棄 1 張卡',
    type: '1x',
    active: { phases: ['actionSet'], run: function* (ctx) { yield* discardCards(ctx, 1, 1, 'Winds of Change'); } },
  },
  {
    key: 'Winds of Change/1',
    label: '攻擊視為相反類型',
    type: 'Passive',
    modify: (_s, _src, q, v) => (q.stat === 'flag' && q.flag === 'invertAttackType' ? v + 1 : v),
  },
]);

defineCard('Winds of Change+', [
  {
    key: 'Winds of Change+/0',
    label: '1 個鎖定的技能本回合視為已解鎖',
    type: '1x',
    active: {
      run: function* (ctx) {
        const s = ctx.s;
        const locked = s.player.skills.filter((k) => !skillUnlocked(s, k));
        if (!locked.length) return;
        const pick = yield* ctx.choose('KC-11', 'Winds of Change：哪個技能視為已解鎖？', locked.map((k) => ({ id: k.name, label: k.name })));
        s.roundState.skillMods.unlocked.push(pick);
        ctx.log('EE-06', `${pick} 本回合視為已解鎖`);
      },
    },
  },
  {
    key: 'Winds of Change+/1',
    label: '棄 1 張卡；然後 1 個未啟動的技能視為啟動',
    type: '1x',
    active: {
      run: function* (ctx) {
        const d = yield* discardCards(ctx, 1, 1, 'Winds of Change');
        if (!d.count) return;
        const s = ctx.s;
        const off = s.player.skills.filter((k) => !skillActive(s, k));
        if (!off.length) return;
        const pick = yield* ctx.choose('KC-11', 'Winds of Change：哪個技能視為啟動？', off.map((k) => ({ id: k.name, label: `${k.name} (${k.cubeElement})` })));
        s.roundState.skillMods.active.push(pick);
        ctx.log('EE-06', `${pick} 本回合視為啟動`);
      },
    },
  },
]);

// ---------------------------------------------------------------- Power of the Mind

defineCard('Power of the Mind', [
  {
    key: 'Power of the Mind/0',
    label: '棄最多 3 張，每張治療 1',
    type: '1x',
    active: {
      run: function* (ctx) {
        const d = yield* discardCards(ctx, 0, 3, 'Power of the Mind');
        yield* heal(ctx, d.count, 'KC-11', 'Power of the Mind');
      },
    },
  },
]);

defineCard('Power of the Mind+', [
  {
    key: 'Power of the Mind+/0',
    label: '結算 Countervail 時每個特質結算 2 次',
    type: 'MandatoryUnrestricted',
    modify: (_s, _src, q, v) => (q.stat === 'flag' && q.flag === 'countervailTwice' ? v + 1 : v),
  },
]);

// ---------------------------------------------------------------- Windwall

defineCard('Windwall', [
  {
    key: 'Windwall/0',
    label: '棄最多 4 張，每張 Disarm 1 個敵人',
    type: '1x',
    active: {
      run: function* (ctx) {
        const d = yield* discardCards(ctx, 0, 4, 'Windwall');
        const ids = yield* chooseEnemies(ctx, 'KC-11', `Windwall：Disarm 最多 ${d.count} 個敵人`, playerEnemies(ctx.s), Math.min(d.count, ctx.s.world.playerArea.length), d.count);
        for (const e of ids) disarm(ctx, e, 'KC-11');
      },
    },
  },
  {
    key: 'Windwall/1',
    label: '棄 1 張，治療 1',
    type: '1x',
    active: {
      run: function* (ctx) {
        const d = yield* discardCards(ctx, 1, 1, 'Windwall');
        if (d.count) yield* heal(ctx, 1, 'KC-11', 'Windwall');
      },
    },
  },
]);

defineCard('Windwall+', [
  {
    key: 'Windwall+/0',
    label: 'echo 是進階面時，所有卡 +2 防禦',
    type: 'Passive',
    modify: (s, _src, q, v) => {
      if (q.stat !== 'cardDefense') return v;
      const d = s.player.discard;
      return d.length && s.player.upgraded.includes(d[d.length - 1]) ? v + 2 : v;
    },
  },
  {
    key: 'Windwall+/1',
    label: 'echo 是基礎面時，可以棄最多 3 張，每張得 1 光',
    type: '1x',
    active: {
      available: (s) => {
        const d = s.player.discard;
        return d.length && !s.player.upgraded.includes(d[d.length - 1]) ? null : 'echo 不是基礎面';
      },
      run: function* (ctx) {
        const d = yield* discardCards(ctx, 0, 3, 'Windwall');
        yield* gainLight(ctx, d.count, 'KC-11', 'Windwall');
      },
    },
  },
]);

// ---------------------------------------------------------------- Stand Strong

defineCard('Stand Strong', [
  {
    key: 'Stand Strong/0',
    label: '棄最多 3 張，每張治療 1',
    type: '1x',
    active: {
      run: function* (ctx) {
        const d = yield* discardCards(ctx, 0, 3, 'Stand Strong');
        yield* heal(ctx, d.count, 'KC-11', 'Stand Strong');
      },
    },
  },
  {
    key: 'Stand Strong/1',
    label: 'echo 拿回手牌；然後棄 1 張',
    type: '1x',
    active: {
      available: (s) => (s.player.discard.length ? null : '沒有 echo'),
      run: function* (ctx) {
        const p = ctx.s.player;
        const e = p.discard.pop()!;
        p.hand.push(e);
        ctx.log('KC-11', `echo ${cardName(e)} 拿回手牌`);
        refreshEcho(ctx);
        yield* discardCards(ctx, 1, 1, 'Stand Strong');
      },
    },
  },
]);

defineCard('Stand Strong+', [
  {
    key: 'Stand Strong+/0',
    label: '花最多 3 光，每 1 光：治療 1、Regenerate 1、push 1 個敵人',
    type: '1x',
    active: {
      run: function* (ctx) {
        const n = yield* ctx.chooseNumber('KC-11', 'Stand Strong：花多少光？', 0, Math.min(3, ctx.s.player.light));
        if (!n) return;
        yield* spendLight(ctx, n, 'KC-11', 'Stand Strong');
        yield* heal(ctx, n, 'KC-11', 'Stand Strong');
        regenerate(ctx, n, 'KC-11', 'Stand Strong');
        const ids = yield* chooseEnemies(ctx, 'KC-04', `Stand Strong：push 最多 ${n} 個敵人`, playerEnemies(ctx.s), Math.min(n, ctx.s.world.playerArea.length), n);
        for (const e of ids) yield* push(ctx, e, 'KC-04');
      },
    },
  },
  {
    key: 'Stand Strong+/1',
    label: '棄最多 3 張，每張 Regenerate 1',
    type: '1x',
    active: {
      run: function* (ctx) {
        const d = yield* discardCards(ctx, 0, 3, 'Stand Strong');
        regenerate(ctx, d.count, 'KC-11', 'Stand Strong');
      },
    },
  },
]);

// ---------------------------------------------------------------- Restoration

defineCard('Restoration', [
  {
    key: 'Restoration/0',
    label: '棄 1 張，治療 1',
    type: '1x',
    active: {
      run: function* (ctx) {
        const d = yield* discardCards(ctx, 1, 1, 'Restoration');
        if (d.count) yield* heal(ctx, 1, 'KC-11', 'Restoration');
      },
    },
  },
  {
    key: 'Restoration/1',
    label: '棄掉探索卡，手牌 1 張放到探索卡槽 (付一半光費，無條件捨去)',
    type: '1x',
    active: {
      available: (s) => (s.player.actionSet.explore ? null : '沒有探索卡'),
      run: function* (ctx) {
        const p = ctx.s.player;
        yield* discardPlayerCard(ctx, p.actionSet.explore!, 'effect', 'KC-11');
        const afford = p.hand.filter((c) => Math.floor(lightCost(ctx.s, c) / 2) <= p.light);
        const [c] = yield* chooseHandCards(ctx, 'KC-11', 'Restoration：放到探索卡槽的卡', 1, 1, (x) => afford.includes(x));
        if (!c) return;
        const cost = Math.floor(lightCost(ctx.s, c) / 2);
        if (cost) yield* spendLight(ctx, cost, 'KC-11', 'Restoration');
        p.hand = p.hand.filter((x) => x !== c);
        p.actionSet.explore = c;
        ctx.log('KC-11', `${cardName(c)} 放到探索卡槽`);
      },
    },
  },
]);

defineCard('Restoration+', [
  {
    key: 'Restoration+/0',
    label: 'echo 是 Photonic 時，棄牌堆任 1 張拿回手牌',
    type: '1x',
    active: {
      available: (s) => {
        const d = s.player.discard;
        return d.length && face(s, d[d.length - 1]).attack_type === 'Photonic' ? null : 'echo 不是 Photonic';
      },
      run: function* (ctx) {
        const p = ctx.s.player;
        const c = yield* ctx.choose('KC-11', 'Restoration：拿回哪張卡？', p.discard.map((id) => ({ id, label: cardName(id) })));
        p.discard = p.discard.filter((x) => x !== c);
        p.hand.push(c);
        ctx.log('KC-11', `${cardName(c)} 從棄牌堆拿回手牌`);
      },
    },
  },
  {
    key: 'Restoration+/1',
    label: '本回合對自己造成過傷害時得 3 光',
    type: '1x',
    active: {
      phases: ['refresh'],
      available: (s) => (s.roundState.selfWounded > 0 ? null : '本回合沒有對自己造成傷害'),
      run: (ctx) => gainLight(ctx, 3, 'KC-11', 'Restoration'),
    },
  },
]);

// ---------------------------------------------------------------- Inner Strength

defineCard('Inner Strength', [
  {
    key: 'Inner Strength/0',
    label: '棄最多 2 張，每張治療 1',
    type: '1x',
    active: {
      run: function* (ctx) {
        const d = yield* discardCards(ctx, 0, 2, 'Inner Strength');
        yield* heal(ctx, d.count, 'KC-11', 'Inner Strength');
      },
    },
  },
  {
    key: 'Inner Strength/1',
    label: '棄 1 張；然後 echo 是 Photonic：+6 MainExplore；Physical：+4 MainAttack',
    type: '1x',
    active: {
      run: function* (ctx, src) {
        const d = yield* discardCards(ctx, 1, 1, 'Inner Strength');
        if (!d.count) return;
        refreshEcho(ctx); // KC-21 Then：echo 先更新
        const e = echoNow(ctx);
        if (!e) return;
        if (face(ctx.s, e).attack_type === 'Photonic') roundMod(ctx, src, 'mainExplore', 6);
        else roundMod(ctx, src, 'mainAttack', 4);
      },
    },
  },
]);

defineCard('Inner Strength+', [
  {
    key: 'Inner Strength+/0',
    label: '棄 1 張，治療 2',
    type: '1x',
    active: {
      run: function* (ctx) {
        const d = yield* discardCards(ctx, 1, 1, 'Inner Strength');
        if (d.count) yield* heal(ctx, 2, 'KC-11', 'Inner Strength');
      },
    },
  },
  {
    key: 'Inner Strength+/1',
    label: '選 1：所有鎖定技能視為解鎖，或所有已解鎖技能視為啟動；可以棄 2 張選兩個',
    type: '1x',
    active: {
      run: function* (ctx) {
        const s = ctx.s;
        const pick = yield* ctx.choose('KC-11', 'Inner Strength', [
          { id: 'unlock', label: '所有鎖定技能視為解鎖' },
          { id: 'active', label: '所有已解鎖技能視為啟動' },
          { id: 'both', label: '棄 2 張：兩個都要', legal: s.player.hand.length >= 2 },
        ]);
        if (pick === 'both') {
          const d = yield* discardCards(ctx, 2, 2, 'Inner Strength');
          if (d.cards.length < 2) return;
        }
        if (pick !== 'active') s.roundState.skillMods.unlockAll = true;
        if (pick !== 'unlock') s.roundState.skillMods.activeAll = true;
        ctx.log('EE-06', `Inner Strength：${pick === 'both' ? '所有技能視為解鎖且啟動' : pick === 'unlock' ? '所有技能視為解鎖' : '已解鎖技能視為啟動'}`);
      },
    },
  },
]);

// ---------------------------------------------------------------- 技能

defineSkill('Hidden Depth', [
  {
    key: 'Hidden Depth',
    label: '棄 1 張卡時算作 X 張 clone (X = 防禦值；clone 防禦 1，腐化 > 5 時 2)',
    type: '1x',
    trigger: {
      event: 'WillDiscardCard',
      timing: 'will',
      mandatory: false,
      run: function* (ctx, _src, ev) {
        const x = Math.max(1, cardDefense(ctx.s, ev.card as string)); // KC-05a
        ev.copies = x;
        ev.cloneDefense = ctx.s.world.corruption > 5 ? 2 : 1;
        ctx.log('KC-30', `Hidden Depth：${cardName(ev.card as string)} 算作 ${x} 張 clone (防禦 ${ev.cloneDefense})`);
      },
    },
  },
]);

const COUNTERVAIL = ['Healer', 'Fervent', 'Creative', 'Strong'];

defineSkill('Countervail', [
  {
    key: 'Countervail',
    label: '棄掉 X 卡時：Healer 治療 1、Fervent Mill 1、Creative Regenerate 1、Strong Pull 1 個敵人',
    type: 'MandatoryUnrestricted',
    trigger: {
      event: 'CardDiscarded',
      timing: 'when',
      mandatory: true,
      filter: (s, _src, ev) => cardTraits(s, ev.card as string).some((t) => COUNTERVAIL.includes(t)),
      run: function* (ctx, _src, ev) {
        const s = ctx.s;
        const times = ((ev.copies as number) ?? 1) * (flagTwice(ctx) ? 2 : 1);
        const traits = cardTraits(s, ev.card as string).filter((t) => COUNTERVAIL.includes(t));
        for (let i = 0; i < times; i++) {
          for (const t of traits) {
            if (t === 'Healer') yield* heal(ctx, 1, 'KC-18', 'Countervail (Healer)');
            else if (t === 'Fervent') yield* mill(ctx, 1, 'KC-18', 'Countervail (Fervent)');
            else if (t === 'Creative') regenerate(ctx, 1, 'KC-18', 'Countervail (Creative)');
            else {
              const e = yield* chooseEnemy(ctx, 'KC-04', 'Countervail (Strong)：Pull 1 個敵人', s.world.questArea);
              if (e) yield* pull(ctx, e, 'KC-04');
            }
          }
        }
      },
    },
  },
]);

const flagTwice = (ctx: Ctx) => flag(ctx.s, 'countervailTwice');

defineSkill('Bolster', [
  {
    key: 'Bolster',
    label: '棄掉與 echo 同元素的卡時，得到它的 AttackBoost 與 ExploreBoost',
    type: '1x',
    trigger: {
      event: 'CardDiscarded',
      timing: 'when',
      mandatory: false,
      filter: (_s, _src, ev) => !!ev.prevEcho && playerCard(ev.prevEcho as string).element === playerCard(ev.card as string).element,
      run: function* (ctx, src, ev) {
        const f = face(ctx.s, ev.card as string);
        roundMod(ctx, src, 'attackBoost', f.attack_booster);
        roundMod(ctx, src, 'exploreBoost', f.explore_booster);
      },
    },
  },
]);

defineSkill('Redirect', [
  {
    key: 'Redirect',
    label: '治療時，把傷害放到玩家區 1 個敵人身上',
    type: 'MandatoryUnrestricted',
    trigger: {
      event: 'PlayerHealed',
      timing: 'when',
      mandatory: true,
      filter: (s) => s.world.playerArea.length > 0,
      run: function* (ctx, _src, ev) {
        const e = yield* chooseEnemy(ctx, 'KC-18', `Redirect：${ev.n} 傷害放到哪個敵人？`, playerEnemies(ctx.s));
        if (e) yield* woundEnemy(ctx, e, ev.n as number, 'direct', 'KC-25');
      },
    },
  },
]);

defineSkill('Enduring Hope', [{ key: 'Enduring Hope', label: 'echo 的元素也算啟動', type: 'Passive', echoElementActive: true }]);

defineSkill('Dark Past', [
  {
    key: 'Dark Past',
    label: 'Refresh：這個技能沒有解鎖且啟動時，受 1 傷或付 1 光',
    type: 'EagerMandatory1x',
    phaseDuring: {
      phase: 'refresh',
      run: function* (ctx) {
        const s = ctx.s;
        const sk = findSkill(s, 'Dark Past')!;
        if (skillUnlocked(s, sk) && skillActive(s, sk)) {
          ctx.log('KC-18', 'Dark Past：已解鎖且啟動，沒有效果');
          return;
        }
        yield* chooseNegative(ctx, 'KC-12f', 'Dark Past', [
          { id: 'wound', label: '受 1 傷', resolvable: 'full', run: () => dealSelfWound(ctx, 1, 'KC-24', 'Dark Past') },
          { id: 'light', label: '付 1 光', resolvable: s.player.light >= 1 ? 'full' : 'none', run: () => spendLight(ctx, 1, 'KC-18', 'Dark Past') },
        ]);
      },
    },
  },
]);

defineSkill('Songs of Battle', [
  {
    key: 'Songs of Battle',
    label: '任意次數：棄 1 張；然後 push 與 echo 同類型的敵人，或對玩家區相反類型的敵人造成等於該卡防禦值的傷害',
    type: '1x',
    active: {
      run: function* (ctx) {
        const s = ctx.s;
        for (;;) {
          if (!s.player.hand.length) return;
          const go = yield* ctx.choose('KC-18', 'Songs of Battle：再棄 1 張？', [
            { id: 'yes', label: '棄 1 張' },
            { id: 'no', label: '結束' },
          ]);
          if (go === 'no') return;
          const d = yield* discardCards(ctx, 1, 1, 'Songs of Battle');
          if (!d.cards.length) return;
          refreshEcho(ctx); // KC-21 Then
          const { card, cloneDefense, copies } = d.cards[0];
          const type = face(s, card).attack_type;
          const opp = type === 'Physical' ? 'Photonic' : 'Physical';
          const dmg = cloneDefense !== null ? cloneDefense * copies : cardDefense(s, card);
          const same = s.world.playerArea.filter((e) => enemyTypes(s, e).includes(type));
          const other = s.world.playerArea.filter((e) => enemyTypes(s, e).includes(opp));
          const pick = yield* ctx.choose('KC-18', `Songs of Battle (echo ${type})`, [
            { id: 'push', label: `push ${type} 敵人`, legal: same.length > 0 },
            { id: 'wound', label: `${dmg} 傷害給 ${opp} 敵人`, legal: other.length > 0 },
            { id: 'none', label: '都不做', legal: !same.length && !other.length },
          ]);
          if (pick === 'push') {
            const e = yield* chooseEnemy(ctx, 'KC-04', 'push 哪個敵人？', same);
            if (e) yield* push(ctx, e, 'KC-04');
          } else if (pick === 'wound') {
            const e = yield* chooseEnemy(ctx, 'KC-25', '傷害給哪個敵人？', other);
            if (e) yield* woundEnemy(ctx, e, dmg, 'direct', 'KC-25');
          }
        }
      },
    },
  },
]);

