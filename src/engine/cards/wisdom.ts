// Wisdom：卡片 (基礎面 / 進階面 `+`) 與技能。大部分卡是 trance 卡：附著在敵人身上後 Eager 效果生效。
import { enemyDarkness, isTranced, printedMain } from '../calc';
import { cardName, playerCard } from '../data';
import { defineCard, defineLingering, defineSkill, defsForCard, findSkill, isEager, skillUnlocked, type EffectDef, type Source } from '../effects';
import type { Ctx, Gen } from '../core';
import {
  addEnemyProgress,
  addLingering,
  addPath,
  attachCard,
  chooseCards,
  chooseEnemies,
  chooseEnemy,
  disarm,
  distribute,
  gainLight,
  gainXP,
  heal,
  discardPlayerCard,
  pull,
  push,
  removeEnemyProgress,
  removePath,
  runEffect,
  woundEnemy,
} from '../ops';
import { placeLocationProgress } from '../world';
import type { GameState } from '../types';
import { attachWithTrait, attackCardExploreHigher, enemiesInPlay, enemyAttacksEnemy, isTrance, playerEnemies, questEnemies, roundMod } from './util';

const withProgress = (s: GameState, ids = enemiesInPlay(s)) => ids.filter((id) => (s.world.enemies[id]?.progress ?? 0) > 0);
const tranceAttachments = (s: GameState, id: string) => (s.world.enemies[id]?.attachments ?? []).filter((a) => isTrance(s, a));

/** 「After you attach this」：這張卡剛附著到敵人身上 */
function afterAttach(key: string, label: string, mandatory: boolean, run: (ctx: Ctx, src: Source, enemy: string) => Gen): EffectDef {
  return {
    key,
    label,
    type: mandatory ? 'EagerMandatoryUnrestricted' : 'EagerUnrestricted',
    trigger: {
      event: 'CardAttached',
      timing: 'after',
      mandatory,
      filter: (s, src, ev) => ev.card === src.cardId && ev.target !== 'location' && !!s.world.enemies[ev.target as string],
      run: (ctx, src, ev) => run(ctx, src, ev.target as string),
    },
  };
}

/** 擊敗有 trance 的敵人後：其中 1 張附著到另一個敵人，其他棄掉 (已在棄牌堆) */
function moveTranceOnDefeat(key: string): EffectDef {
  return {
    key,
    label: '擊敗有 trance 的敵人後，把其中 1 張 trance 附著到另一個敵人',
    type: '1x',
    trigger: {
      event: 'EnemyDefeated',
      timing: 'after',
      mandatory: false,
      filter: (s, _src, ev) => ((ev.attachments as string[]) ?? []).some((a) => isTrance(s, a) && s.player.discard.includes(a)) && enemiesInPlay(s).length > 0,
      run: function* (ctx, _src, ev) {
        const s = ctx.s;
        const tr = (ev.attachments as string[]).filter((a) => isTrance(s, a) && s.player.discard.includes(a));
        const [c] = yield* chooseCards(ctx, 'KC-11', '選 1 張 trance 附著到另一個敵人', tr, 1, 1);
        const e = yield* chooseEnemy(ctx, 'KC-17', `${cardName(c)} 附著到哪個敵人？`, enemiesInPlay(s));
        if (e) yield* attachCard(ctx, c, e, 'KC-17');
      },
    },
  };
}

/** 附著 trance 卡到某敵人 (從手牌) */
function* trance(ctx: Ctx, enemy: string): Gen<string | null> {
  return yield* attachWithTrait(ctx, 'Trance', enemy, 'KC-17');
}

/** 「Discard 1 Progress from an enemy to attach a trance card to it」 */
function* progressForTrance(ctx: Ctx, ids: string[]): Gen {
  const s = ctx.s;
  const cands = withProgress(s, ids);
  if (!cands.length || !s.player.hand.some((c) => isTrance(s, c))) {
    ctx.log('KC-12c', '沒有可以附著 trance 的敵人或手牌');
    return;
  }
  const e = yield* chooseEnemy(ctx, 'KC-11', '棄 1 Progress 並附著 trance 的敵人', cands);
  if (!e) return;
  yield* removeEnemyProgress(ctx, e, 1, 'KC-11', '附著 trance');
  yield* trance(ctx, e);
}

