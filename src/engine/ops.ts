// 效果積木 (EE-23) 與結算堆疊 (EE-09 ~ EE-16)。
// 所有狀態改變都經過這裡：寫日誌 (DG-02)、發事件 (EE-08)、立即檢查失敗 (EE-15)。
import { GameOver, InvalidAnswer, type Ctx, type GameEvent, type Gen, type Option } from './core';
import { cardName, enemyCard, getCard, locationCard, playerCard, treacheryCard } from './data';
import {
  activeEffects,
  defsForCard,
  applyMods,
  isMandatory,
  isOncePerRound,
  usageKey,
  type EffectDef,
  type Source,
  type SourcedDef,
} from './effects';
import { shuffle } from './rng';
import { shadeInfo } from './shades';
import { corruptionMax, lightMax, trackMax } from './tracks';
import { echo, enemyHP, luminaryHP } from './calc';
import type { LingeringEffect } from './types';

// ---------------------------------------------------------------- 失敗檢查 (EE-15、LOSE-01)

export function checkLose(ctx: Ctx): void {
  const s = ctx.s;
  if (s.outcome) return;
  const hp = luminaryHP(s);
  if (s.player.wounds >= hp) lose(ctx, 'KC-22', `傷害 ${s.player.wounds} ≥ HP ${hp}`);
  const info = shadeInfo(s.world.shade);
  if (s.world.corruption >= info.corruptionLimit) lose(ctx, 'LOSE-01', `腐化 ${s.world.corruption} 達到 ${s.world.shade} 的上限 ${info.corruptionLimit}`);
  if (s.world.completedTreacheries.length >= info.treacheryLimit)
    lose(ctx, 'TR-01', `已完成 Treachery ${s.world.completedTreacheries.length} 達到上限 ${info.treacheryLimit}`);
}

export function lose(ctx: Ctx, rule: string, reason: string): never {
  ctx.log(rule, `失敗：${reason}`);
  ctx.s.outcome = { result: 'lose', rule, reason };
  throw new GameOver('lose', rule, reason);
}

export function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new InvalidAnswer(msg);
}

// ---------------------------------------------------------------- 結算堆疊

/** EE-07：效果的來源是否還有效 (結算前再確認一次) */
function stillActive(ctx: Ctx, sd: { sourceId: string; key: string }): SourcedDef | undefined {
  return activeEffects(ctx.s).find((x) => x.src.id === sd.sourceId && x.def.key === sd.key);
}

export function usedThisRound(ctx: Ctx, src: Source, def: EffectDef): number {
  return ctx.s.roundState.usage[usageKey(src, def)] ?? 0;
}

export function markUsed(ctx: Ctx, src: Source, def: EffectDef): void {
  const k = usageKey(src, def);
  ctx.s.roundState.usage[k] = (ctx.s.roundState.usage[k] ?? 0) + 1;
}

/** 每回合次數上限 (EE-20、EE-21)；undefined = 不限 */
export function roundLimit(def: EffectDef): number | undefined {
  if (def.perRound !== undefined) return def.perRound;
  if (isOncePerRound(def)) return 1;
  return undefined;
}

/**
 * 結算一個效果 (堆疊上的一層)：EE-14 拍下 echo 快照；結算完若回到最外層，
 * 依序結算 after 效果 (EE-10)。
 */
export function* runEffect(ctx: Ctx, src: Source, def: EffectDef, body: () => Gen): Gen {
  ctx.effectDepth++;
  ctx.echoStack.push(echo(ctx.s));
  markUsed(ctx, src, def);
  try {
    yield* body();
  } finally {
    ctx.echoStack.pop();
    ctx.effectDepth--;
  }
  if (ctx.effectDepth === 0) yield* flushAfter(ctx);
}

/** EE-14 目前結算中效果看到的 echo */
export function currentEcho(ctx: Ctx): string | null {
  return ctx.echoStack.length ? ctx.echoStack[ctx.echoStack.length - 1] : echo(ctx.s);
}

