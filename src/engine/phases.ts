// 回合議程 (05-round-flow.md)：8 個階段依序進行，每個階段的步驟與窗口位置見 EE-18。
import type { Answer, Ctx, Gen, Option } from './core';
import { cardName, shadeFront } from './data';
import { activeEffects, isMandatory, usageKey } from './effects';
import {
  apAvailable,
  apBreakdown,
  echo,
  enemyAttack,
  enemyDarkness,
  enemyDefenseVs,
  enemyTypes,
  engagementCount,
  epBreakdown,
  face,
  handSize,
  isFinalLocation,
  lightCost,
  lightProduction,
  locationEV,
  questDarkness,
  restValue,
  shadeInfluenceEffect,
  threatBreakdown,
} from './calc';
import {
  addObstacle,
  addThreatTokens,
  assert,
  discardPlayerCard,
  drawCards,
  emit,
  enemyToPlayer,
  flushAfter,
  freeLightAvailable,
  gainLight,
  gainXP,
  gameAction,
  heal,
  lose,
  placeInQuest,
  placeTreacheryProgress,
  reshuffleDeck,
  revealEnemy,
  runEffect,
  spendLight,
  spendXP,
  woundEnemy,
  woundPlayer,
} from './ops';
import { shadeInfo } from './shades';
import { engagementSegment } from './tracks';
import { emptyRoundState, PHASE_NAMES, type Phase } from './types';
import { boundaryWindow, generalWindow, type WindowChoice } from './window';
import { placeLocationProgress } from './world';
import { GameOver } from './core';

// ---------------------------------------------------------------- P1 Staging

/** KC-30 Reveal 未指定牌庫時 (⚠ INTERP)：依 P1-02，剩餘需求 ≥ 5 翻 Doom，否則 Dusk */
export function deckForRemaining(remaining: number): 'Dusk' | 'Doom' {
  return remaining >= 5 ? 'Doom' : 'Dusk';
}

function* staging(ctx: Ctx): Gen<Phase> {
  const s = ctx.s;
  const rs = s.roundState;
  yield* boundaryWindow(ctx, 'staging', 'start');

  // SH-03 Shade 揭示回合：結算 Shade 影響墊目前格子的圖示
  if (rs.revealShadeThisRound) {
    const fx = shadeInfluenceEffect(s);
    if (fx.threat) {
      rs.shadeInfluenceThreat = fx.threat;
      ctx.log('SH-03', `Shade Influence：本回合威脅 +${fx.threat}`);
    }
    if (fx.xp) yield* gainXP(ctx, fx.xp, 'SH-03', 'Shade Influence');
    if (!fx.threat && !fx.xp) ctx.log('SH-03', 'Shade Influence：沒有效果');
  }

  // P1-01 / P1-02：翻敵人是遊戲動作，中間沒有窗口 (EE-18)
  yield* gameAction(ctx, function* () {
    const t = threatBreakdown(s);
    ctx.log('P1-01', `Threat ${t.total} (軌道 ${t.track} + Threat token ${t.tokens}${t.shade ? ` + Shade ${t.shade}` : ''}${t.other ? ` + 效果 ${t.other}` : ''})`);
    let remaining = t.total;
    while (remaining > 0) {
      const deck = deckForRemaining(remaining);
      const id = yield* revealEnemy(ctx, deck, 'P1-02');
      if (!id) break;
      remaining -= enemyDarkness(s, id);
      ctx.log('P1-02', `剩餘 ${Math.max(0, remaining)}`);
    }
  });

  yield* generalWindow(ctx, 'staging', 'Staging：翻完敵人');
  yield* boundaryWindow(ctx, 'staging', 'end');

  // P1-03 / SH-04：Staging 全部完成後 Shade 才進場
  if (rs.revealShadeThisRound && !s.world.shadeRevealed) yield* shadeEnters(ctx);
  return 'actionSet';
}

