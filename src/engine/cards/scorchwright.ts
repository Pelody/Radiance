// Scorchwright：卡片 (基礎面 / 進階面 `+`) 與技能。fire 卡 = 有 Fire 特質的卡；附著在敵人或地點上。
import { cardTraits, fireAttachments, isFinalLocation } from '../calc';
import { cardName, locationCard } from '../data';
import { defineCard, defineLingering, defineSkill } from '../effects';
import type { Ctx, Gen } from '../core';
import {
  addLingering,
  addObstacle,
  attachCard,
  chooseCards,
  chooseEnemies,
  chooseEnemy,
  discardPlayerCard,
  distribute,
  drawCards,
  emit,
  gainXP,
  push,
  regenerate,
  removeLocationProgress,
  removeObstacle,
  spendLight,
  woundEnemy,
} from '../ops';
import { shuffle } from '../rng';
import { checkExplored, placeLocationProgress, travel } from '../world';
import type { GameState } from '../types';
import { attachWithTrait, enemiesInPlay, playerEnemies, saveBeaconsFromDiscard } from './util';

const isFire = (s: GameState, c: string) => cardTraits(s, c).includes('Fire');
const locFire = (s: GameState) => s.world.location.attachments.filter((a) => isFire(s, a));
const ASH_TERRAIN = ['Plant', 'Tree', 'Thorn', 'DeadTree'];

function* mayDraw(ctx: Ctx, max: number, why: string): Gen {
  const n = yield* ctx.chooseNumber('KC-11', `${why}：抽幾張？`, 0, max);
  if (n) yield* drawCards(ctx, n, 'KC-11', why);
}

// ---------------------------------------------------------------- Fan the Flame

defineLingering({
  key: 'Fan the Flame/after',
  label: '結算附著效果後，附著最多 2 張 fire 卡到玩家區 1 個敵人',
  trigger: {
    event: 'CardAttached',
    timing: 'after',
    mandatory: false,
    filter: (s, src, ev) => ev.by !== src.id && s.world.playerArea.length > 0,
    run: function* (ctx, src) {
      ctx.s.lingering = ctx.s.lingering.filter((l) => `linger:${l.uid}` !== src.id);
      const e = yield* chooseEnemy(ctx, 'KC-17', 'Fan the Flame：附著到哪個敵人？', playerEnemies(ctx.s));
      if (!e) return;
      for (let i = 0; i < 2; i++) {
        const go = yield* ctx.choose('KC-17', `Fan the Flame：再附著 1 張 fire 卡？(${i + 1}/2)`, [
          { id: 'yes', label: '附著' },
          { id: 'no', label: '不要' },
        ]);
        if (go === 'no' || !(yield* attachWithTrait(ctx, 'Fire', e, 'KC-17'))) break;
      }
    },
  },
});

defineCard('Fan the Flame', [
  {
    key: 'Fan the Flame/0',
    label: '可以抽 1 張；然後結算附著效果後，附著最多 2 張 fire 卡到玩家區 1 個敵人',
    type: '1x',
    active: {
      run: function* (ctx, src) {
        yield* mayDraw(ctx, 1, 'Fan the Flame');
        addLingering(ctx, 'Fan the Flame/after', src);
      },
    },
  },
]);

defineCard('Fan the Flame+', [
  {
    key: 'Fan the Flame+/0',
    label: '可以抽 2 張；然後已經有 fire 卡的敵人各再附著 1 張 (可以來自棄牌堆)',
    type: '1x',
    active: {
      run: function* (ctx) {
        yield* mayDraw(ctx, 2, 'Fan the Flame');
        for (const e of enemiesInPlay(ctx.s).filter((x) => fireAttachments(ctx.s, x).length)) {
          if (!(yield* attachWithTrait(ctx, 'Fire', e, 'KC-17', true))) break;
        }
      },
    },
  },
]);

// ---------------------------------------------------------------- Shortcut

defineCard('Shortcut', [
  {
    key: 'Shortcut/0',
    label: '地點有 3+ Progress 時放 3 個；6+ 時改放 5 個 (Refresh Phase 不能用)',
    type: '1x',
    active: {
      available: (s) => (s.phase === 'refresh' ? 'Refresh Phase 不能使用' : s.world.location.progress < 3 ? '地點 Progress 少於 3' : null),
      run: (ctx) => placeLocationProgress(ctx, ctx.s.world.location.progress >= 6 ? 5 : 3, 'KC-11', 'Shortcut'),
    },
  },
]);