/** KC-21：「Then」之後 echo 先更新 */
export function refreshEcho(ctx: Ctx): void {
  if (ctx.echoStack.length) ctx.echoStack[ctx.echoStack.length - 1] = echo(ctx.s);
}

/** EE-10 結算 after 效果待辦 */
export function* flushAfter(ctx: Ctx): Gen {
  while (ctx.afterQueue.length && ctx.effectDepth === 0) {
    const batch = ctx.afterQueue.splice(0);
    yield* resolveTriggers(ctx, batch);
  }
}

/** EE-11 遊戲動作：過程中發生的事件先記下，完成後再當作剛剛發生處理 */
export function* gameAction(ctx: Ctx, body: () => Gen): Gen {
  ctx.gameActionDepth++;
  try {
    yield* body();
  } finally {
    ctx.gameActionDepth--;
  }
  if (ctx.gameActionDepth === 0 && ctx.deferredEvents.length) {
    const evs = ctx.deferredEvents.splice(0);
    for (const ev of evs) yield* emit(ctx, ev);
  }
}

/** 發出事件 (EE-08)：when 效果立即插入 (EE-09)，after 效果排入待辦 (EE-10) */
export function* emit(ctx: Ctx, ev: GameEvent): Gen {
  if (ctx.gameActionDepth > 0) {
    ctx.deferredEvents.push(ev);
    return;
  }
  const now: { sourceId: string; key: string; ev: GameEvent }[] = [];
  for (const { src, def } of activeEffects(ctx.s)) {
    const tr = def.trigger;
    if (!tr || tr.event !== ev.t) continue;
    if (tr.filter && !tr.filter(ctx.s, src, ev)) continue;
    const lim = roundLimit(def);
    if (lim !== undefined && usedThisRound(ctx, src, def) >= lim) continue;
    const item = { sourceId: src.id, key: def.key, ev };
    if (tr.timing === 'after') ctx.afterQueue.push(item);
    else now.push(item);
  }
  if (now.length) yield* resolveTriggers(ctx, now);
  if (ctx.effectDepth === 0) yield* flushAfter(ctx);
}

/**
 * EE-12 同一事件觸發多個效果：強制的全部結算，選擇性的由玩家決定要不要用；
 * 先後順序由玩家決定。放棄的選擇性效果對這個事件就不能再用 (KC-12)。
 */
export function* resolveTriggers(ctx: Ctx, items: { sourceId: string; key: string; ev: GameEvent }[]): Gen {
  let pending = items.slice();
  while (pending.length) {
    const live = pending.map((it) => ({ it, sd: stillActive(ctx, it) })).filter((x) => x.sd);
    if (!live.length) return;
    const mandatory = live.filter((x) => isMandatory(x.sd!.def) || x.sd!.def.trigger!.mandatory);
    const options: Option[] = live.map((x, i) => ({
      id: String(i),
      label: `${x.sd!.src.name}：${x.sd!.def.label}`,
      rule: x.sd!.def.rule ?? 'EE-12',
    }));
    if (!mandatory.length) options.push({ id: 'skip', label: '不使用', rule: 'EE-12' });
    let pick: string;
    if (live.length === 1 && mandatory.length === 1) pick = '0';
    else pick = yield* ctx.choose('EE-12', '選擇要結算的效果', options, false);
    if (pick === 'skip') return;
    const chosen = live[Number(pick)];
    pending = pending.filter((p) => p !== chosen.it);
    const { src, def } = chosen.sd!;
    ctx.log(def.rule ?? 'EE-09', `${src.name}：${def.label}`);
    yield* runEffect(ctx, src, def, () => def.trigger!.run(ctx, src, chosen.it.ev));
  }
}

/** EE-06 登記回合內持續效果 */
export function addLingering(ctx: Ctx, key: string, src: Source, params: Record<string, unknown> = {}, until: LingeringEffect['until'] = 'round'): void {
  ctx.s.lingering.push({ uid: ctx.s.nextUid++, key, sourceId: src.id, sourceName: src.name, params, until });
}

