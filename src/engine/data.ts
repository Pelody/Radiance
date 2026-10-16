// 卡片資料載入 (data/cards.json，欄位見 data/README.md)。
// 引擎只讀資料欄位；卡片文字只作顯示與對照，不解析 (EE-23)。
import rawCards from '../../data/cards.json';
import rawTracks from '../../data/tracks.json';

export type CardType =
  | 'player_card'
  | 'enemy'
  | 'location'
  | 'treachery'
  | 'companion'
  | 'skill_mat'
  | 'skill_mat_back'
  | 'shade_back'
  | 'shadow_meddler'
  | 'side_quest'
  | 'baron_encounter'
  | 'baron_reward'
  | 'limited_quest'
  | 'limited_quest_reward';

export type Element = 'Earth' | 'Fire' | 'Wind';
export type AttackType = 'Physical' | 'Photonic';
export type Initiative = 'Fast' | 'Slow';

/** 共用欄位。 */
export interface CardData {
  id: string; // pNNrRcC：PnP 檔中的頁、列、欄
  page: number;
  row: number;
  col: number;
  type: CardType;
  rotated: boolean;
  name?: string;
  back_id?: string;
  front_id?: string;
  [field: string]: unknown;
}

export interface CardEffectText {
  type: string; // KC-10 效果類型
  italic: boolean;
  text: string;
}

export interface PlayerCardData extends CardData {
  type: 'player_card';
  name: string;
  attack: number;
  attack_type: AttackType;
  light_cost: number;
  defense: number;
  explore: number;
  owner: string;
  owner_type: 'luminary' | 'profession';
  element: Element;
  attack_booster: number;
  explore_booster: number;
  traits: string[];
  effects: CardEffectText[];
  side: 'basic' | 'advanced';
}

export interface EnemyData extends CardData {
  type: 'enemy';
  name: string;
  darkness: number | 'X';
  attack: number | 'X';
  defense: number;
  initiative: Initiative;
  attack_defense_type: AttackType | 'Both';
  faction: string;
  class: 'Dusk' | 'Doom' | 'Shade' | 'Shadow';
  hp: number;
  traits: string[];
  effect: string | null;
  xp_reward: number;
}

export interface LocationData extends CardData {
  type: 'location';
  name: string;
  explore_value: number;
  coordinates: { east: number; south: number };
  trait_icons: string[];
  effect: string | null;
  xp_reward: number;
}

export interface TreacheryData extends CardData {
  type: 'treachery';
  name: string;
  progress_value: number;
  when_completed: string;
  legacy: string;
}

export interface SkillData {
  column: number;
  name: string;
  effect_type: string;
  text: string;
}

export interface SkillMatData extends CardData {
  type: 'skill_mat';
  name: string;
  mat_type: 'luminary' | 'profession';
  skills: SkillData[];
  special_rules: string | null;
  hp?: number;
  beacon_limit?: number;
}

export interface ShadeBackData extends CardData {
  type: 'shade_back';
  name: string;
  sections: Record<string, string>;
}

export const CARDS: readonly CardData[] = rawCards as CardData[];
export const TRACKS = rawTracks;

const byId = new Map(CARDS.map((c) => [c.id, c]));

export function getCard(id: string): CardData {
  const c = byId.get(id);
  if (!c) throw new Error(`unknown card id: ${id}`);
  return c;
}

export const playerCard = (id: string) => getCard(id) as PlayerCardData;
export const enemyCard = (id: string) => getCard(id) as EnemyData;
export const locationCard = (id: string) => getCard(id) as LocationData;
export const treacheryCard = (id: string) => getCard(id) as TreacheryData;

export function cardName(id: string): string {
  return getCard(id).name ?? id;
}

/** 依名稱找卡 (只用於開局設定與測試劇本；同名多張時用 filter 區分)。 */
export function findCards(pred: (c: CardData) => boolean): CardData[] {
  return CARDS.filter(pred);
}

export function findByName(type: CardType, name: string, extra?: (c: CardData) => boolean): CardData {
  const c = CARDS.find((x) => x.type === type && x.name === name && (!extra || extra(x)));
  if (!c) throw new Error(`card not found: ${type} ${name}`);
  return c;
}

export function skillMat(name: string): SkillMatData {
  return findByName('skill_mat', name) as SkillMatData;
}

export function shadeBack(name: string): ShadeBackData {
  return findByName('shade_back', name) as ShadeBackData;
}

export function shadeFront(name: string): EnemyData {
  return findByName('enemy', name, (c) => c.class === 'Shade') as EnemyData;
}

export const LUMINARIES = ['Courage', 'Justice', 'Temperance', 'Wisdom'] as const;
export const PROFESSIONS = ['Hunter', 'Mender', 'Scorchwright', 'Wayfarer'] as const;
export const SHADES = ['Greed', 'Pride', 'Wrath', 'Envy'] as const;

/** 某角色或職業的 6 張基礎面玩家卡 (SU-04)。 */
export function ownerBasicCards(owner: string): PlayerCardData[] {
  return CARDS.filter(
    (c) => c.type === 'player_card' && c.owner === owner && c.side === 'basic',
  ) as PlayerCardData[];
}

/** 卡圖路徑 (tools/crop_cards.py 產生)。 */
export function cardImagePath(id: string): string {
  return `cards/${id}.webp`;
}