// ---------------------------------------------------------------- Strong and Swift

defineCard('Strong and Swift', [
  {
    key: 'Strong and Swift/0',
    label: '攻擊卡 MainExplore > MainAttack 時 MainAttack +3；可以棄敵人 1 Progress 附著 trance',
    type: '1x',
    active: {
      run: function* (ctx, src) {
        if (attackCardExploreHigher(ctx.s)) roundMod(ctx, src, 'mainAttack', 3);
        const may = yield* ctx.choose('KC-12c', 'Strong and Swift：棄 1 Progress 附著 trance？', [
          { id: 'yes', label: '附著', legal: withProgress(ctx.s).length > 0 },
          { id: 'no', label: '不要' },
        ]);
        if (may === 'yes') yield* progressForTrance(ctx, enemiesInPlay(ctx.s));
      },
    },
  },
  afterAttach('Strong and Swift/1', '移動另一張 trance 到沒有 trance 的敵人', true, function* (ctx, src) {
    const s = ctx.s;
    const others = enemiesInPlay(s).flatMap((e) => tranceAttachments(s, e).filter((a) => a !== src.cardId));
    const targets = enemiesInPlay(s).filter((e) => !tranceAttachments(s, e).length);
    if (!others.length || !targets.length) return;
    const [c] = yield* chooseCards(ctx, 'KC-17', '選另一張 trance', others, 1, 1);
    const e = yield* chooseEnemy(ctx, 'KC-17', `${cardName(c)} 附著到哪個敵人？`, targets);
    if (e) yield* attachCard(ctx, c, e, 'KC-17');
  }),
]);

defineCard('Strong and Swift+', [
  {
    key: 'Strong and Swift+/0',
    label: '附著 trance 到玩家區每個敵人',
    type: '1x',
    active: {
      run: function* (ctx) {
        for (const e of playerEnemies(ctx.s)) if (!(yield* trance(ctx, e))) break;
      },
    },
  },
  {
    key: 'Strong and Swift+/1',
    label: '移除 1 個敵人所有 Progress；至少 2 個時 Disarm 它',
    type: '1x',
    active: {
      run: function* (ctx) {
        const e = yield* chooseEnemy(ctx, 'KC-11', 'Strong and Swift：移除哪個敵人的 Progress？', withProgress(ctx.s));
        if (!e) return;
        const n = yield* removeEnemyProgress(ctx, e, 99, 'KC-11', 'Strong and Swift');
        if (n >= 2) disarm(ctx, e, 'KC-11');
      },
    },
  },
  afterAttach('Strong and Swift+/2', '對這個敵人造成等於它 Progress 的傷害', true, (ctx, _src, e) =>
    woundEnemy(ctx, e, ctx.s.world.enemies[e].progress, 'direct', 'KC-25'),
  ),
]);

// ---------------------------------------------------------------- Find Balance

defineCard('Find Balance', [
  {
    key: 'Find Balance/0',
    label: '附著 trance 到玩家區 1 個敵人，它的 Progress 分給其他敵人',
    type: '1x',
    active: {
      run: function* (ctx) {
        const s = ctx.s;
        const e = yield* chooseEnemy(ctx, 'KC-11', 'Find Balance：附著到哪個敵人？', playerEnemies(s));
        if (!e || !(yield* trance(ctx, e))) return;
        const n = s.world.enemies[e]?.progress ?? 0;
        const others = enemiesInPlay(s).filter((x) => x !== e);
        if (!n || !others.length) return;
        const dist = yield* distribute(ctx, 'KC-11', 'Find Balance：Progress 分給哪個敵人', others, n);
        yield* removeEnemyProgress(ctx, e, n, 'KC-11', 'Find Balance');
        for (const [id, k] of Object.entries(dist)) yield* addEnemyProgress(ctx, id, k, 'KC-11', 'Find Balance');
      },
    },
  },
  {
    key: 'Find Balance/1',
    label: '任務區與玩家區敵人數相同時，所有卡 +2 防禦',
    type: 'Passive',
    modify: (s, _src, q, v) => (q.stat === 'cardDefense' && s.world.questArea.length === s.world.playerArea.length ? v + 2 : v),
  },
  afterAttach('Find Balance/2', '棄這個敵人 1 Progress 來 push 它並造成 1 傷', false, function* (ctx, _src, e) {
    if (!ctx.s.world.enemies[e]?.progress) return;
    yield* removeEnemyProgress(ctx, e, 1, 'KC-11', 'Find Balance');
    if (ctx.s.world.playerArea.includes(e)) {
      yield* push(ctx, e, 'KC-04');
      yield* woundEnemy(ctx, e, 1, 'direct', 'KC-25');
    }
  }),
]);