// ---------------------------------------------------------------- 資源

export function* gainXP(ctx: Ctx, n: number, rule: string, why: string): Gen {
  if (n <= 0) return;
  ctx.s.player.xp += n;
  ctx.log(rule, `XP +${n} (${why})，共 ${ctx.s.player.xp}`);
  yield* emit(ctx, { t: 'XPGained', n });
}

export function* spendXP(ctx: Ctx, n: number, rule: string, why: string): Gen {
  if (ctx.s.player.xp < n) throw new InvalidAnswer(`XP 不足 (${ctx.s.player.xp} < ${n})`);
  ctx.s.player.xp -= n;
  ctx.log(rule, `XP −${n} (${why})，剩 ${ctx.s.player.xp}`);
  yield* emit(ctx, { t: 'XPSpent', n });
}

/** 效果造成的失去 XP：不足時失去全部 */
export function* loseXP(ctx: Ctx, n: number, rule: string, why: string): Gen {
  const k = Math.min(n, ctx.s.player.xp);
  ctx.s.player.xp -= k;
  ctx.log(rule, `XP −${k} (${why})，剩 ${ctx.s.player.xp}`);
}

/** OPEN-08 光夾在 0 與上限之間 */
export function* gainLight(ctx: Ctx, n: number, rule: string, why: string): Gen {
  const before = ctx.s.player.light;
  ctx.s.player.light = Math.min(lightMax(ctx.s), before + n);
  ctx.log(rule, `光 ${before} → ${ctx.s.player.light} (${why})`);
  yield* emit(ctx, { t: 'LightGained', n: ctx.s.player.light - before });
}

export function* loseLight(ctx: Ctx, n: number, rule: string, why: string): Gen {
  const before = ctx.s.player.light;
  ctx.s.player.light = Math.max(0, before - n);
  ctx.log(rule, `光 ${before} → ${ctx.s.player.light} (${why})`);
}

/** EE-23 免費光：本回合任一次花光時可以少付 1 (Farhome) */
export function freeLightAvailable(ctx: Ctx | { s: Ctx['s'] }): boolean {
  const s = ctx.s;
  return !s.roundState.freeLightUsed && applyMods(s, { stat: 'freeLight' }, 0) > 0;
}

/** 花光 (P2-03 或效果)。付不起時拋出；必要時自動使用免費光 (EE-23)。 */
export function* spendLight(ctx: Ctx, n: number, rule: string, why: string): Gen {
  const p = ctx.s.player;
  let pay = n;
  if (pay > p.light && freeLightAvailable(ctx)) {
    pay -= 1;
    ctx.s.roundState.freeLightUsed = true;
    ctx.log('EE-23', '使用免費光：少付 1');
  }
  if (pay > p.light) throw new InvalidAnswer(`光不足 (${p.light} < ${pay})`);
  const before = p.light;
  p.light -= pay;
  ctx.s.roundState.lightSpent += pay;
  ctx.log(rule, `光 ${before} → ${p.light} (${why}，花 ${pay})`);
  yield* emit(ctx, { t: 'LightSpent', n: pay });
}

// ---------------------------------------------------------------- 傷害與治療

/** P7-03 / KC-24：傷害放到角色身上；達到 HP 立即失敗 (KC-22) */
export function* woundPlayer(ctx: Ctx, n: number, source: 'enemyAttack' | 'direct' | 'self', rule: string, why: string): Gen {
  if (n <= 0) return;
  ctx.s.player.wounds += n;
  ctx.log(rule, `受到 ${n} 傷害 (${why})，共 ${ctx.s.player.wounds}`);
  checkLose(ctx);
  if (source === 'self') yield* emit(ctx, { t: 'SelfDamage', n });
  yield* emit(ctx, { t: 'PlayerWounded', n, source });
}

