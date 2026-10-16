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

/** 共用欄位；各種類的其他欄位在後續模組再補上精確型別。 */
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

export const CARDS: readonly CardData[] = rawCards as CardData[];
export const TRACKS = rawTracks;

const byId = new Map(CARDS.map((c) => [c.id, c]));

export function getCard(id: string): CardData {
  const c = byId.get(id);
  if (!c) throw new Error(`unknown card id: ${id}`);
  return c;
}

/** 卡圖路徑 (tools/crop_cards.py 產生)。 */
export function cardImagePath(id: string): string {
  return `cards/${id}.webp`;
}