defineCard('Find Balance+', [
  {
    key: 'Find Balance+/0',
    label: '附著 trance 到玩家區最多 2 個敵人',
    type: '1x',
    active: {
      run: function* (ctx) {
        const ids = yield* chooseEnemies(ctx, 'KC-11', 'Find Balance：選最多 2 個敵人', playerEnemies(ctx.s), 0, 2);
        for (const e of ids) if (!(yield* trance(ctx, e))) break;
      },
    },
  },
  {
    key: 'Find Balance+/1',
    label: '任務區每個有 trance 的敵人得 1 XP',
    type: '1x',
    active: { phases: ['refresh'], run: (ctx) => gainXP(ctx, ctx.s.world.questArea.filter((e) => isTranced(ctx.s, e)).length, 'KC-11', 'Find Balance') },
  },
  afterAttach('Find Balance+/2', '1 個有 trance 的敵人攻擊另一個有 trance 的敵人', true, function* (ctx) {
    const tr = enemiesInPlay(ctx.s).filter((e) => isTranced(ctx.s, e));
    if (tr.length < 2) return;
    const a = yield* chooseEnemy(ctx, 'KC-11', 'Find Balance：哪個敵人攻擊？', tr);
    const t = yield* chooseEnemy(ctx, 'KC-11', 'Find Balance：攻擊哪個敵人？', tr.filter((x) => x !== a));
    if (a && t) yield* enemyAttacksEnemy(ctx, a, t, 'KC-11');
  }),
]);

// ---------------------------------------------------------------- Valiance

defineCard('Valiance', [
  { key: 'Valiance/0', label: '棄敵人 1 Progress 附著 trance', type: '1x', active: { run: (ctx) => progressForTrance(ctx, enemiesInPlay(ctx.s)) } },
  {
    key: 'Valiance/1',
    label: '有 trance 的敵人擊敗時多 1 XP',
    type: 'Passive',
    modify: (s, _src, q, v) => (q.stat === 'enemyXP' && q.enemy && isTranced(s, q.enemy) ? v + 1 : v),
  },
  afterAttach('Valiance/2', '在 1 個敵人放 1 Progress', true, function* (ctx) {
    const e = yield* chooseEnemy(ctx, 'KC-11', 'Valiance：Progress 放在哪個敵人？', enemiesInPlay(ctx.s));
    if (e) yield* addEnemyProgress(ctx, e, 1, 'KC-11', 'Valiance');
  }),
]);

defineCard('Valiance+', [
  {
    key: 'Valiance+/0',
    label: '攻擊卡的 MainAttack 與 MainExplore 互換',
    type: 'Passive',
    modify: (_s, _src, q, v) => (q.stat === 'flag' && q.flag === 'swapMainStats' ? v + 1 : v),
  },
  {
    key: 'Valiance+/1',
    label: '棄 1 個敵人最多 5 Progress，每個造成 1 傷',
    type: '1x',
    active: {
      run: function* (ctx) {
        const e = yield* chooseEnemy(ctx, 'KC-11', 'Valiance：哪個敵人？', withProgress(ctx.s));
        if (!e) return;
        const k = yield* ctx.chooseNumber('KC-11', '棄幾個 Progress？', 0, Math.min(5, ctx.s.world.enemies[e].progress));
        const n = yield* removeEnemyProgress(ctx, e, k, 'KC-11', 'Valiance');
        yield* woundEnemy(ctx, e, n, 'direct', 'KC-25');
      },
    },
  },
  afterAttach('Valiance+/2', '每個有 Progress 的敵人棄 1 Progress 並受 1 傷', true, function* (ctx) {
    for (const e of withProgress(ctx.s)) {
      yield* removeEnemyProgress(ctx, e, 1, 'KC-11', 'Valiance');
      yield* woundEnemy(ctx, e, 1, 'direct', 'KC-25');
    }
  }),
]);

