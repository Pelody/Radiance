// 軌道資料表查詢 (D-01 ~ D-05)。數值一律來自 data/tracks.json，不寫死 (01-state-and-data.md)。
import { TRACKS } from './data';
import type { GameState } from './types';

type Growth = typeof TRACKS.growth.normal;
type Corr = typeof TRACKS.corruption.normal;

export interface AbilitySpace {
  cost?: number;
  unlock?: number;
  recruit?: number;
  upgrade?: number;
}
export interface CharacterSpace {
  cost?: number;
  light?: number;
  hand_size?: number;
  rest?: number;
  perm_booster?: number;
}
export interface EngagementSegment {
  spaces: number[];
  engage: number;
  reveal: string[];
  wounds: number;
}

export const growth = (s: GameState): Growth => TRACKS.growth[s.config.trackSide] as Growth;
export const corr = (s: GameState): Corr => TRACKS.corruption[s.config.trackSide] as Corr;

export const LIGHT_MIN = 0;
export function lightMax(s: GameState): number {
  return growth(s).light_track.max;
}

/** D-01 能力成長軌道：第 pos 格 (0 = 起點) */
export function abilitySpace(s: GameState, pos: number): AbilitySpace {
  const g = growth(s).ability;
  return pos === 0 ? g.start : (g.spaces[pos - 1] as AbilitySpace);
}
export function abilityTrackLength(s: GameState): number {
  return growth(s).ability.spaces.length;
}

export function characterSpace(s: GameState, pos: number): CharacterSpace {
  const g = growth(s).character;
  return pos === 0 ? g.start : (g.spaces[pos - 1] as CharacterSpace);
}
export function characterTrackLength(s: GameState): number {
  return growth(s).character.spaces.length;
}

/** KC-08 角色數值 = 方塊位置以下 (含) 出現過的最大值 */
export function characterStat(s: GameState, stat: 'light' | 'hand_size' | 'rest', pos = s.player.characterGrowthPos): number {
  let best = 0;
  for (let i = 0; i <= pos; i++) {
    const v = characterSpace(s, i)[stat];
    if (v !== undefined && v > best) best = v;
  }
  return best;
}

/** D-01 光軌道的接戰區段 (P3-01) */
export function engagementSegment(s: GameState, light: number): EngagementSegment {
  const segs = growth(s).light_track.engagement as EngagementSegment[];
  const seg = segs.find((g) => g.spaces.includes(light));
  if (!seg) throw new Error(`no engagement segment for light ${light}`);
  return seg;
}

/** D-03 威脅軌道區段值 */
export function threatTrackValue(s: GameState, pos = s.world.threat): number {
  return (corr(s).threat_track.value as Record<string, number>)[String(pos)];
}
/** D-04 抗性軌道區段值 */
export function resistanceTrackValue(s: GameState, pos = s.world.resistance): number {
  return (corr(s).resistance_track.value as Record<string, number>)[String(pos)];
}
export function trackMax(s: GameState): number {
  return corr(s).threat_track.max;
}
export function corruptionMax(s: GameState): number {
  return corr(s).corruption_track.max;
}

/** D-02 距離軌道 */
export function distanceTrack(s: GameState) {
  return corr(s).distance_track;
}
export function startBoxForCorruption(s: GameState, corruption = s.world.corruption): number {
  const m = distanceTrack(s).start_box_by_corruption as Record<string, number>;
  return m[String(Math.min(corruption, corruptionMax(s)))];
}

/** D-05 Shade 影響墊 */
export function shadeInfluenceSpaces(s: GameState): { label: string; threat?: number; xp?: number }[] {
  return TRACKS.shade_influence[s.config.shadeInfluenceSide].spaces;
}
