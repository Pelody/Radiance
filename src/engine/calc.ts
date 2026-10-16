// 衍生數值 (EE-01)。預覽與實際結算共用這一套函式 (DG-18)，不另寫估算邏輯。
import type { AttackType, Element, PlayerCardData } from './data';
import { enemyCard, getCard, locationCard, playerCard, skillMat, treacheryCard } from './data';
import { activeEffects, applyMods, defsForCard, flag, isPlayerUpgraded, restriction } from './effects';
import type { GameState } from './types';
import {
  characterStat,
  distanceTrack,
  engagementSegment,
  resistanceTrackValue,
  shadeInfluenceSpaces,
  threatTrackValue,
} from './tracks';
import { shadeInfo } from './shades';

// ---------------------------------------------------------------- 玩家卡

/** 玩家卡目前的面 (KC-07 Upgrade 後永久為進階面) */
export function face(s: GameState, id: string): PlayerCardData {
  const c = playerCard(id);
  if (isPlayerUpgraded(s, id) && c.back_id) return playerCard(c.back_id);
  return c;
}

/** KC-16 本回合加的特質也算；本回合移除的特質不算 */
export function cardTraits(s: GameState, id: string): string[] {
  const c = getCard(id);
  const base =
    c.type === 'player_card' ? face(s, id).traits : c.type === 'location' ? (c.trait_icons as string[]) : ((c.traits as string[]) ?? []);
  const extra = s.roundState.grantedTraits.filter((g) => g.target === id).map((g) => g.trait);
  const removed = new Set(s.roundState.removedTraits.filter((g) => g.target === id).map((g) => g.trait));
  return [...new Set([...base, ...extra])].filter((t) => !removed.has(t));
}

export function hasTrait(s: GameState, id: string | null | undefined, trait: string): boolean {
  return !!id && cardTraits(s, id).includes(trait);
}

/** KC-15 行動組 4 張卡 */
export function actionSetCards(s: GameState): string[] {
  const a = s.player.actionSet;
  return [a.action, a.attack, a.booster, a.explore].filter((x): x is string => !!x);
}

/** KC-15 在場的卡 = 行動組 + 附著在敵人與地點上的卡 */
export function cardsInPlay(s: GameState): string[] {
  const att = [...s.world.questArea, ...s.world.playerArea].flatMap((e) => s.world.enemies[e]?.attachments ?? []);
  return [...actionSetCards(s), ...att, ...s.world.location.attachments];
}

/** KC-15 行動組中的特質 (去重) */
export function actionSetTraits(s: GameState): string[] {
  return [...new Set(actionSetCards(s).flatMap((id) => cardTraits(s, id)))];
}

/** 在場的特質 (每張卡各自計數；例：「number of brave traits in play」) */
export function traitCountInPlay(s: GameState, trait: string): number {
  return cardsInPlay(s).filter((id) => cardTraits(s, id).includes(trait)).length;
}

/** P2-03 光費 (含費用修正，例：Treachery legacy)；element = 假設的加成卡元素 (打出前計算) */
export function lightCost(s: GameState, id: string, slot?: string, element?: Element | null): number {
  return Math.max(0, applyMods(s, { stat: 'lightCost', card: id, slot, element }, face(s, id).light_cost));
}

/** 玩家卡的防禦值 (P7-02；Windwall+、Everkil 等修正) */
export function cardDefense(s: GameState, id: string): number {
  const v = applyMods(s, { stat: 'cardDefense', card: id }, face(s, id).defense);
  return Math.max(0, applyMods(s, { stat: 'cardDefenseFinal', card: id }, v));
}

export function luminaryHP(s: GameState): number {
  return skillMat(s.player.luminary).hp ?? 0;
}
export function beaconLimit(s: GameState): number {
  return skillMat(s.player.luminary).beacon_limit ?? 0;
}

/** KC-08 */
export const handSize = (s: GameState) => characterStat(s, 'hand_size');
export const lightProduction = (s: GameState) => Math.max(0, applyMods(s, { stat: 'lightProduction' }, characterStat(s, 'light')));
export const restValue = (s: GameState) => characterStat(s, 'rest');

/** KC-09 啟動中的永久加成卡 */
export function activePermBoosters(s: GameState, element: Element | null = s.roundState.activeElement): string[] {
  return s.player.permBoosters.filter((id) => element !== null && playerCard(id).element === element);
}

// ---------------------------------------------------------------- 攻擊與探索