// ---------------------------------------------------------------- Regain Control

defineCard('Regain Control', [
  {
    key: 'Regain Control/0',
    label: '附著 trance 到 1 個敵人',
    type: '1x',
    active: {
      run: function* (ctx) {
        const e = yield* chooseEnemy(ctx, 'KC-11', 'Regain Control：附著到哪個敵人？', enemiesInPlay(ctx.s));
        if (e) yield* trance(ctx, e);
      },
    },
  },
  {
    key: 'Regain Control/1',
    label: '玩家區每個敵人棄最多 2 Progress，每個造成 1 傷',
    type: '1x',
    active: {
      run: function* (ctx) {
        for (const e of withProgress(ctx.s, playerEnemies(ctx.s))) {
          const n = yield* removeEnemyProgress(ctx, e, 2, 'KC-11', 'Regain Control');
          yield* woundEnemy(ctx, e, n, 'direct', 'KC-25');
        }
      },
    },
  },
  afterAttach('Regain Control/2', '得到這個敵人 Darkness 一半 (進位) 的光', true, (ctx, _src, e) =>
    gainLight(ctx, Math.ceil(enemyDarkness(ctx.s, e) / 2), 'KC-11', 'Regain Control'),
  ),
]);

defineCard('Regain Control+', [
  {
    key: 'Regain Control+/0',
    label: '附著 trance 到玩家區 1 個敵人，MainAttack + 它的 Darkness',
    type: '1x',
    active: {
      run: function* (ctx, src) {
        const e = yield* chooseEnemy(ctx, 'KC-11', 'Regain Control：附著到哪個敵人？', playerEnemies(ctx.s));
        if (e && (yield* trance(ctx, e))) roundMod(ctx, src, 'mainAttack', enemyDarkness(ctx.s, e));
      },
    },
  },
  {
    key: 'Regain Control+/1',
    label: '棄任務區 1 個敵人 1 Progress，Pull 並 Disarm 它',
    type: '1x',
    active: {
      run: function* (ctx) {
        const e = yield* chooseEnemy(ctx, 'KC-11', 'Regain Control：哪個敵人？', withProgress(ctx.s, questEnemies(ctx.s)));
        if (!e) return;
        yield* removeEnemyProgress(ctx, e, 1, 'KC-11', 'Regain Control');
        yield* pull(ctx, e, 'KC-04');
        disarm(ctx, e, 'KC-11');
      },
    },
  },
  moveTranceOnDefeat('Regain Control+/2'),
]);

// ---------------------------------------------------------------- Opportune Moment

defineCard('Opportune Moment', [
  {
    key: 'Opportune Moment/0',
    label: '附著 trance 到每個有 Progress 的敵人，每附著 1 張治療 1',
    type: '1x',
    active: {
      run: function* (ctx) {
        let n = 0;
        for (const e of withProgress(ctx.s)) {
          if (!(yield* trance(ctx, e))) break;
          n++;
        }
        yield* heal(ctx, n, 'KC-11', 'Opportune Moment');
      },
    },
  },
  moveTranceOnDefeat('Opportune Moment/1'),
  afterAttach('Opportune Moment/2', 'Push 每個有 trance 的敵人', true, function* (ctx) {
    for (const e of playerEnemies(ctx.s).filter((x) => isTranced(ctx.s, x))) yield* push(ctx, e, 'KC-04');
  }),
]);

