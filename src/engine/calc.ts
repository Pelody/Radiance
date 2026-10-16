// 衍生數值 (EE-01)。預覽與實際結算共用這一套函式 (DG-18)，不另寫估算邏輯。
import type { AttackType, Element, PlayerCardData } from './data';
import { enemyCard, getCard, locationCard, playerCard, skillMat, treacheryCard } from './data';
import { activeEffects, applyMods, isPlayerUpgraded, restriction } from './effects';
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

/** KC-16 本回合加的特質也算 */
export function cardTraits(s: GameState, id: string): string[] {
  const c = getCard(id);
  const base =
    c.type === 'player_card' ? face(s, id).traits : c.type === 'location' ? (c.trait_icons as string[]) : ((c.traits as string[]) ?? []);
  const extra = s.roundState.grantedTraits.filter((g) => g.target === id).map((g) => g.trait);
  return [...new Set([...base, ...extra])];
}

/** P2-03 光費 (含費用修正，例：Treachery legacy) */
export function lightCost(s: GameState, id: string, slot?: string): number {
  return Math.max(0, applyMods(s, { stat: 'lightCost', card: id, slot }, face(s, id).light_cost));
}

export function luminaryHP(s: GameState): number {
  return skillMat(s.player.luminary).hp ?? 0;
}
export function beaconLimit(s: GameState): number {
  return skillMat(s.player.luminary).beacon_limit ?? 0;
}

/** KC-08 */
export const handSize = (s: GameState) => characterStat(s, 'hand_size');
export const lightProduction = (s: GameState) => characterStat(s, 'light');
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
  const a = s.player.actionSet;
  const mainBase = a.attack ? face(s, a.attack).attack : 0;
  const main = applyMods(s, { stat: 'mainAttack' }, mainBase);
  const boosterBase = a.booster ? face(s, a.booster).attack_booster : 0;
  const booster = applyMods(s, { stat: 'attackBoost' }, boosterBase);
  const perm = activePermBoosters(s).reduce((n, id) => n + playerCard(id).attack_booster, 0);
  return { main, booster, perm, total: Math.max(0, main + booster + perm), type: a.attack ? face(s, a.attack).attack_type : null };
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
  const main = applyMods(s, { stat: 'mainExplore' }, a.explore ? face(s, a.explore).explore : 0);
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
  return Math.max(0, applyMods(s, { stat: 'enemyDarkness', enemy: id }, d === 'X' ? 0 : d));
}

export function enemyAttack(s: GameState, id: string): number {
  const a = enemyCard(id).attack;
  return Math.max(0, applyMods(s, { stat: 'enemyAttack', enemy: id, phase: s.phase }, a === 'X' ? 0 : a));
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
  return Math.max(0, applyMods(s, { stat: 'enemyDefense', enemy: id, attackType: type }, base));
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
  let ev = locationCard(id).explore_value + resistanceTrackValue(s);
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
  const obstacles = s.world.location.obstacles;
  const paths = s.world.location.paths;
  const raw = geographic + obstacles - paths + deferred;
  const withEffects = applyMods(s, { stat: 'distance', location: dest }, raw);
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