/** SH-04 Shade 以敵人身分進入任務區，結算 When Revealed */
function* shadeEnters(ctx: Ctx): Gen {
  const s = ctx.s;
  const w = s.world;
  const front = shadeFront(w.shade);
  w.shadeRevealed = true;
  w.shadeRevealPending = false;
  w.enemies[front.id] = { id: front.id, wounds: 0, progress: 0, attachments: [] };
  placeInQuest(ctx, front.id);
  ctx.revealInfo();
  ctx.log('SH-04', `${front.name} 進場 (${front.initiative} → ${front.initiative === 'Fast' ? '前端' : '後端'})，決戰開始`);
  // Shade 卡背面 When Revealed：任務區黑暗 (不含 Shade) 不足就翻敵人 (KC-30 Reveal 的牌庫規則)
  const need = shadeInfo(w.shade).revealDarkness;
  const dark = () => w.questArea.filter((x) => x !== front.id).reduce((n, x) => n + enemyDarkness(s, x), 0);
  ctx.log('SH-04', `${front.name} When Revealed：任務區黑暗 (不含 ${front.name}) = ${dark()}，需要 ${need}`);
  while (dark() < need) {
    const id = yield* revealEnemy(ctx, deckForRemaining(need - dark()), 'SH-04');
    if (!id) break;
  }
  yield* emit(ctx, { t: 'ShadeRevealed' });
}

// ---------------------------------------------------------------- P2 Action Set

export interface ActionSetChoice {
  action: string;
  attack: string;
  booster: string;
}

/** P2-03 光費總和 (DG-08 預覽也用) */
export function actionSetCost(ctx: { s: Ctx['s'] }, c: ActionSetChoice): number {
  return lightCost(ctx.s, c.action, 'action') + lightCost(ctx.s, c.attack, 'attack') + lightCost(ctx.s, c.booster, 'booster');
}

/** P2-05 付得起的光 (含免費光 EE-23) */
export function lightBudget(ctx: { s: Ctx['s'] }): number {
  return ctx.s.player.light + (freeLightAvailable(ctx) ? 1 : 0);
}

export function validateActionSet(ctx: { s: Ctx['s'] }, a: Answer): string | null {
  const c = a as ActionSetChoice;
  const hand = ctx.s.player.hand;
  if (!c || !c.action || !c.attack || !c.booster) return '需要選 3 張卡';
  const ids = [c.action, c.attack, c.booster];
  if (new Set(ids).size !== 3) return '3 張卡必須不同';
  if (!ids.every((id) => hand.includes(id))) return '卡片必須在手牌中';
  const cost = actionSetCost(ctx, c);
  if (cost > lightBudget(ctx)) return `光不足 (需要 ${cost}，有 ${lightBudget(ctx)})`; // P2-05
  return null;
}

function* actionSet(ctx: Ctx): Gen<Phase> {
  const s = ctx.s;
  const p = s.player;
  yield* boundaryWindow(ctx, 'actionSet', 'start');
  yield* generalWindow(ctx, 'actionSet', 'Action Set：打出卡片之前');

  // P2-05 失敗條件：手牌最便宜的 3 張付不起 (OPEN-02 手牌不足 3 張也視為付不起)
  const costs = p.hand.map((id) => lightCost(s, id)).sort((a, b) => a - b);
  if (costs.length < 3) lose(ctx, 'P2-05', `手牌不足 3 張 (OPEN-02)`);
  const cheapest = costs[0] + costs[1] + costs[2];
  if (cheapest > lightBudget(ctx)) lose(ctx, 'P2-05', `最便宜的 3 張光費 ${cheapest} > 光 ${lightBudget(ctx)}`);

  const ans = (yield* ctx.decide({
    type: 'actionSet',
    rule: 'P2-01',
    prompt: '選 3 張卡：行動卡、攻擊卡、加成卡',
    cards: p.hand.slice(),
    validate: (a) => validateActionSet(ctx, a),
  })) as ActionSetChoice;

  const cost = actionSetCost(ctx, ans);
  yield* spendLight(ctx, cost, 'P2-03', '打出行動組');
  p.hand = p.hand.filter((x) => x !== ans.action && x !== ans.attack && x !== ans.booster);
  p.actionSet.action = ans.action;
  p.actionSet.attack = ans.attack;
  p.actionSet.booster = ans.booster;
  const b = face(s, ans.booster);
  s.roundState.activeElement = b.element;
  s.roundState.attackType = face(s, ans.attack).attack_type;
  ctx.log(
    'P2-01',
    `行動 ${cardName(ans.action)}、攻擊 ${cardName(ans.attack)} (${s.roundState.attackType})、加成 ${cardName(ans.booster)} (${b.element})`,
  );
  for (const [slot, id] of [
    ['action', ans.action],
    ['attack', ans.attack],
    ['booster', ans.booster],
  ] as const) {
    yield* emit(ctx, { t: 'CardPlayed', card: id, slot });
  }
  yield* generalWindow(ctx, 'actionSet', 'Action Set：打出卡片之後');
  yield* boundaryWindow(ctx, 'actionSet', 'end');
  return 'engagement';
}

