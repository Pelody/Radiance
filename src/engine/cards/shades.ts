// Shade：正面 (敵人) 效果與背面特殊規則 (SH-01)。數值表見 ../shades.ts。
import { cardName, locationCard, treacheryCard } from '../data';
import { defineCard, defineLingering, defineShade, defsForCard, type Source } from '../effects';
import { addLingering, distribute, pull, push, runEffect, spendXP, woundEnemy } from '../ops';
import { isFinalCandidate, isFinalLocation } from '../calc';

defineCard('Greed', [
  {
    key: 'Greed/0',
    label: '花 3 XP Push 或 Pull Greed',
    perRound: 1, // EE-21 Once per round
    active: {
      available: (s) => (s.player.xp < 3 ? '需要 3 XP' : null),
      run: function* (ctx, src) {
        const id = src.cardId!;
        yield* spendXP(ctx, 3, 'EE-05', cardName(id));
        if (ctx.s.world.playerArea.includes(id)) yield* push(ctx, id, 'KC-04');
        else yield* pull(ctx, id, 'KC-04');
      },
    },
  },
]);

defineShade('Greed', [
  {
    key: 'Greed/special/travel',
    label: '探索至少 2 個其他地點前不能前往最終地點',
    restrict: (s, _src, r) =>
      r.kind === 'travelTo' && isFinalCandidate(s, r.location) && s.world.exploredCount < 2
        ? `Greed：探索至少 2 個其他地點後才能前往最終地點 (已探索 ${s.world.exploredCount})`
        : null,
  },
  {
    key: 'Greed/special/fetch',
    label: 'Fetch 費用 3 XP',
    modify: (_s, _src, q, v) => (q.stat === 'fetchCost' ? 3 : v),
  },
]);

// ---------------------------------------------------------------- Pride

defineLingering({
  key: 'Pride/aura',
  label: '接戰的敵人 +2 攻擊 (Pride 被擊敗的回合剩餘時間)',
  modify: (s, _src, q, v) => (q.stat === 'enemyAttack' && q.enemy && s.world.playerArea.includes(q.enemy) ? v + 2 : v),
});

defineCard('Pride', [
  {
    key: 'Pride/0',
    label: '{Player} 接戰的敵人 +2 攻擊',
    zone: 'player',
    modify: (s, _src, q, v) => (q.stat === 'enemyAttack' && q.enemy && s.world.playerArea.includes(q.enemy) ? v + 2 : v),
    whenDefeated: function* (ctx, src) {
      if (src.params?.zone === 'player') addLingering(ctx, 'Pride/aura', src);
    },
  },
  {
    key: 'Pride/1',
    label: '{Player} Engagement Phase 結束時可以 push Pride',
    zone: 'player',
    phaseEnd: { phase: 'engagement', mandatory: false, run: (ctx, src) => push(ctx, src.cardId!, 'KC-04') },
  },
]);

const PRIDE_EARLY = ['Ruins of Crowbridge', 'Nul-Gador', 'Wrath Marshes'];

defineShade('Pride', [
  {
    key: 'Pride/special/fast',
    label: '最終地點探索後 Pride 為 Fast',
    initiative: (s, _src, id, v) =>
      cardName(id) === 'Pride' && s.world.finalLocation && isFinalLocation(s, s.world.location.id) && s.world.location.explored ? 'Fast' : v,
  },
  {
    key: 'Pride/location/exception',
    label: '在 Ruins of Crowbridge、Nul-Gador 或 Wrath Marshes 完成 Treachery：下一個 Staging 結束時揭示 Pride',
    trigger: {
      event: 'TreacheryCompleted',
      timing: 'when',
      mandatory: true,
      filter: (s) => !s.world.shadeRevealed && !s.world.shadeRevealPending && PRIDE_EARLY.includes(locationCard(s.world.location.id).name),
      run: function* (ctx) {
        ctx.s.world.shadeRevealPending = true;
        ctx.log('SH-02', `在 ${locationCard(ctx.s.world.location.id).name} 完成 Treachery：下一個 Staging 結束時揭示 Pride`);
      },
    },
  },
]);