export interface APBreakdown {
  main: number;
  booster: number;
  perm: number;
  total: number;
  type: AttackType | null;
}

/** P6-01 AP = 攻擊卡 + 加成卡 + 啟動中永久加成 + 效果加成 */
export function apBreakdown(s: GameState): APBreakdown {
  const main = applyMods(s, { stat: 'mainAttack' }, printedMain(s, s.player.actionSet.attack, 'attack'));
  const booster = attackBoost(s);
  const perm = activePermBoosters(s).reduce((n, id) => n + playerCard(id).attack_booster, 0);
  return { main, booster, perm, total: Math.max(0, main + booster + perm), type: attackType(s) };
}

/** 攻擊卡印的 MainAttack / MainExplore (Valiance+：兩者互換) */
export function printedMain(s: GameState, id: string | null, which: 'attack' | 'explore'): number {
  if (!id) return 0;
  const f = face(s, id);
  const swap = flag(s, 'swapMainStats');
  return (which === 'attack') !== swap ? f.attack : f.explore;
}

export function attackBoost(s: GameState): number {
  const b = s.player.actionSet.booster;
  return applyMods(s, { stat: 'attackBoost' }, b ? face(s, b).attack_booster : 0);
}

export function exploreBoost(s: GameState): number {
  const b = s.player.actionSet.booster;
  return applyMods(s, { stat: 'exploreBoost' }, (b ? face(s, b).explore_booster : 0) + s.roundState.beaconsDiscardedForExplore * 2);
}

/** P6-01 攻擊類型 = 攻擊卡類型 (Winds of Change：視為相反類型) */
export function attackType(s: GameState): AttackType | null {
  const a = s.player.actionSet.attack;
  if (!a) return null;
  const t = face(s, a).attack_type;
  if (!flag(s, 'invertAttackType')) return t;
  return t === 'Physical' ? 'Photonic' : 'Physical';
}

export function apAvailable(s: GameState): number {
  return Math.max(0, apBreakdown(s).total - s.roundState.apSpent);
}

export interface EPBreakdown {
  main: number;
  booster: number;
  perm: number;
  beacons: number;
  total: number;
}

/** P4-01 EP = 探索卡 + 加成卡 + 啟動中永久加成 + 信標 (每個 +2) + 效果修正 */
export function epBreakdown(s: GameState, beaconsDiscarded = s.roundState.beaconsDiscardedForExplore): EPBreakdown {
  const a = s.player.actionSet;
  const main = applyMods(s, { stat: 'mainExplore' }, printedMain(s, a.explore, 'explore'));
  const boosterBase = (a.booster ? face(s, a.booster).explore_booster : 0) + beaconsDiscarded * 2; // KC-29 用途 3
  const booster = applyMods(s, { stat: 'exploreBoost' }, boosterBase);
  const perm = activePermBoosters(s).reduce((n, id) => n + playerCard(id).explore_booster, 0);
  return { main, booster, perm, beacons: beaconsDiscarded * 2, total: Math.max(0, main + booster + perm) };
}

// ---------------------------------------------------------------- 敵人

export function enemyHP(s: GameState, id: string): number {
  return applyMods(s, { stat: 'enemyHP', enemy: id }, enemyCard(id).hp);
}

export function enemyDarkness(s: GameState, id: string): number {
  const d = enemyCard(id).darkness;
  const v = applyMods(s, { stat: 'enemyDarkness', enemy: id }, d === 'X' ? 0 : d);
  return Math.max(0, applyMods(s, { stat: 'enemyDarknessFinal', enemy: id }, v));
}

export function enemyAttack(s: GameState, id: string): number {
  const a = enemyCard(id).attack;
  const v = applyMods(s, { stat: 'enemyAttack', enemy: id, phase: s.phase }, a === 'X' ? 0 : a);
  return Math.max(0, applyMods(s, { stat: 'enemyAttackFinal', enemy: id, phase: s.phase }, v));
}

/** 敵人目前的先後攻 (Wing Wraith、Dunes of Galantir、Pride) */
export function enemyInitiative(s: GameState, id: string, revealing = false): 'Fast' | 'Slow' {
  let v: 'Fast' | 'Slow' = s.world.enemies[id]?.initiative ?? enemyCard(id).initiative;
  for (const { src, def } of activeEffects(s)) if (def.initiative) v = def.initiative(s, src, id, v, revealing);
  return v;
}

