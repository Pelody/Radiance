// 卡片效果共用的小工具 (EE-23 效果積木的組合輔助)。
import { beaconLimit, cardTraits, enemiesInPlay, enemyAttack, enemyDefenseVs, enemyTypes, printedMain } from '../calc';
import { InvalidAnswer, type Ctx, type Gen } from '../core';
import { cardName, enemyCard, playerCard } from '../data';
import type { EffectDef, Source } from '../effects';
import { applyMods, flag } from '../effects';
import { attachCard, chooseCards, emit as emitEvent, grantTrait, placeTreacheryProgress, woundEnemy } from '../ops';
import type { GameState } from '../types';

export { enemiesInPlay };

/** 這個效果的來源卡就是 id */
export const self = (src: Source, id?: unknown) => typeof id === 'string' && id === src.cardId;

export const questEnemies = (s: GameState) => s.world.questArea.slice();
export const playerEnemies = (s: GameState) => s.world.playerArea.slice();

export function withTrait(s: GameState, ids: string[], trait: string): string[] {
  return ids.filter((id) => cardTraits(s, id).includes(trait));
}
export function withFaction(ids: string[], faction: string): string[] {
  return ids.filter((id) => enemyCard(id).faction === faction);
}

/** 任務區前端 (右端) 的 n 個敵人，從最前面開始 */
export function frontQuest(s: GameState, n: number): string[] {
  return s.world.questArea.slice(-n).reverse();
}
/** 任務區後端 (左端) 的 n 個敵人，從最後面開始 */
export function backQuest(s: GameState, n: number): string[] {
  return s.world.questArea.slice(0, n);
}

/** 「Ignore … this phase / round」等以旗標記錄 */
export function setFlag(s: GameState, name: string, v = 1): void {
  s.roundState.flags[name] = v;
}
export function addFlag(s: GameState, name: string, v = 1): void {
  s.roundState.flags[name] = (s.roundState.flags[name] ?? 0) + v;
}
export const hasFlag = flag;

/** 本回合數值修正 (EE-06) */
export function roundMod(ctx: Ctx, src: Source, stat: string, value: number, target: { enemy?: string; card?: string } = {}): void {
  if (!value) return;
  ctx.s.roundState.mods.push({ stat, value, sourceId: src.id, ...target });
  ctx.log('EE-06', `${src.name}：本回合 ${stat}${target.enemy ? ` (${target.enemy})` : ''} ${value > 0 ? '+' : ''}${value}`);
}

export function* treachery(ctx: Ctx, n: number, why: string, rule = 'EE-09'): Gen {
  yield* placeTreacheryProgress(ctx, n, rule, why);
}

/** 敵人 {Quest}/{Player} 部分的定義簡寫 */
export function zoned(zone: 'quest' | 'player', d: EffectDef): EffectDef {
  return { ...d, zone };
}

export function cardsWithTrait(s: GameState, ids: string[], trait: string): string[] {
  return ids.filter((id) => cardTraits(s, id).includes(trait));
}

export function inArea(s: GameState, id: string): 'quest' | 'player' | null {
  return s.world.questArea.includes(id) ? 'quest' : s.world.playerArea.includes(id) ? 'player' : null;
}

export function anyEnemies(s: GameState): boolean {
  return enemiesInPlay(s).length > 0;
}

// ---------------------------------------------------------------- 玩家卡用


/** 行動卡 / 攻擊卡 / 探索卡 */
export const actionCard = (s: GameState) => s.player.actionSet.action;
export const attackCard = (s: GameState) => s.player.actionSet.attack;
export const exploreCard = (s: GameState) => s.player.actionSet.explore;

/** 「If your attack or explore card is X」 */
export function attackOrExploreHas(s: GameState, trait: string): boolean {
  return [attackCard(s), exploreCard(s)].some((id) => !!id && cardTraits(s, id).includes(trait));
}
/** Temperance 特殊規則：只結算行動卡有該特質的部分 */
export function actionHas(s: GameState, trait: string): boolean {
  const a = actionCard(s);
  return !!a && cardTraits(s, a).includes(trait);
}

/** 「grant your attack card any N traits」(KC-16) */
export function* grantAttackTraits(ctx: Ctx, n: number, rule = 'KC-16'): Gen {
  const a = attackCard(ctx.s);
  if (!a) {
    ctx.log(rule, '沒有攻擊卡');
    return;
  }
  for (let i = 0; i < n; i++) yield* grantTrait(ctx, a, rule);
}