defineCard('Shortcut+', [
  {
    key: 'Shortcut+/0',
    label: '在地點放 2 × Threat token 數的 Progress',
    type: '1x',
    active: { phases: ['explore'], run: (ctx) => placeLocationProgress(ctx, 2 * ctx.s.world.location.threatTokens, 'KC-11', 'Shortcut') },
  },
  {
    key: 'Shortcut+/1',
    label: 'Refresh Phase 不在地點放 Threat token',
    type: 'Passive',
    modify: (_s, _src, q, v) => (q.stat === 'flag' && q.flag === 'noRefreshThreatToken' ? v + 1 : v),
  },
]);

// ---------------------------------------------------------------- Scout Ahead

defineCard('Scout Ahead', [
  {
    key: 'Scout Ahead/0',
    label: '加最多 3 個 Obstacle；每個從牌庫或棄牌堆拿 1 張 fire 卡到手牌；洗牌庫',
    type: '1x',
    active: {
      run: function* (ctx) {
        const s = ctx.s;
        const p = s.player;
        const n = yield* ctx.chooseNumber('KC-11', 'Scout Ahead：加幾個 Obstacle？', 0, 3);
        if (!n) return;
        yield* addObstacle(ctx, n, 'KC-11', 'Scout Ahead');
        ctx.revealInfo();
        const cands = [...p.deck, ...p.discard].filter((c) => isFire(s, c));
        const picks = yield* chooseCards(ctx, 'KC-11', `Scout Ahead：選 ${n} 張 fire 卡`, cands, Math.min(n, cands.length), n);
        for (const c of picks) {
          p.deck = p.deck.filter((x) => x !== c);
          p.discard = p.discard.filter((x) => x !== c);
          p.hand.push(c);
        }
        ctx.log('KC-11', `Scout Ahead：${picks.map(cardName).join('、')} 加入手牌`);
        const [d, rng] = shuffle(p.deck, s.rng);
        s.rng = rng;
        p.deck = d;
        p.deckTopKnown = false;
        ctx.log('KC-11', '洗牌庫');
      },
    },
  },
]);

defineCard('Scout Ahead+', [
  {
    key: 'Scout Ahead+/0',
    label: '從地點棄牌堆保存最多 3 個信標',
    type: '1x',
    active: { run: function* (ctx) { yield* saveBeaconsFromDiscard(ctx, 3, 'KC-11', 'Scout Ahead'); } },
  },
]);

// ---------------------------------------------------------------- Easy Target

defineCard('Easy Target', [
  {
    key: 'Easy Target/0',
    label: 'Burnout 結算後，對 1 個受到它傷害的敵人再造成 3 傷',
    type: 'MandatoryUnrestricted',
    trigger: {
      event: 'BurnoutResolved',
      timing: 'after',
      mandatory: true,
      run: function* (ctx, _src, ev) {
        const hit = (ev.hit as string[]).filter((e) => ctx.s.world.enemies[e]);
        const e = yield* chooseEnemy(ctx, 'KC-25', 'Easy Target：+3 傷害給誰？', hit);
        if (e) yield* woundEnemy(ctx, e, 3, 'direct', 'KC-25');
      },
    },
  },
]);

defineCard('Easy Target+', [
  {
    key: 'Easy Target+/0',
    label: 'Burnout 結算後，每個受到它傷害的敵人再受 3 傷',
    type: 'MandatoryUnrestricted',
    trigger: {
      event: 'BurnoutResolved',
      timing: 'after',
      mandatory: true,
      run: function* (ctx, _src, ev) {
        for (const e of ev.hit as string[]) if (ctx.s.world.enemies[e]) yield* woundEnemy(ctx, e, 3, 'direct', 'KC-25');
      },
    },
  },
]);

// ---------------------------------------------------------------- Burning Bright

defineCard('Burning Bright', [
  {
    key: 'Burning Bright/0',
    label: '地點有 fire 附著時完成探索：移動時每次抽 3 張地點選 1 張，其他 cycle',
    type: '1x',
    trigger: {
      event: 'LocationExplored',
      timing: 'when',
      mandatory: false,
      filter: (s, _src, ev) => !ev.final && !ev.envy && locFire(s).length > 0,
      run: function* (ctx) {
        ctx.s.roundState.flags.burningBright = 1;
        ctx.log('KC-11', 'Burning Bright：這次移動每次抽 3 張地點');
      },
    },
  },
]);