/** KC-24 deal yourself / take {Wound} */
export function* dealSelfWound(ctx: Ctx, n: number, rule: string, why: string): Gen {
  yield* woundPlayer(ctx, n, 'self', rule, why);
}

/** KC-26 */
export function* heal(ctx: Ctx, n: number, rule: string, why: string): Gen {
  const k = Math.min(n, ctx.s.player.wounds);
  if (k <= 0) return;
  ctx.s.player.wounds -= k;
  ctx.log(rule, `治療 ${k} (${why})，剩 ${ctx.s.player.wounds} 傷害`);
  yield* emit(ctx, { t: 'PlayerHealed', n: k });
}

// ---------------------------------------------------------------- 軌道

export function* advanceCorruption(ctx: Ctx, n: number, rule: string, why: string): Gen {
  const w = ctx.s.world;
  const before = w.corruption;
  w.corruption = Math.min(corruptionMax(ctx.s), before + n);
  ctx.log(rule, `腐化 ${before} → ${w.corruption} (${why})`);
  checkLose(ctx);
  yield* emit(ctx, { t: 'CorruptionAdvanced', value: w.corruption });
}

/** OPEN-09 超過第 27 格停在最後一格 */
export function* advanceThreat(ctx: Ctx, n: number, rule: string, why: string): Gen {
  if (n <= 0) return;
  const w = ctx.s.world;
  const before = w.threat;
  w.threat = Math.min(trackMax(ctx.s), before + n);
  ctx.log(rule, `威脅軌道 ${before} → ${w.threat} (${why})`);
  yield* emit(ctx, { t: 'ThreatTrackAdvanced', n });
}

export function* advanceResistance(ctx: Ctx, n: number, rule: string, why: string): Gen {
  if (n <= 0) return;
  const w = ctx.s.world;
  const before = w.resistance;
  w.resistance = Math.min(trackMax(ctx.s), before + n);
  ctx.log(rule, `抗性軌道 ${before} → ${w.resistance} (${why})`);
  yield* emit(ctx, { t: 'ResistanceTrackAdvanced', n });
}

// ---------------------------------------------------------------- 地點指示物

export function* addPath(ctx: Ctx, n: number, rule: string, why: string): Gen {
  if (n <= 0) return;
  ctx.s.world.location.paths += n;
  ctx.log(rule, `地點 Path +${n} (${why})，共 ${ctx.s.world.location.paths}`);
  yield* emit(ctx, { t: 'PathAdded', n });
}

export function* addObstacle(ctx: Ctx, n: number, rule: string, why: string): Gen {
  if (n <= 0) return;
  ctx.s.world.location.obstacles += n;
  ctx.log(rule, `地點 Obstacle +${n} (${why})，共 ${ctx.s.world.location.obstacles}`);
  yield* emit(ctx, { t: 'ObstacleAdded', n });
}

export function* addThreatTokens(ctx: Ctx, n: number, rule: string, why: string): Gen {
  if (n <= 0) return;
  ctx.s.world.location.threatTokens += n;
  ctx.log(rule, `地點 Threat token +${n} (${why})，共 ${ctx.s.world.location.threatTokens}`);
  yield* emit(ctx, { t: 'ThreatTokenAdded', n });
}

/** 移除地點 Progress，回傳實際移除數 */
export function* removeLocationProgress(ctx: Ctx, n: number, rule: string, why: string): Gen<number> {
  const loc = ctx.s.world.location;
  const k = Math.min(n, loc.progress);
  if (k <= 0) return 0;
  loc.progress -= k;
  ctx.log(rule, `地點 Progress −${k} (${why})，剩 ${loc.progress}`);
  yield* emit(ctx, { t: 'ProgressRemoved', target: 'location', n: k });
  return k;
}

// ---------------------------------------------------------------- Treachery (TR)