// ---------------------------------------------------------------- P3 Engagement

function* engagement(ctx: Ctx): Gen<Phase> {
  const s = ctx.s;
  yield* boundaryWindow(ctx, 'engagement', 'start');
  yield* generalWindow(ctx, 'engagement', 'Engagement：接戰之前');
  yield* gameAction(ctx, function* () {
    const n = engagementCount(s); // P3-01
    const seg = engagementSegment(s, s.player.light);
    ctx.log('P3-01', `光 ${s.player.light}：接戰 ${n}`);
    // P3-02 任務區最右邊的 N 個敵人，從最右邊開始逐一移到玩家區左端
    for (let i = 0; i < n && s.world.questArea.length; i++) {
      const id = s.world.questArea[s.world.questArea.length - 1];
      yield* enemyToPlayer(ctx, id, 'engage', 'P3-02');
    }
    // P3-03 區段附加圖示
    for (const d of seg.reveal) yield* revealEnemy(ctx, d as 'Dusk' | 'Doom', 'P3-03');
    if (seg.wounds) yield* woundPlayer(ctx, seg.wounds, 'direct', 'P3-03', '光軌道區段');
  });
  yield* generalWindow(ctx, 'engagement', 'Engagement：接戰之後');
  yield* boundaryWindow(ctx, 'engagement', 'end');
  return 'darkness';
}

// ---------------------------------------------------------------- P4 Darkness

function* darkness(ctx: Ctx): Gen<Phase> {
  const s = ctx.s;
  const rs = s.roundState;
  const p = s.player;
  yield* boundaryWindow(ctx, 'darkness', 'start');
  yield* generalWindow(ctx, 'darkness', 'Darkness：計算 EP 之前');

  // P4-01 第 1 步：棄信標，每個 +2 探索加成並放 1 個 Obstacle (KC-29)
  if (p.beacons.length) {
    const picked = (yield* ctx.decide({
      type: 'cards',
      rule: 'P4-01',
      prompt: '棄掉信標以獲得探索加成 (每個 +2，地點 +1 Obstacle)',
      cards: p.beacons.slice(),
      min: 0,
      max: p.beacons.length,
      validate: (a) =>
        Array.isArray(a) && a.every((x) => p.beacons.includes(x)) && new Set(a).size === a.length ? null : '請選擇信標',
    })) as string[];
    for (const b of picked) {
      p.beacons = p.beacons.filter((x) => x !== b);
      s.world.locationDiscard.push(b);
      rs.beaconsDiscardedForExplore++;
      ctx.log('P4-01', `棄掉信標 ${cardName(b)}：探索加成 +2`);
      yield* addObstacle(ctx, 1, 'KC-29', '棄信標');
      yield* emit(ctx, { t: 'BeaconDiscarded', location: b, purpose: 'explore' });
    }
  }
  const ep0 = epBreakdown(s);
  ctx.log('P4-01', `EP ${ep0.total} (探索 ${ep0.main} + 加成 ${ep0.booster}${ep0.perm ? ` + 永久加成 ${ep0.perm}` : ''})`);
  yield* generalWindow(ctx, 'darkness', 'Darkness：分配 EP 之前');

  // P4-02
  const ep = epBreakdown(s).total;
  rs.ep = ep;
  const dark = questDarkness(s);
  const maxCover = Math.min(ep, dark.effective);
  const cover = yield* ctx.chooseNumber('P4-02', `用多少 EP 抵消黑暗？(EP ${ep}，黑暗 ${dark.effective})`, 0, maxCover);
  rs.cover = cover;
  rs.exploreEP = ep - cover;
  ctx.log('P4-02', `黑暗 ${dark.effective}${dark.ignored ? ` (忽略 ${dark.ignored})` : ''}：抵消 ${cover}，Treachery +${dark.effective - cover}；探索 EP ${rs.exploreEP}`);
  yield* placeTreacheryProgress(ctx, dark.effective - cover, 'P4-02', '未抵消的黑暗');
  yield* generalWindow(ctx, 'darkness', 'Darkness：分配之後');
  yield* boundaryWindow(ctx, 'darkness', 'end');
  // P4-04
  if (rs.exploreEP > 0) return 'explore';
  ctx.log('P4-04', '沒有探索 EP，跳過 Explore Phase');
  return 'attack';
}

