// 卡片效果共用的小工具 (EE-23 效果積木的組合輔助)。
import { cardTraits, enemiesInPlay } from '../calc';
import type { Ctx, Gen } from '../core';
import { enemyCard } from '../data';
import type { EffectDef, Source } from '../effects';
import { flag } from '../effects';
import { placeTreacheryProgress } from '../ops';
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