defineCard('Opportune Moment+', [
  {
    key: 'Opportune Moment+/0',
    label: '附著 trance 到 1 個敵人，治療 2',
    type: '1x',
    active: {
      run: function* (ctx) {
        const e = yield* chooseEnemy(ctx, 'KC-11', 'Opportune Moment：附著到哪個敵人？', enemiesInPlay(ctx.s));
        if (e) yield* trance(ctx, e);
        yield* heal(ctx, 2, 'KC-11', 'Opportune Moment');
      },
    },
  },
  {
    key: 'Opportune Moment+/1',
    label: '棄掉敵人身上所有 trance：每張選擇對敵人造成 3 傷或拿回手牌',
    type: '1x',
    active: {
      run: function* (ctx) {
        const s = ctx.s;
        for (const e of enemiesInPlay(s)) {
          for (const a of tranceAttachments(s, e)) {
            const pick = yield* ctx.choose('KC-11', `${cardName(a)} (在 ${cardName(e)})`, [
              { id: 'wound', label: `${cardName(e)} 受 3 傷` },
              { id: 'hand', label: '拿回手牌' },
            ]);
            if (pick === 'hand') {
              s.world.enemies[e].attachments = s.world.enemies[e].attachments.filter((x) => x !== a);
              s.player.hand.push(a);
              ctx.log('KC-11', `${cardName(a)} 回到手牌`);
            } else {
              yield* discardPlayerCard(ctx, a, 'attachment', 'KC-11');
              yield* woundEnemy(ctx, e, 3, 'direct', 'KC-25');
            }
          }
        }
      },
    },
  },
  afterAttach('Opportune Moment+/2', '花其他最多 3 個敵人各 1 Progress，附著 trance 到那個敵人', false, function* (ctx, _src, host) {
    const ids = yield* chooseEnemies(ctx, 'KC-11', '選最多 3 個有 Progress 的其他敵人', withProgress(ctx.s).filter((x) => x !== host), 0, 3);
    for (const e of ids) {
      yield* removeEnemyProgress(ctx, e, 1, 'KC-11', 'Opportune Moment');
      if (!(yield* trance(ctx, e))) break;
    }
  }),
]);

// ---------------------------------------------------------------- Off the Beaten Path

defineCard('Off the Beaten Path', [
  {
    key: 'Off the Beaten Path/0',
    label: '移除最多 3 Path，每個 Pull 1 個敵人並造成 2 × 在場 trance 數的傷害',
    type: '1x',
    active: {
      run: function* (ctx) {
        const s = ctx.s;
        const k = yield* ctx.chooseNumber('KC-11', '移除幾個 Path？', 0, Math.min(3, s.world.location.paths));
        const n = yield* removePath(ctx, k, 'KC-11', 'Off the Beaten Path');
        for (let i = 0; i < n; i++) {
          const e = yield* chooseEnemy(ctx, 'KC-04', `Pull 敵人 (${i + 1}/${n})`, s.world.questArea);
          if (!e) break;
          yield* pull(ctx, e, 'KC-04');
          const tr = enemiesInPlay(s).reduce((n, x) => n + tranceAttachments(s, x).length, 0);
          yield* woundEnemy(ctx, e, 2 * tr, 'direct', 'KC-25');
        }
      },
    },
  },
  {
    key: 'Off the Beaten Path/1',
    label: '有 trance 的敵人擊敗時多 2 XP',
    type: 'Passive',
    modify: (s, _src, q, v) => (q.stat === 'enemyXP' && q.enemy && isTranced(s, q.enemy) ? v + 2 : v),
  },
  afterAttach('Off the Beaten Path/2', '在 2 個敵人上各放 1 Progress', true, function* (ctx) {
    const ids = yield* chooseEnemies(ctx, 'KC-11', '選 2 個敵人放 Progress', enemiesInPlay(ctx.s), Math.min(2, enemiesInPlay(ctx.s).length), 2);
    for (const e of ids) yield* addEnemyProgress(ctx, e, 1, 'KC-11', 'Off the Beaten Path');
  }),
]);

