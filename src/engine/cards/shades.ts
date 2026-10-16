// Shade：正面 (敵人) 效果與背面特殊規則 (SH-01)。數值表見 ../shades.ts。
import { cardName } from '../data';
import { defineCard, defineShade } from '../effects';
import { pull, push, spendXP } from '../ops';
import { isFinalCandidate } from '../calc';

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