export function* placeTreacheryProgress(ctx: Ctx, n: number, rule: string, why: string): Gen {
  const w = ctx.s.world;
  if (n <= 0 || !w.activeTreachery) return; // OPEN-03：沒有進行中 Treachery 時不累積
  w.treacheryProgress += n;
  ctx.log(rule, `Treachery Progress +${n} (${why})，共 ${w.treacheryProgress}/${treacheryCard(w.activeTreachery).progress_value}`);
  yield* emit(ctx, { t: 'ProgressPlaced', target: 'treachery', n });
  yield* checkTreachery(ctx); // TR-03 任何時候達到 PV 都立即完成
}

export function* removeTreacheryProgress(ctx: Ctx, n: number, rule: string, why: string): Gen<number> {
  const w = ctx.s.world;
  const k = Math.min(n, w.treacheryProgress);
  if (k <= 0) return 0;
  w.treacheryProgress -= k;
  ctx.log(rule, `Treachery Progress −${k} (${why})，剩 ${w.treacheryProgress}`);
  yield* emit(ctx, { t: 'ProgressRemoved', target: 'treachery', n: k });
  return k;
}

/** TR-01 / TR-02 完成 Treachery (可連鎖) */
export function* checkTreachery(ctx: Ctx): Gen {
  const w = ctx.s.world;
  while (w.activeTreachery && w.treacheryProgress >= treacheryCard(w.activeTreachery).progress_value) {
    const tid = w.activeTreachery;
    const t = treacheryCard(tid);
    const limit = shadeInfo(w.shade).treacheryLimit;
    ctx.log('TR-01', `完成 Treachery ${t.name} (${w.treacheryProgress}/${t.progress_value})`);
    // TR-01 第 1 步：已完成數 + 1 達到上限 → 立即失敗
    if (w.completedTreacheries.length + 1 >= limit) {
      w.completedTreacheries.push(tid);
      lose(ctx, 'TR-01', `已完成 Treachery 達到上限 ${limit}`);
    }
    // 第 2 步：When Completed
    const src: Source = { id: `treachery:${tid}`, kind: 'legacy', name: t.name, cardId: tid };
    const def = defsForCard(ctx.s, tid).find((d) => d.whenCompleted);
    if (def?.whenCompleted) {
      ctx.log('TR-01', `${t.name} When Completed：${t.when_completed}`);
      yield* runEffect(ctx, src, def, () => def.whenCompleted!(ctx, src));
    }
    // 第 3 步：移除 PV 個進度
    w.treacheryProgress -= t.progress_value;
    // 第 4 步：翻新的 Treachery；完成的移入 completed，legacy 生效
    w.completedTreacheries.push(tid);
    w.activeTreachery = null;
    ctx.log('KC-12e', `${t.name} legacy 生效：${t.legacy}`);
    yield* revealTreachery(ctx);
    // 第 5 步：剩餘進度轉移 (留在 treacheryProgress)
    if (!w.activeTreachery) w.treacheryProgress = 0;
    else if (w.treacheryProgress > 0) ctx.log('TR-01', `剩餘 ${w.treacheryProgress} Progress 轉移到新的 Treachery`);
    yield* emit(ctx, { t: 'TreacheryCompleted', card: tid });
  }
}

export function* revealTreachery(ctx: Ctx): Gen {
  const w = ctx.s.world;
  const next = w.treacheryDeck.shift();
  if (!next) {
    ctx.log('OPEN-03', 'Treachery 牌庫已空，不再翻新的 Treachery');
    return;
  }
  ctx.revealInfo();
  w.activeTreachery = next;
  ctx.log('KC-30', `翻開 Treachery：${cardName(next)} (PV ${treacheryCard(next).progress_value})`);
  yield* emit(ctx, { t: 'TreacheryRevealed', card: next });
}

// ---------------------------------------------------------------- 玩家牌組 (KC-27)