defineCard('Off the Beaten Path+', [
  {
    key: 'Off the Beaten Path+/0',
    label: '手牌所有 trance 附著到沒有 trance 的敵人，造成 3 傷',
    type: '1x',
    active: {
      run: function* (ctx) {
        const s = ctx.s;
        for (const c of s.player.hand.filter((x) => isTrance(s, x))) {
          const targets = enemiesInPlay(s).filter((e) => !tranceAttachments(s, e).length);
          const e = yield* chooseEnemy(ctx, 'KC-17', `${cardName(c)} 附著到哪個敵人？`, targets);
          if (!e) break;
          yield* attachCard(ctx, c, e, 'KC-17');
          yield* woundEnemy(ctx, e, 3, 'direct', 'KC-25');
        }
      },
    },
  },
  {
    key: 'Off the Beaten Path+/1',
    label: '任意數量敵人各棄 1 Progress，每個治療 1，Progress 放到地點',
    type: '1x',
    active: {
      run: function* (ctx) {
        const ids = yield* chooseEnemies(ctx, 'KC-11', '選擇敵人', withProgress(ctx.s), 0, 99);
        for (const e of ids) yield* removeEnemyProgress(ctx, e, 1, 'KC-11', 'Off the Beaten Path');
        yield* heal(ctx, ids.length, 'KC-11', 'Off the Beaten Path');
        yield* placeLocationProgress(ctx, ids.length, 'KC-11', 'Off the Beaten Path');
      },
    },
  },
  afterAttach('Off the Beaten Path+/2', '對這個敵人造成 3 傷', true, (ctx, _src, e) => woundEnemy(ctx, e, 3, 'direct', 'KC-25')),
]);

// ---------------------------------------------------------------- 技能

defineSkill('Prep', [
  {
    key: 'Prep',
    label: '橫置這個技能；然後最多 2 次：交換 2 個技能的方塊 (不含 Prep)',
    type: '1x',
    active: {
      run: function* (ctx) {
        const s = ctx.s;
        const me = findSkill(s, 'Prep')!;
        if (me.exhausted) {
          ctx.log('KC-12c', 'Prep：已經橫置，不能結算「Then」之後的部分');
          return;
        }
        me.exhausted = true;
        ctx.log('KC-18', '橫置 Prep');
        const others = s.player.skills.filter((k) => k.name !== 'Prep');
        const opt = (k: (typeof others)[number]) => ({ id: k.name, label: `${k.name} (${k.cubeElement}${k.exhausted ? ' ×' : ''})` });
        for (let i = 0; i < 2; i++) {
          const x = yield* ctx.choose('KC-19', `Prep：交換方塊 (${i + 1}/2)：第 1 個技能`, [...others.map(opt), { id: 'done', label: '結束' }]);
          if (x === 'done') break;
          const y = yield* ctx.choose('KC-19', `Prep：和 ${x} 交換的技能`, others.filter((k) => k.name !== x).map(opt));
          const a = s.player.skills.find((k) => k.name === x)!;
          const b = s.player.skills.find((k) => k.name === y)!;
          [a.cubeElement, b.cubeElement] = [b.cubeElement, a.cubeElement];
          [a.exhausted, b.exhausted] = [b.exhausted, a.exhausted];
          ctx.log('KC-19', `交換 ${a.name} 與 ${b.name} 的方塊`);
        }
      },
    },
  },
]);

defineLingering({
  key: 'Solitude/push',
  label: '本回合 push 的敵人受 1 傷',
  trigger: {
    event: 'EnemyMovedToQuest',
    timing: 'after',
    mandatory: true,
    filter: (_s, _src, ev) => ev.cause === 'push',
    run: (ctx, _src, ev) => woundEnemy(ctx, ev.enemy as string, 1, 'direct', 'KC-25'),
  },
});

defineSkill('Solitude', [
  {
    key: 'Solitude',
    label: 'Engagement 結束：push 1 個敵人並造成 1 傷；任務區敵人比玩家區多時，本回合 push 的敵人都受 1 傷',
    type: '1x',
    phaseEnd: {
      phase: 'engagement',
      mandatory: false,
      run: function* (ctx, src) {
        const s = ctx.s;
        const e = yield* chooseEnemy(ctx, 'KC-04', 'Solitude：push 哪個敵人？', playerEnemies(s));
        if (e) {
          yield* push(ctx, e, 'KC-04');
          yield* woundEnemy(ctx, e, 1, 'direct', 'KC-25');
        }
        if (s.world.questArea.length > s.world.playerArea.length) {
          for (const id of s.roundState.pushedThisRound) if (id !== e && s.world.enemies[id]) yield* woundEnemy(ctx, id, 1, 'direct', 'KC-25');
          addLingering(ctx, 'Solitude/push', src);
        }
      },
    },
  },
]);

