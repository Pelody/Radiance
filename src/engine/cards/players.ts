// 玩家卡與技能的效果。
import { enemyCard } from '../data';
import { defineCard, defineLingering, defineSkill } from '../effects';
import { addLingering, chooseEnemy, dealSelfWound, pull } from '../ops';

// ---------------------------------------------------------------- Justice

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
        ctx.s.roundState.mods.push({ stat: 'mainAttack', value: 2 * n, sourceId: src.id }); // EE-06 本回合
        ctx.log('EE-06', `本回合 MainAttack +${2 * n}`);
      },
    },
  },
]);

/** Justice 技能 Shout：Pull 1 Slow 敵人；本回合每次擊敗 Fast 敵人後，Pull 1 Fast 敵人 */
defineSkill('Shout', [
  {
    key: 'Shout',
    label: 'Pull 1 Slow 敵人；本回合擊敗 Fast 敵人後 Pull 1 Fast 敵人',
    type: '1x',
    rule: 'KC-18',
    active: {
      run: function* (ctx, src) {
        const slow = ctx.s.world.questArea.filter((id) => enemyCard(id).initiative === 'Slow');
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
      const fast = ctx.s.world.questArea.filter((id) => enemyCard(id).initiative === 'Fast');
      const id = yield* chooseEnemy(ctx, 'KC-04', 'Shout：Pull 1 個 Fast 敵人', fast);
      if (id) yield* pull(ctx, id, 'KC-04');
      else ctx.log('KC-12c', 'Shout：任務區沒有 Fast 敵人');
    },
  },
});