/** KC-27 牌庫為空需要重洗：先腐化 +1，再把棄牌堆洗成新牌庫。KC-27a 兩者皆空則略過。 */
export function* reshuffleDeck(ctx: Ctx, rule = 'KC-27'): Gen<boolean> {
  const p = ctx.s.player;
  if (p.discard.length === 0) {
    ctx.log('KC-27a', '牌庫與棄牌堆都是空的，無法重洗');
    return false;
  }
  yield* advanceCorruption(ctx, 1, rule, '牌庫重洗');
  const [deck, rng] = shuffle(p.discard, ctx.s.rng);
  ctx.s.rng = rng;
  p.deck = deck;
  p.discard = [];
  p.deckTopKnown = false;
  ctx.revealInfo();
  ctx.log(rule, `棄牌堆洗成新牌庫 (${deck.length} 張)`);
  yield* emit(ctx, { t: 'DeckReshuffled' });
  return true;
}

export function* drawCards(ctx: Ctx, n: number, rule: string, why: string): Gen<string[]> {
  const p = ctx.s.player;
  const drawn: string[] = [];
  for (let i = 0; i < n; i++) {
    if (!p.deck.length && !(yield* reshuffleDeck(ctx))) break;
    const c = p.deck.shift()!;
    p.deckTopKnown = false;
    p.hand.push(c);
    drawn.push(c);
  }
  if (drawn.length) {
    ctx.revealInfo();
    ctx.log(rule, `抽 ${drawn.length} 張 (${why})`);
    for (const c of drawn) yield* emit(ctx, { t: 'CardDrawn', card: c });
  }
  return drawn;
}

/** KC-30 Discard：玩家卡 → 棄牌堆頂端 */
export function* discardPlayerCard(ctx: Ctx, id: string, from: string, rule: string): Gen {
  const p = ctx.s.player;
  removeFromPlayerZones(ctx, id);
  p.discard.push(id);
  ctx.log(rule, `棄掉 ${playerCard(id).name}`);
  yield* emit(ctx, { t: 'CardDiscarded', card: id, from });
}

export function removeFromPlayerZones(ctx: Ctx, id: string): void {
  const p = ctx.s.player;
  p.hand = p.hand.filter((x) => x !== id);
  p.deck = p.deck.filter((x) => x !== id);
  p.discard = p.discard.filter((x) => x !== id);
  for (const k of ['action', 'attack', 'booster', 'explore'] as const) if (p.actionSet[k] === id) p.actionSet[k] = null;
  for (const e of Object.values(ctx.s.world.enemies)) e.attachments = e.attachments.filter((x) => x !== id);
  ctx.s.world.location.attachments = ctx.s.world.location.attachments.filter((x) => x !== id);
}

// ---------------------------------------------------------------- 敵人 (KC-01 ~ KC-04)

/** KC-30 Reveal：Fast 放任務區前端 (右)，Slow 放後端 (左) */
export function placeInQuest(ctx: Ctx, id: string): void {
  const q = ctx.s.world.questArea;
  if (enemyCard(id).initiative === 'Fast') q.push(id);
  else q.unshift(id);
}

function enemyDeckOf(ctx: Ctx, deck: 'Dusk' | 'Doom'): { deck: string[]; discard: string[]; set: (d: string[], x: string[]) => void } {
  const w = ctx.s.world;
  return deck === 'Dusk'
    ? { deck: w.duskDeck, discard: w.duskDiscard, set: (d, x) => ((w.duskDeck = d), (w.duskDiscard = x)) }
    : { deck: w.doomDeck, discard: w.doomDiscard, set: (d, x) => ((w.doomDeck = d), (w.doomDiscard = x)) };
}