defineSkill('Find a Way', [
  {
    key: 'Find a Way',
    label: '效果 push 敵人之後，多 push 1 個敵人並 Path +1',
    type: 'MandatoryUnrestricted',
    trigger: {
      event: 'EnemyMovedToQuest',
      timing: 'after',
      mandatory: true,
      filter: (s, src, ev) => ev.cause === 'push' && ev.by !== src.id && (ev.seq === -1 || !s.roundState.flags[`findAWay:${ev.seq}`]),
      run: function* (ctx, _src, ev) {
        if (ev.seq !== -1) ctx.s.roundState.flags[`findAWay:${ev.seq}`] = 1;
        const e = yield* chooseEnemy(ctx, 'KC-04', 'Find a Way：再 push 1 個敵人', playerEnemies(ctx.s));
        if (e) yield* push(ctx, e, 'KC-04');
        yield* addPath(ctx, 1, 'KC-18', 'Find a Way');
      },
    },
  },
]);

defineSkill('Gather Strength', [
  {
    key: 'Gather Strength',
    label: '附著 trance 到敵人後，棄它 1 Progress 來結算那張 trance 的行動',
    type: '1x',
    trigger: {
      event: 'CardAttached',
      timing: 'after',
      mandatory: false,
      filter: (s, _src, ev) => isTrance(s, ev.card as string) && (s.world.enemies[ev.target as string]?.progress ?? 0) > 0,
      run: function* (ctx, _src, ev) {
        const s = ctx.s;
        const card = ev.card as string;
        const defs = defsForCard(s, card).filter((d) => d.active && !isEager(d));
        if (!defs.length) return;
        yield* removeEnemyProgress(ctx, ev.target as string, 1, 'KC-18', 'Gather Strength');
        const i = defs.length === 1 ? '0' : yield* ctx.choose('KC-18', `Gather Strength：結算 ${cardName(card)} 的哪個行動？`, defs.map((d, k) => ({ id: String(k), label: d.label })));
        const d = defs[Number(i)];
        const src: Source = { id: `card:${card}`, kind: 'card', name: playerCard(card).name, cardId: card };
        ctx.log('KC-18', `Gather Strength：結算 ${cardName(card)}：${d.label}`);
        yield* runEffect(ctx, src, d, () => d.active!.run(ctx, src));
      },
    },
  },
]);

/** Singular Focus 能不能用 (打出行動組前，以將打出的加成卡元素判斷) */
function singularFocusReady(s: GameState, element: string | null | undefined): boolean {
  const sk = findSkill(s, 'Singular Focus');
  if (!sk || !skillUnlocked(s, sk)) return false;
  if ((s.roundState.usage['skill:Singular Focus#Singular Focus'] ?? 0) > 0) return false;
  return sk.activatedByExhaust || (!sk.exhausted && (sk.cubeElement === element || sk.cubeElement === s.roundState.activeElement));
}

defineSkill('Singular Focus', [
  {
    key: 'Singular Focus',
    label: '打出 MainExplore > MainAttack 的攻擊卡時光費 −2；然後可以在任務區最多 3 個敵人各放 1 Progress',
    type: '1x',
    alwaysListed: true,
    modify: (s, _src, q, v) =>
      q.stat === 'lightCost' && q.slot === 'attack' && q.card && printedMain(s, q.card, 'explore') > printedMain(s, q.card, 'attack') && singularFocusReady(s, q.element)
        ? v - 2
        : v,
    trigger: {
      event: 'CardPlayed',
      timing: 'when',
      mandatory: true,
      filter: (s, _src, ev) => ev.slot === 'attack' && printedMain(s, ev.card as string, 'explore') > printedMain(s, ev.card as string, 'attack') && singularFocusReady(s, s.roundState.activeElement),
      run: function* (ctx) {
        ctx.log('KC-18', 'Singular Focus：攻擊卡光費 −2');
        const ids = yield* chooseEnemies(ctx, 'KC-18', 'Singular Focus：在任務區最多 3 個敵人各放 1 Progress', questEnemies(ctx.s), 0, 3);
        for (const e of ids) yield* addEnemyProgress(ctx, e, 1, 'KC-18', 'Singular Focus');
      },
    },
  },
]);