/** 攻擊卡 MainExplore > MainAttack (印的數值；Valiance+ 互換後也照目前的值) */
export function attackCardExploreHigher(s: GameState): boolean {
  const a = attackCard(s);
  return !!a && printedMain(s, a, 'explore') > printedMain(s, a, 'attack');
}

export function mainAttackNow(s: GameState): number {
  return applyMods(s, { stat: 'mainAttack' }, printedMain(s, attackCard(s), 'attack'));
}

/**
 * 附著一張有某特質的卡到敵人 (或地點) 上 (KC-17：從手牌；fromDiscard 時也可從棄牌堆)。
 * From the Ashes：可以選棄牌堆的卡 (flag 'attachFromDiscard')。回傳附著的卡。
 */
export function* attachWithTrait(ctx: Ctx, trait: string, target: string | 'location', rule: string, fromDiscard = false): Gen<string | null> {
  const s = ctx.s;
  const discardOk = fromDiscard || hasFlag(s, 'attachFromDiscard');
  const cands = [...s.player.hand, ...(discardOk ? s.player.discard : [])].filter((id) => cardTraits(s, id).includes(trait));
  if (!cands.length) {
    ctx.log(rule, `沒有 ${trait} 卡可以附著`);
    return null;
  }
  const [c] = yield* chooseCards(ctx, rule, `選 1 張 ${trait} 卡附著到 ${target === 'location' ? '地點' : cardName(target)}`, cands, 1, 1);
  yield* attachCard(ctx, c, target, rule);
  return c;
}

export function isTrance(s: GameState, card: string): boolean {
  return cardTraits(s, card).includes('Trance');
}

export function need(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new InvalidAnswer(msg);
}

export function elementOf(id: string) {
  return playerCard(id).element;
}

/** 棄掉 / 花費信標 (效果用，不放 Obstacle；KC-28 進地點棄牌堆)；回傳棄掉的信標 */
export function* spendBeacons(ctx: Ctx, min: number, max: number, rule: string, why: string): Gen<string[]> {
  const p = ctx.s.player;
  const picks = yield* chooseCards(ctx, rule, `${why}：選擇信標`, p.beacons.slice(), min, max);
  for (const b of picks) {
    p.beacons = p.beacons.filter((x) => x !== b);
    ctx.s.world.locationDiscard.push(b);
    ctx.log(rule, `花費信標 ${cardName(b)} (${why})`);
    yield* emitEvent(ctx, { t: 'BeaconSpent', location: b });
  }
  return picks;
}

/** 從地點棄牌堆保存信標 (不是在移動中，不觸發 Druidane Spellcaster) */
export function* saveBeaconsFromDiscard(ctx: Ctx, max: number, rule: string, why: string): Gen<string[]> {
  const s = ctx.s;
  const room = Math.max(0, beaconLimit(s) - s.player.beacons.length);
  const picks = yield* chooseCards(ctx, rule, `${why}：從地點棄牌堆選信標`, s.world.locationDiscard.slice(), 0, Math.min(max, room));
  for (const b of picks) {
    s.world.locationDiscard = s.world.locationDiscard.filter((x) => x !== b);
    s.player.beacons.push(b);
    ctx.log(rule, `保存信標 ${cardName(b)} (${why})`);
    yield* emitEvent(ctx, { t: 'BeaconSaved', location: b, travel: false });
  }
  return picks;
}

/** 敵人攻擊另一個敵人 (⚠ INTERP：攻擊值 − 目標對攻擊者類型的防禦；雙類型取較低的防禦) */
export function* enemyAttacksEnemy(ctx: Ctx, attacker: string, target: string, rule: string): Gen {
  const s = ctx.s;
  if (!s.world.enemies[attacker] || !s.world.enemies[target]) return;
  const atk = enemyAttack(s, attacker);
  const def = Math.min(...enemyTypes(s, attacker).map((t) => enemyDefenseVs(s, target, t)));
  const n = Math.max(0, atk - def);
  ctx.log(rule, `${cardName(attacker)} 攻擊 ${cardName(target)}：攻擊 ${atk}，防禦 ${def}，傷害 ${n}`);
  yield* woundEnemy(ctx, target, n, 'direct', rule);
}