// ---------------------------------------------------------------- P5 Explore

function* explore(ctx: Ctx): Gen<Phase> {
  const s = ctx.s;
  yield* boundaryWindow(ctx, 'explore', 'start');
  yield* generalWindow(ctx, 'explore', 'Explore：放進度之前');
  // P5-01 ~ P5-04 (探索完成到移動結束之間沒有一般窗口)
  ctx.log('P5-02', `EV ${locationEV(s)}`);
  yield* placeLocationProgress(ctx, s.roundState.exploreEP, 'P5-01', '探索 EP');
  yield* boundaryWindow(ctx, 'explore', 'end');
  return 'attack';
}

// ---------------------------------------------------------------- P6 Attack

/** P6-02 一次 AP 分配的結果 (DG-11 預覽也用) */
export function attackPreview(s: Ctx['s'], enemy: string, amount: number): { blocked: number; wounds: number } {
  const type = s.roundState.attackType ?? apBreakdown(s).type;
  const blocked = type ? Math.min(amount, enemyDefenseVs(s, enemy, type)) : 0;
  return { blocked, wounds: amount - blocked };
}

function attackTargets(s: Ctx['s']): Option[] {
  const avail = apAvailable(s);
  return s.world.playerArea.map((id) => {
    const why = s.roundState.attackedThisPhase.includes(id) ? '本階段已攻擊過 (P6-02)' : avail <= 0 ? '沒有 AP' : null;
    return { id: `assign:${id}`, label: `攻擊 ${cardName(id)}`, rule: 'P6-02', legal: !why, reason: why ?? undefined, data: { enemy: id, max: avail } };
  });
}

function* attack(ctx: Ctx): Gen<Phase> {
  const s = ctx.s;
  const rs = s.roundState;
  rs.apSpent = 0;
  rs.attackedThisPhase = [];
  yield* boundaryWindow(ctx, 'attack', 'start');
  for (;;) {
    const ch = yield* generalWindow(ctx, 'attack', `Attack：分配 AP (剩 ${apAvailable(s)})`, attackTargets);
    if (!ch) break;
    yield* assignAP(ctx, ch);
  }
  yield* boundaryWindow(ctx, 'attack', 'end');
  return 'defend';
}

function* assignAP(ctx: Ctx, ch: WindowChoice): Gen {
  const s = ctx.s;
  const rs = s.roundState;
  const enemy = ch.option.slice('assign:'.length);
  const amount = ch.amount as number;
  const avail = apAvailable(s);
  assert(Number.isInteger(amount) && amount >= 1 && amount <= avail, `AP 要在 1–${avail} 之間`);
  assert(s.world.playerArea.includes(enemy) && !rs.attackedThisPhase.includes(enemy), '不能攻擊這個敵人');
  const ap = apBreakdown(s);
  rs.apSpent += amount;
  rs.attackedThisPhase.push(enemy);
  const { blocked, wounds } = attackPreview(s, enemy, amount);
  ctx.log('P6-02', `${amount} AP → ${cardName(enemy)} (${ap.type})：擋下 ${blocked}，傷害 ${wounds}`);
  yield* emit(ctx, { t: 'EnemyAttackedByYou', enemy, ap: amount, type: ap.type });
  yield* woundEnemy(ctx, enemy, wounds, 'attack', 'P6-02');
  yield* flushAfter(ctx);
}

// ---------------------------------------------------------------- P7 Defend