/** KC-30 Reveal：翻開敵人放到任務區，立即結算 When Revealed */
export function* revealEnemy(ctx: Ctx, deck: 'Dusk' | 'Doom', rule: string): Gen<string | null> {
  const w = ctx.s.world;
  let d = enemyDeckOf(ctx, deck);
  if (!d.deck.length) {
    // OPEN-03：該棄牌堆洗成新牌庫
    if (!ctx.s.config.open.reshuffleEnemyDiscard || !d.discard.length) {
      ctx.log('OPEN-03', `${deck} 牌庫與棄牌堆皆空，無法翻開`);
      return null;
    }
    const [nd, rng] = shuffle(d.discard, ctx.s.rng);
    ctx.s.rng = rng;
    d.set(nd, []);
    d = enemyDeckOf(ctx, deck);
    ctx.revealInfo();
    ctx.log('OPEN-03', `${deck} 棄牌堆洗成新牌庫`);
  }
  const id = d.deck.shift()!;
  ctx.revealInfo();
  w.enemies[id] = { id, wounds: 0, progress: 0, attachments: [] };
  placeInQuest(ctx, id);
  const e = enemyCard(id);
  ctx.log(rule, `翻開 ${e.name} (${deck}，${e.initiative}，Darkness ${e.darkness})`);
  yield* resolveWhenRevealed(ctx, id);
  yield* emit(ctx, { t: 'EnemyRevealed', enemy: id, deck });
  return id;
}

export function* resolveWhenRevealed(ctx: Ctx, id: string): Gen {
  const found = activeEffects(ctx.s).find((x) => x.src.cardId === id && x.def.whenRevealed);
  if (found) {
    ctx.log('KC-30', `${found.src.name} When Revealed`);
    yield* runEffect(ctx, found.src, found.def, () => found.def.whenRevealed!(ctx, found.src));
  }
}

/** KC-03 進入玩家區：放左端 (後端) */
export function* enemyToPlayer(ctx: Ctx, id: string, cause: 'engage' | 'pull' | 'effect', rule: string): Gen {
  const w = ctx.s.world;
  if (!w.questArea.includes(id)) return;
  w.questArea = w.questArea.filter((x) => x !== id);
  w.playerArea.unshift(id);
  ctx.log(rule, `${cardName(id)} 進入 Player Area (${cause === 'engage' ? '接戰' : cause === 'pull' ? 'Pull' : '效果'})`);
  yield* emit(ctx, { t: 'EnemyEnteredPlayer', enemy: id, cause });
}

/** KC-04 Push：Fast 放任務區前端，Slow 放後端 */
export function* enemyToQuest(ctx: Ctx, id: string, cause: 'push' | 'effect', rule: string): Gen {
  const w = ctx.s.world;
  if (!w.playerArea.includes(id)) return;
  w.playerArea = w.playerArea.filter((x) => x !== id);
  placeInQuest(ctx, id);
  ctx.log(rule, `${cardName(id)} 回到 Quest Area (${cause === 'push' ? 'Push' : '效果'})`);
  yield* emit(ctx, { t: 'EnemyMovedToQuest', enemy: id, cause });
}

export function* pull(ctx: Ctx, id: string, rule: string): Gen {
  yield* enemyToPlayer(ctx, id, 'pull', rule);
}
export function* push(ctx: Ctx, id: string, rule: string): Gen {
  yield* enemyToQuest(ctx, id, 'push', rule);
}

/** 敵人受傷 (攻擊或直接傷害)；EE-16 傷害 ≥ HP 立即擊敗 */
export function* woundEnemy(ctx: Ctx, id: string, n: number, source: 'attack' | 'direct' | 'companion', rule: string): Gen {
  const e = ctx.s.world.enemies[id];
  if (!e || n <= 0) return;
  e.wounds += n;
  ctx.log(rule, `${cardName(id)} 受到 ${n} 傷害 (${e.wounds}/${enemyHP(ctx.s, id)})`);
  yield* emit(ctx, { t: 'EnemyWounded', enemy: id, n, source });
  yield* checkEnemyDefeated(ctx, id);
}

export function* checkEnemyDefeated(ctx: Ctx, id: string): Gen {
  const e = ctx.s.world.enemies[id];
  if (e && e.wounds >= enemyHP(ctx.s, id)) yield* defeatEnemy(ctx, id);
}