defineCard('Burning Bright+', [
  {
    key: 'Burning Bright+/0',
    label: '棄掉任意數量附著在敵人與地點的 fire 卡：敵人受 6 傷；地點 +7 Progress',
    type: '1x',
    active: {
      run: function* (ctx) {
        const s = ctx.s;
        const opts = [
          ...enemiesInPlay(s).flatMap((e) => fireAttachments(s, e).map((a) => ({ a, e }))),
          ...locFire(s).map((a) => ({ a, e: 'location' })),
        ];
        const picks = yield* chooseCards(ctx, 'KC-11', 'Burning Bright：棄掉哪些 fire 附著？', opts.map((o) => o.a), 0, opts.length);
        for (const a of picks) {
          const o = opts.find((x) => x.a === a)!;
          yield* discardPlayerCard(ctx, a, 'attachment', 'KC-11');
          if (o.e === 'location') yield* placeLocationProgress(ctx, 7, 'KC-11', 'Burning Bright');
          else yield* woundEnemy(ctx, o.e, 6, 'direct', 'KC-25');
        }
      },
    },
  },
]);

// ---------------------------------------------------------------- Resourceful

defineCard('Resourceful', [
  {
    key: 'Resourceful/0',
    label: '行動、探索、加成卡中的 fire 卡改為各附著到玩家區不同的敵人，每個受 2 傷',
    type: '1x',
    active: {
      phases: ['refresh'],
      run: function* (ctx) {
        const s = ctx.s;
        const a = s.player.actionSet;
        const fire = [a.action, a.explore, a.booster].filter((c): c is string => !!c && isFire(s, c));
        const used: string[] = [];
        for (const c of fire) {
          const e = yield* chooseEnemy(ctx, 'KC-17', `Resourceful：${cardName(c)} 附著到哪個敵人？`, playerEnemies(s).filter((x) => !used.includes(x)));
          if (!e) break;
          used.push(e);
          yield* attachCard(ctx, c, e, 'KC-17');
          yield* woundEnemy(ctx, e, 2, 'direct', 'KC-25');
        }
      },
    },
  },
]);

defineCard('Resourceful+', [
  {
    key: 'Resourceful+/0',
    label: '可以抽最多 3 張；地點棄牌堆每個 Plant/Tree/Thorn/DeadTree 地點，可以在地點放最多 2 Progress',
    type: '1x',
    active: {
      run: function* (ctx) {
        yield* mayDraw(ctx, 3, 'Resourceful');
        const n = ctx.s.world.locationDiscard.filter((l) => locationCard(l).trait_icons.some((t) => ASH_TERRAIN.includes(t))).length;
        const k = yield* ctx.chooseNumber('KC-11', `Resourceful：放多少 Progress？(最多 ${2 * n})`, 0, 2 * n);
        yield* placeLocationProgress(ctx, k, 'KC-11', 'Resourceful');
      },
    },
  },
]);

// ---------------------------------------------------------------- 技能

defineSkill('Blazing Torch', [
  {
    key: 'Blazing Torch',
    label: '附著 X+1 張 fire 卡到玩家區敵人；然後 push X 個敵人 (X = 手牌的進階面卡數)',
    type: '1x',
    active: {
      run: function* (ctx) {
        const s = ctx.s;
        const x = Math.max(1, s.player.hand.filter((c) => s.player.upgraded.includes(c)).length); // KC-05a
        let attached = 0;
        for (let i = 0; i < x + 1; i++) {
          const e = yield* chooseEnemy(ctx, 'KC-17', `Blazing Torch：fire 卡附著到哪個敵人？(${i + 1}/${x + 1})`, playerEnemies(s));
          if (!e || !(yield* attachWithTrait(ctx, 'Fire', e, 'KC-17'))) break;
          attached++;
        }
        if (attached < x + 1) {
          ctx.log('KC-12c', 'Blazing Torch：沒有全部附著，不結算「Then」之後的部分');
          return;
        }
        const ids = yield* chooseEnemies(ctx, 'KC-04', `Blazing Torch：push ${x} 個敵人`, playerEnemies(s), Math.min(x, s.world.playerArea.length), x);
        for (const e of ids) yield* push(ctx, e, 'KC-04');
      },
    },
  },
]);

defineSkill('Sabotage', [
  {
    key: 'Sabotage',
    label: '探索地點後多得 3 XP',
    type: 'MandatoryUnrestricted',
    trigger: { event: 'LocationExplored', timing: 'after', mandatory: true, run: (ctx) => gainXP(ctx, 3, 'KC-18', 'Sabotage') },
  },
]);