function attackers(s: Ctx['s']): Option[] {
  return s.world.playerArea
    .filter((id) => !s.roundState.disarmed.includes(id) && !s.roundState.attackedPlayer.includes(id))
    .map((id) => ({ id: `attacker:${id}`, label: `${cardName(id)} 攻擊 (${enemyAttack(s, id)} ${enemyTypes(s, id).join('/')})`, rule: 'P7-01' }));
}

function* defend(ctx: Ctx): Gen<Phase> {
  const s = ctx.s;
  yield* boundaryWindow(ctx, 'defend', 'start');
  for (;;) {
    const ch = yield* generalWindow(ctx, 'defend', 'Defend：選擇下一個攻擊的敵人', attackers, (st) =>
      attackers(st).length ? '還有敵人要攻擊 (P7-01)' : null,
    );
    if (!ch) break;
    const id = ch.option.slice('attacker:'.length);
    s.roundState.attackedPlayer.push(id);
    yield* enemyAttacks(ctx, id, 'P7-01');
  }
  yield* boundaryWindow(ctx, 'defend', 'end');
  return 'refresh';
}

/** P7-01 ~ P7-04 一次敵人攻擊 (KC-23 立即攻擊也用這個) */
export function* enemyAttacks(ctx: Ctx, id: string, rule: string): Gen {
  const s = ctx.s;
  const p = s.player;
  const types = enemyTypes(s, id);
  yield* emit(ctx, { t: 'EnemyAttacks', enemy: id });
  if (!s.world.enemies[id]) return;
  const incoming = enemyAttack(s, id);
  ctx.log(rule, `${cardName(id)} 攻擊 ${incoming} (${types.join('/')})`);
  let defense = 0;
  let used = 0;
  // P7-02 防禦：手牌及/或牌庫頂端，類型必須相符 (P7-01a 雙重類型兩種都可以)
  for (;;) {
    const matches = (cid: string) => types.includes(face(s, cid).attack_type);
    const top = p.deck[0];
    const opts: Option[] = [
      ...p.hand.map((cid) => ({
        id: `hand:${cid}`,
        label: `${cardName(cid)} (${face(s, cid).defense} ${face(s, cid).attack_type})`,
        legal: matches(cid),
        reason: matches(cid) ? undefined : '類型不符',
        rule: 'P7-02',
      })),
    ];
    if (top && !p.deckTopKnown) opts.push({ id: 'peek', label: '查看牌庫頂端', rule: 'OPEN-05' });
    if (top && p.deckTopKnown)
      opts.push({
        id: 'top',
        label: `牌庫頂端 ${cardName(top)} (${face(s, top).defense} ${face(s, top).attack_type})`,
        legal: matches(top),
        reason: matches(top) ? undefined : '類型不符，留在牌庫頂端 (OPEN-05)',
        rule: 'P7-02',
      });
    if (!top && p.discard.length) opts.push({ id: 'reshuffle', label: '重洗牌庫 (腐化 +1)', rule: 'KC-27' });
    opts.push({ id: 'done', label: `承受 ${Math.max(0, incoming - defense)} 傷害`, rule: 'P7-03' });
    const legal = opts.filter((o) => o.legal !== false);
    if (legal.length === 1) break;
    const pick = yield* ctx.choose('P7-02', `防禦 ${cardName(id)} 的攻擊 (${incoming}，已擋 ${defense})`, opts, false);
    if (pick === 'done') break;
    if (pick === 'peek') {
      p.deckTopKnown = true;
      ctx.revealInfo();
      ctx.log('OPEN-05', `查看牌庫頂端：${cardName(top!)}`);
      continue;
    }
    if (pick === 'reshuffle') {
      yield* reshuffleDeck(ctx, 'KC-27');
      continue;
    }
    const cid = pick === 'top' ? top! : pick.slice('hand:'.length);
    const def = face(s, cid).defense;
    defense += def;
    used++;
    s.roundState.defendedWithCount++;
    if (pick === 'top') p.deckTopKnown = false;
    yield* discardPlayerCard(ctx, cid, pick === 'top' ? 'deckTop' : 'hand', 'P7-02');
    ctx.log('P7-02', `以 ${cardName(cid)} 防禦 ${def}`);
    yield* emit(ctx, { t: 'CardDefended', card: cid, enemy: id });
  }
  const wounds = Math.max(0, incoming - defense);
  ctx.log('P7-03', `${cardName(id)}：攻擊 ${incoming}，防禦 ${defense}，傷害 ${wounds}`);
  yield* woundPlayer(ctx, wounds, 'enemyAttack', 'P7-03', `${cardName(id)} 的攻擊`);
  yield* emit(ctx, { t: 'EnemyAttackResolved', enemy: id, blocked: Math.min(defense, incoming), wounds, defendedWith: used });
}