/** P6-03 / EE-16 擊敗：棄掉 (Shade/Shadow 移出遊戲)、附著卡進玩家棄牌堆、獲得 XP、When Defeated */
export function* defeatEnemy(ctx: Ctx, id: string): Gen {
  const w = ctx.s.world;
  const e = enemyCard(id);
  const inst = w.enemies[id];
  // When Defeated 在離場前取得 (來源需要仍在場上才能找到定義)
  const wd = activeEffects(ctx.s).find((x) => x.src.cardId === id && x.def.whenDefeated);
  w.questArea = w.questArea.filter((x) => x !== id);
  w.playerArea = w.playerArea.filter((x) => x !== id);
  for (const a of inst?.attachments ?? []) {
    ctx.s.player.discard.push(a); // KC-17
    ctx.log('KC-17', `附著卡 ${playerCard(a).name} 進入棄牌堆`);
  }
  delete w.enemies[id];
  ctx.s.roundState.disarmed = ctx.s.roundState.disarmed.filter((x) => x !== id);
  if (e.class === 'Shade') {
    w.shadeDefeated = true;
    ctx.log('SH-05', `擊敗 Shade ${e.name}，移出遊戲`);
  } else if (e.class === 'Shadow') {
    ctx.log('EE-16', `擊敗 Shadow ${e.name}，移出遊戲`);
  } else {
    (e.class === 'Dusk' ? w.duskDiscard : w.doomDiscard).push(id);
    ctx.log('P6-03', `擊敗 ${e.name}`);
  }
  yield* gainXP(ctx, e.xp_reward, 'P6-03', `擊敗 ${e.name}`);
  if (wd) {
    ctx.log('P6-03', `${e.name} When Defeated`);
    yield* runEffect(ctx, wd.src, wd.def, () => wd.def.whenDefeated!(ctx, wd.src));
  }
  yield* emit(ctx, { t: 'EnemyDefeated', enemy: id, initiative: e.initiative, cls: e.class });
}

// ---------------------------------------------------------------- 選擇的輔助

/** KC-12f 有選項的負面效果：必須選至少能部分結算的；有能完全結算的，就只能選完全結算的 */
export interface NegativeOption {
  id: string;
  label: string;
  /** 'full' 能完全結算、'partial' 部分、'none' 完全不能 */
  resolvable: 'full' | 'partial' | 'none';
  run: () => Gen;
}

export function* chooseNegative(ctx: Ctx, rule: string, prompt: string, opts: NegativeOption[]): Gen {
  const anyFull = opts.some((o) => o.resolvable === 'full');
  const anyPartial = opts.some((o) => o.resolvable === 'partial');
  const legal = (o: NegativeOption) => (anyFull ? o.resolvable === 'full' : anyPartial ? o.resolvable === 'partial' : false);
  if (!anyFull && !anyPartial) {
    ctx.log('KC-12f', `${prompt}：沒有能結算的選項`);
    return;
  }
  const pick = yield* ctx.choose(
    'KC-12f',
    prompt,
    opts.map((o) => ({ id: o.id, label: o.label, legal: legal(o), reason: legal(o) ? undefined : '必須選擇能完全結算的選項 (KC-12f)' })),
  );
  const o = opts.find((x) => x.id === pick)!;
  const forced = opts.filter(legal).length === 1;
  ctx.log(rule, `${prompt}：${o.label}${forced ? ' (唯一能結算的選項，KC-12f)' : ''}`);
  yield* o.run();
}

/** 從一組敵人中選一個 (EE-24 只有一個時自動) */
export function* chooseEnemy(ctx: Ctx, rule: string, prompt: string, ids: string[]): Gen<string | null> {
  if (!ids.length) return null;
  const pick = yield* ctx.choose(
    rule,
    prompt,
    ids.map((id) => ({ id, label: cardName(id) })),
  );
  return pick;
}

export function locName(id: string): string {
  return locationCard(id).name;
}
export function anyName(id: string): string {
  return getCard(id).name ?? id;
}