defineSkill('Slash and Burn', [
  {
    key: 'Slash and Burn',
    label: '地點是 Plant/Tree/Thorn/DeadTree 時附著 1 張 fire 卡 (最終地點也可以，但要花 2 光)；然後 Regenerate 1',
    type: '1x',
    active: {
      available: (s) => {
        const final = isFinalLocation(s, s.world.location.id);
        if (final) return s.player.light >= 2 ? null : '最終地點需要花 2 光';
        return cardTraits(s, s.world.location.id).some((t) => ASH_TERRAIN.includes(t)) ? null : '地點不是 Plant/Tree/Thorn/DeadTree';
      },
      run: function* (ctx) {
        const s = ctx.s;
        if (isFinalLocation(s, s.world.location.id)) yield* spendLight(ctx, 2, 'KC-18', 'Slash and Burn');
        if (!(yield* attachWithTrait(ctx, 'Fire', 'location', 'KC-17'))) return;
        regenerate(ctx, 1, 'KC-18', 'Slash and Burn');
      },
    },
  },
]);

defineSkill('Burnout', [
  {
    key: 'Burnout',
    label: '每個 fire 附著對敵人造成 3 傷',
    type: '1x',
    active: {
      phases: ['refresh'],
      run: function* (ctx) {
        const s = ctx.s;
        const hit: string[] = [];
        for (const e of enemiesInPlay(s)) {
          const n = fireAttachments(s, e).length;
          if (!n) continue;
          hit.push(e);
          yield* woundEnemy(ctx, e, 3 * n, 'direct', 'KC-25');
        }
        yield* emit(ctx, { t: 'BurnoutResolved', hit });
      },
    },
  },
]);

defineSkill('From the Ashes', [
  {
    key: 'From the Ashes',
    label: '方塊也有 Blazing Torch 方塊的元素；附著卡時可以選棄牌堆的卡',
    type: 'Passive',
    cubeAlsoElementOf: 'Blazing Torch',
    modify: (_s, _src, q, v) => (q.stat === 'flag' && q.flag === 'attachFromDiscard' ? v + 1 : v),
  },
]);

defineSkill('Cut and Run', [
  {
    key: 'Cut and Run',
    label: '移除最多 2 個 Obstacle；可以忽略 1 個敵人與 1 張在場卡片各 1 個特質',
    type: '1x',
    active: {
      run: function* (ctx) {
        const s = ctx.s;
        const n = yield* ctx.chooseNumber('KC-18', 'Cut and Run：移除幾個 Obstacle？', 0, Math.min(2, s.world.location.obstacles));
        yield* removeObstacle(ctx, n, 'KC-18', 'Cut and Run');
        for (const pool of [enemiesInPlay(s), [...Object.values(s.player.actionSet).filter((x): x is string => !!x)]]) {
          const opts = pool.filter((id) => cardTraits(s, id).length);
          if (!opts.length) continue;
          const t = yield* ctx.choose('KC-16', 'Cut and Run：忽略哪張卡的特質？', [...opts.map((id) => ({ id, label: cardName(id) })), { id: 'none', label: '不要' }]);
          if (t === 'none') continue;
          const tr = yield* ctx.choose('KC-16', `忽略 ${cardName(t)} 的哪個特質？`, cardTraits(s, t).map((x) => ({ id: x, label: x })));
          s.roundState.removedTraits.push({ target: t, trait: tr });
          ctx.log('KC-16', `本回合忽略 ${cardName(t)} 的 ${tr}`);
        }
      },
    },
  },
]);

defineSkill('Firestorm', [
  {
    key: 'Firestorm',
    label: '地點有 fire 附著：把等於地點 Progress 的傷害分配給玩家區敵人，然後移動 (不算探索)；最終地點改為 2 倍傷害並移除 Progress 與附著',
    type: '1x',
    active: {
      available: (s) => (locFire(s).length ? null : '地點沒有 fire 附著'),
      run: function* (ctx) {
        const s = ctx.s;
        const final = isFinalLocation(s, s.world.location.id);
        const n = s.world.location.progress * (final ? 2 : 1);
        const dist = yield* distribute(ctx, 'KC-18', 'Firestorm：傷害分配給哪個敵人', playerEnemies(s), n);
        for (const [e, k] of Object.entries(dist)) yield* woundEnemy(ctx, e, k, 'direct', 'KC-25');
        if (final) {
          yield* removeLocationProgress(ctx, s.world.location.progress, 'KC-18', 'Firestorm');
          for (const a of locFire(s)) yield* discardPlayerCard(ctx, a, 'attachment', 'KC-18');
          yield* checkExplored(ctx); // FL-03
          return;
        }
        yield* travel(ctx, false);
      },
    },
  },
]);