// ---------------------------------------------------------------- P8 Refresh

function* refresh(ctx: Ctx): Gen<Phase> {
  const s = ctx.s;
  const p = s.player;
  const w = s.world;
  yield* boundaryWindow(ctx, 'refresh', 'start');

  // P8-01 更新地點
  if (w.newLocationTokenOnLocation) {
    w.newLocationTokenOnLocation = false;
    ctx.log('P8-01', 'New Location 指示物移到地點牌庫頂端');
  } else {
    yield* addThreatTokens(ctx, 1, 'P8-01', 'Refresh');
  }
  // P8-02 產光
  yield* gainLight(ctx, lightProduction(s), 'P8-02', `光產出 ${lightProduction(s)}`);
  yield* generalWindow(ctx, 'refresh', 'Refresh：休息之前');

  // P8-03 休息
  for (;;) {
    const r = restValue(s);
    const physUsed = s.roundState.resolvedPhaseEffects.includes('rest:physical');
    const opts: Option[] = [
      {
        id: 'physical',
        label: `物理休息：3 XP，治療 ${r}`,
        rule: 'P8-03',
        legal: !physUsed && p.xp >= 3 && p.wounds > 0,
        reason: physUsed ? '已休息' : p.xp < 3 ? 'XP 不足 3' : p.wounds === 0 ? '沒有傷害' : undefined,
      },
      ...p.beacons.map((b) => ({ id: `beacon:${b}`, label: `光子休息：棄 ${cardName(b)}，治療 2`, rule: 'P8-03', legal: p.wounds > 0 })),
      { id: 'done', label: '不休息 / 完成', rule: 'P8-03' },
    ];
    const pick = yield* ctx.choose('P8-03', '休息 (可選)', opts);
    if (pick === 'done') break;
    if (pick === 'physical') {
      s.roundState.resolvedPhaseEffects.push('rest:physical');
      yield* spendXP(ctx, 3, 'P8-03', '物理休息');
      yield* heal(ctx, r, 'P8-03', '物理休息');
    } else {
      const b = pick.slice('beacon:'.length);
      p.beacons = p.beacons.filter((x) => x !== b);
      w.locationDiscard.push(b);
      yield* heal(ctx, 2, 'P8-03', `光子休息 (${cardName(b)})`);
      yield* addObstacle(ctx, 1, 'KC-29', '光子休息');
      yield* emit(ctx, { t: 'BeaconDiscarded', location: b, purpose: 'rest' });
    }
  }

  // KC-10b 沒有條件的強制 1x 效果，在行動卡棄掉前強制結算
  for (const sd of activeEffects(s)) {
    if (sd.src.kind !== 'card' || !sd.def.active || !isMandatory(sd.def)) continue;
    if ((s.roundState.usage[usageKey(sd.src, sd.def)] ?? 0) > 0) continue;
    ctx.log('KC-10b', `${sd.src.name}：${sd.def.label} (強制效果期限)`);
    yield* runEffect(ctx, sd.src, sd.def, () => sd.def.active!.run(ctx, sd.src));
  }

  // P8-04 棄牌與移位：行動卡、加成卡、探索卡依玩家選擇的順序 (單一遊戲動作，EE-11)
  const toDiscard = (['action', 'booster', 'explore'] as const).map((k) => p.actionSet[k]).filter((x): x is string => !!x);
  let order = toDiscard;
  if (toDiscard.length > 1) {
    order = (yield* ctx.decide({
      type: 'order',
      rule: 'P8-04',
      prompt: '棄牌順序 (最後一張成為 echo)',
      cards: toDiscard,
      validate: (a) =>
        Array.isArray(a) && a.length === toDiscard.length && toDiscard.every((x) => a.includes(x)) ? null : '請排列全部要棄的卡',
    })) as string[];
  }
  yield* gameAction(ctx, function* () {
    for (const id of order) yield* discardPlayerCard(ctx, id, 'actionSet', 'P8-04');
    const atk = p.actionSet.attack;
    p.actionSet = { action: null, attack: null, booster: null, explore: atk };
    if (atk) ctx.log('P8-04', `${cardName(atk)} 移到探索卡槽`);
    // 加成卡棄掉後技能不再啟動；橫置以啟動結束 (KC-18、EE-22)
    s.roundState.activeElement = null;
    for (const sk of p.skills) sk.activatedByExhaust = false;
    s.lingering = s.lingering.filter((l) => l.until !== 'discardStep');
  });
  // 額外棄手牌 (可選，必須在棄掉行動組之後)
  for (;;) {
    if (!p.hand.length) break;
    const pick = yield* ctx.choose('P8-04', '再棄掉手牌 (可選)', [
      ...p.hand.map((id) => ({ id, label: cardName(id) })),
      { id: 'done', label: '完成' },
    ]);
    if (pick === 'done') break;
    yield* discardPlayerCard(ctx, pick, 'hand', 'P8-04');
  }
  ctx.log('KC-20', `echo：${echo(s) ? cardName(echo(s)!) : '無'}`);

  // P8-05 補牌
  const need = handSize(s) - p.hand.length;
  if (need > 0) yield* drawCards(ctx, need, 'P8-05', `補到手牌上限 ${handSize(s)}`);
  // P8-06 夥伴 Ready (選用模組 11)
  yield* generalWindow(ctx, 'refresh', 'Refresh：回合結束之前');
  yield* boundaryWindow(ctx, 'refresh', 'end');

  // P8-07 / WIN-01
  checkWin(ctx);
  return 'staging';
}