/** P6-03 擊敗獲得的 XP (Valiance、Stymied Victory 等修正) */
export function enemyXP(s: GameState, id: string): number {
  return Math.max(0, applyMods(s, { stat: 'enemyXP', enemy: id }, enemyCard(id).xp_reward));
}

/** P7-01 敵人本回合要攻擊幾次 (Garadeth Seeker) */
export function enemyAttackCount(s: GameState, id: string): number {
  return Math.max(0, applyMods(s, { stat: 'enemyAttackCount', enemy: id }, 1));
}

export function attachmentsOf(s: GameState, id: string): string[] {
  return s.world.enemies[id]?.attachments ?? [];
}
/** KC-30 Trapped / Tranced */
export function isTrapped(s: GameState, id: string): boolean {
  return attachmentsOf(s, id).some((a) => cardTraits(s, a).includes('Trap'));
}
export function isTranced(s: GameState, id: string): boolean {
  return attachmentsOf(s, id).some((a) => cardTraits(s, a).includes('Trance'));
}
/** 附著的 fire 卡 (fire 特質) */
export function fireAttachments(s: GameState, id: string): string[] {
  return attachmentsOf(s, id).filter((a) => cardTraits(s, a).includes('Fire'));
}
export function enemiesInPlay(s: GameState): string[] {
  return [...s.world.questArea, ...s.world.playerArea];
}
export function zoneOf(s: GameState, id: string): 'quest' | 'player' | null {
  return s.world.questArea.includes(id) ? 'quest' : s.world.playerArea.includes(id) ? 'player' : null;
}

function printedTypes(id: string): AttackType[] {
  const t = enemyCard(id).attack_defense_type;
  return t === 'Both' ? ['Physical', 'Photonic'] : [t];
}

/**
 * P7-01 / P7-01a 攻擊類型 = 防禦類型；Both = 兩種。
 * 效果給的防禦圖示也代表攻擊類型 (規則書 p.126 圖示說明：PhotonicDefense「also indicates enemy attack is photonic」)。
 */
export function enemyTypes(s: GameState, id: string): AttackType[] {
  const types = new Set(printedTypes(id));
  for (const { src, def } of activeEffects(s)) {
    if (def.extraTypes) for (const t of def.extraTypes(s, src, id)) types.add(t);
  }
  return (['Physical', 'Photonic'] as AttackType[]).filter((t) => types.has(t));
}

/** P6-02 第 2 步：擋下多少 AP (類型相符才擋；Both 兩種都擋)。卡面數值只屬於印刷的類型，效果加的類型由效果給數值。 */
export function enemyDefenseVs(s: GameState, id: string, type: AttackType): number {
  const base = printedTypes(id).includes(type) ? enemyCard(id).defense : 0;
  const v = applyMods(s, { stat: 'enemyDefense', enemy: id, attackType: type }, base);
  return Math.max(0, applyMods(s, { stat: 'enemyDefenseFinal', enemy: id, attackType: type }, v));
}

/** 敵人的「defense stat」(印的防禦值 + 修正，不分類型；Fortitude+、Striking Gold+、In the Wind) */
export function enemyDefenseStat(s: GameState, id: string): number {
  return Math.max(0, ...enemyTypes(s, id).map((t) => enemyDefenseVs(s, id, t)));
}

export function isTracked(s: GameState, id: string): boolean {
  return (s.world.enemies[id]?.progress ?? 0) >= enemyDarkness(s, id); // KC-30 Tracked
}

/** P4-02 第 1 步：任務區黑暗總和 − 忽略黑暗，最低 0 */
export function questDarkness(s: GameState): { raw: number; ignored: number; effective: number } {
  const raw = s.world.questArea.reduce((n, id) => n + enemyDarkness(s, id), 0);
  const ignored = applyMods(s, { stat: 'ignoreDarkness' }, 0);
  return { raw, ignored, effective: Math.max(0, raw - ignored) };
}

// ---------------------------------------------------------------- 軌道與世界

/** P1-01 威脅值 */
export function threatBreakdown(s: GameState): { track: number; tokens: number; shade: number; other: number; total: number } {
  const track = threatTrackValue(s);
  const tokens = s.world.location.threatTokens;
  const shade = s.roundState.shadeInfluenceThreat;
  const other = applyMods(s, { stat: 'threat' }, 0);
  return { track, tokens, shade, other, total: Math.max(0, track + tokens + shade + other) };
}