// ---------------------------------------------------------------- Wrath

defineCard('Wrath', [
  {
    key: 'Wrath/0',
    label: 'Engagement Phase 開始：翻開 Treachery 牌庫頂端並結算 When Completed；攻擊 X = 它的 PV',
    phaseStart: {
      phase: 'engagement',
      mandatory: true,
      run: function* (ctx) {
        const w = ctx.s.world;
        const tid = w.treacheryDeck.shift();
        if (!tid) {
          ctx.log('OPEN-03', 'Wrath：Treachery 牌庫已空');
          return;
        }
        ctx.revealInfo();
        w.wrathTreachery = tid;
        const t = treacheryCard(tid);
        ctx.log('SH-01', `Wrath 翻開 ${t.name} (PV ${t.progress_value} = Wrath 的攻擊 X)；結算 When Completed (不算完成)`);
        const def = defsForCard(ctx.s, tid).find((d) => d.whenCompleted);
        if (def?.whenCompleted) {
          const src: Source = { id: `wrath:${tid}`, kind: 'legacy', name: t.name, cardId: tid, params: { wrath: true } };
          yield* runEffect(ctx, src, def, () => def.whenCompleted!(ctx, src));
        }
      },
    },
    // KC-05a：沒有翻開的 Treachery 時 X = 1
    modify: (s, src, q, v) =>
      q.stat === 'enemyAttack' && q.enemy === src.cardId ? v + (s.world.wrathTreachery ? treacheryCard(s.world.wrathTreachery).progress_value : 1) : v,
  },
]);

// ---------------------------------------------------------------- Envy

defineCard('Envy', [
  {
    key: 'Envy/0',
    label: '{Player} 攻擊 Envy 時，前 4 個傷害改放到玩家區其他敵人身上',
    zone: 'player',
    trigger: {
      event: 'WillWoundEnemy',
      timing: 'will',
      mandatory: true,
      filter: (s, src, ev) => ev.enemy === src.cardId && ev.source === 'attack' && s.world.playerArea.some((x) => x !== src.cardId),
      run: function* (ctx, src, ev) {
        const k = Math.min(4, ev.n as number);
        ev.n = (ev.n as number) - k;
        const others = ctx.s.world.playerArea.filter((x) => x !== src.cardId);
        const dist = yield* distribute(ctx, 'EE-03', 'Envy：把傷害分配給玩家區其他敵人', others, k);
        ctx.log('EE-03', `Envy：${k} 傷害改放到其他敵人身上`);
        for (const [id, n] of Object.entries(dist)) yield* woundEnemy(ctx, id, n, 'direct', 'EE-03');
      },
    },
  },
]);

defineShade('Envy', [
  {
    key: 'Envy/special/attach',
    label: '進入玩家區的敵人附著到玩家區附著敵人最少的地點',
    trigger: {
      event: 'EnemyEnteredPlayer',
      timing: 'when',
      mandatory: true,
      filter: (s) => s.world.envyLocations.length > 0,
      run: function* (ctx, _src, ev) {
        const w = ctx.s.world;
        const count = (lid: string) => Object.values(w.envyAttach).filter((x) => x === lid).length;
        const min = Math.min(...w.envyLocations.map((l) => count(l.id)));
        const cands = w.envyLocations.filter((l) => count(l.id) === min).map((l) => l.id);
        const lid =
          cands.length === 1
            ? cands[0]
            : yield* ctx.choose('SH-01', `${cardName(ev.enemy as string)} 附著到哪個地點？`, cands.map((id) => ({ id, label: cardName(id) })));
        w.envyAttach[ev.enemy as string] = lid;
        ctx.log('SH-01', `${cardName(ev.enemy as string)} 附著到玩家區的 ${cardName(lid)}`);
      },
    },
  },
  {
    key: 'Envy/special/attack',
    label: '不能攻擊附著在地點上的敵人',
    restrict: (s, _src, r) => (r.kind === 'attack' && s.world.envyAttach[r.enemy] ? 'Envy：附著在地點上的敵人不能被攻擊' : null),
  },
]);