/** WIN-01 (⚠ INTERP 在 P8 結束時檢查；FL-03 恢復未探索則不算) */
export function checkWin(ctx: Ctx): void {
  const s = ctx.s;
  const w = s.world;
  const atFinal = !!w.finalLocation && isFinalLocation(s, w.location.id);
  const explored = atFinal && w.location.explored && w.location.progress >= locationEV(s);
  if (w.shadeDefeated && explored) {
    ctx.log('WIN-01', `勝利：${w.shade} 已擊敗，最終地點已探索`);
    s.outcome = { result: 'win', rule: 'WIN-01', reason: `${w.shade} 已擊敗，最終地點已探索` };
    throw new GameOver('win', 'WIN-01', s.outcome.reason);
  }
}

/** 回合結束：回合內效果到期 (EE-22)，開始新回合 */
export function startNewRound(ctx: Ctx): void {
  const s = ctx.s;
  s.lingering = s.lingering.filter((l) => l.until === 'game');
  s.roundState = emptyRoundState();
  for (const sk of s.player.skills) {
    sk.usesThisRound = 0;
    sk.activatedByExhaust = false;
  }
  s.round++;
  // SH-02 移動到最終地點之後的下一個 Staging Phase 結束時揭示
  if (s.world.shadeRevealPending && !s.world.shadeRevealed) s.roundState.revealShadeThisRound = true;
  ctx.log('P8-07', `第 ${s.round} 回合開始`);
}

// ---------------------------------------------------------------- 議程

const PHASE_FN: Record<Phase, (ctx: Ctx) => Gen<Phase>> = {
  staging,
  actionSet,
  engagement,
  darkness,
  explore,
  attack,
  defend,
  refresh,
};

/** 執行目前階段，結束後把 phase 設成下一個階段 */
export function* runPhase(ctx: Ctx): Gen {
  const s = ctx.s;
  ctx.log(s.phase === 'staging' ? 'P1' : 'EE-17', `${PHASE_NAMES[s.phase]} Phase`);
  const was = s.phase;
  const next = yield* PHASE_FN[s.phase](ctx);
  yield* flushAfter(ctx);
  s.phase = next;
  if (was === 'refresh') startNewRound(ctx);
}