/** P3-01 接戰數 (含效果修正，例：Step Lightly) */
export function engagementCount(s: GameState, light = s.player.light): number {
  return Math.max(0, applyMods(s, { stat: 'engagement' }, engagementSegment(s, light).engage));
}

/** P5-02 / FL-01 探索值 */
export function locationEV(s: GameState, id = s.world.location.id): number {
  // Envy：玩家區的地點不受抗性軌道影響
  const envy = s.world.envyLocations.some((l) => l.id === id);
  let ev = locationCard(id).explore_value + (envy ? 0 : resistanceTrackValue(s));
  if (isFinalLocation(s, id) && id === s.world.location.id) ev += s.world.location.obstacles; // FL-01
  return Math.max(0, applyMods(s, { stat: 'locationEV', location: id }, ev));
}

export function isFinalCandidate(s: GameState, id: string): boolean {
  return shadeInfo(s.world.shade).finalLocations.includes(locationCard(id).name);
}
/** SH-02：本局的最終地點 (抵達候選後確定) */
export function isFinalLocation(s: GameState, id: string): boolean {
  return s.world.finalLocation === id;
}

export interface DistanceBreakdown {
  geographic: number;
  obstacles: number;
  paths: number;
  deferred: number;
  effects: number;
  total: number;
  minimum: number;
}

/** T2a 距離 = 地理距離 + 障礙 − 道路 + 延後數 + 效果修正，最小 1 */
export function distanceBreakdown(s: GameState, dest: string, deferred: number): DistanceBreakdown {
  const from = locationCard(s.world.location.id).coordinates;
  const to = locationCard(dest).coordinates;
  const geographic = Math.abs(from.east - to.east) + Math.abs(from.south - to.south);
  const obstacles = flag(s, 'ignoreObstaclesTravel') ? 0 : s.world.location.obstacles; // Fortitude
  const paths = s.world.location.paths;
  const raw = geographic + obstacles - paths + deferred;
  // 目的地自己的「It costs +1 Distance to travel here」(Terra Lake)
  let here = 0;
  for (const def of defsForCard(s, dest)) if (def.modify) here = def.modify(s, { id: `location:${dest}`, kind: 'location', name: locationCard(dest).name, cardId: dest }, { stat: 'distanceHere', location: dest }, here);
  const withEffects = applyMods(s, { stat: 'distance', location: dest }, raw + here);
  const minimum = 1; // T2a 參考卡「minimum of 1」；卡片另有下限時由效果處理
  return {
    geographic,
    obstacles,
    paths,
    deferred,
    effects: withEffects - raw,
    total: Math.max(minimum, withEffects),
    minimum,
  };
}

export interface TravelCost {
  fromBox: number;
  toBox: number;
  overflow: number;
  threat: number;
  resistance: number;
  threatTokens: number;
}

/** T2b / T2c 距離軌道推進 */
export function travelCost(s: GameState, distance: number): TravelCost {
  const dt = distanceTrack(s);
  const target = s.world.distanceBox + distance;
  const toBox = Math.min(target, dt.max_box);
  const overflow = Math.max(0, target - dt.max_box);
  const box = dt.boxes[toBox];
  return {
    fromBox: s.world.distanceBox,
    toBox,
    overflow,
    threat: box.threat, // D-02 ⚠ INTERP：溢出時仍獲得最右框的推進值
    resistance: box.resistance,
    threatTokens: overflow * dt.overflow_threat_tokens_per_distance,
  };
}

/** SH-03 若在 Shade 影響墊目前位置揭示 Shade 會得到的效果 */
export function shadeInfluenceEffect(s: GameState): { threat?: number; xp?: number } {
  const sp = shadeInfluenceSpaces(s);
  return sp[Math.min(s.world.shadeInfluence, sp.length - 1)];
}

export function canTravelTo(s: GameState, id: string): string | null {
  return restriction(s, { kind: 'travelTo', location: id }); // EE-02
}

export function fetchCost(s: GameState): number {
  // T1a 4 XP；Greed 的 Special 改成 3 XP (以 EE-01 修正處理)
  return applyMods(s, { stat: 'fetchCost' }, 4);
}

export function treacheryPV(s: GameState): number {
  const t = s.world.activeTreachery;
  return t ? treacheryCard(t).progress_value : 0;
}

export function echo(s: GameState): string | null {
  const d = s.player.discard;
  return d.length ? d[d.length - 1] : null; // KC-20
}
