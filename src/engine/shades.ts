// Shade 卡背面的固定數值 (SH-01)：最終地點、失敗條件、揭示時的黑暗門檻。
// 依 EE-23 不解析文字，人工對照 data/cards.json 的 shade_back.sections 寫成資料。
export interface ShadeInfo {
  name: string;
  /** SH-01 最終地點候選 (卡名) */
  finalLocations: string[];
  /** LOSE-01 第 2 條 */
  corruptionLimit: number;
  /** LOSE-01 第 3 條、TR-01 */
  treacheryLimit: number;
  /** When Revealed：任務區黑暗 (不含 Shade) 至少要有多少，不足就翻敵人 */
  revealDarkness: number;
}

export const SHADE_INFO: Record<string, ShadeInfo> = {
  // Location: Northwood City (4,3), Sol (5,1), or Garadeth (1,5). Loss: 5 Corruption or 3 completed treacheries.
  Greed: { name: 'Greed', finalLocations: ['Northwood City', 'Sol', 'Garadeth'], corruptionLimit: 5, treacheryLimit: 3, revealDarkness: 6 },
  // Location: Molta (6,5). Loss: 10 Corruption or 4 completed treacheries.
  Pride: { name: 'Pride', finalLocations: ['Molta'], corruptionLimit: 10, treacheryLimit: 4, revealDarkness: 5 },
  // Location: Nul-Gador (6,6) or Ruins of Crowbridge (5,6). Loss: 12 Corruption or 3 completed treacheries.
  Wrath: { name: 'Wrath', finalLocations: ['Nul-Gador', 'Ruins of Crowbridge'], corruptionLimit: 12, treacheryLimit: 3, revealDarkness: 7 },
  // Location: Pit of Shada (6,4), Darkwind (4,6), or Wrath Marshes (5,5). Loss: 9 Corruption or 6 completed treacheries.
  Envy: { name: 'Envy', finalLocations: ['Pit of Shada', 'Darkwind', 'Wrath Marshes'], corruptionLimit: 9, treacheryLimit: 6, revealDarkness: 0 },
};

export function shadeInfo(name: string): ShadeInfo {
  const i = SHADE_INFO[name];
  if (!i) throw new Error(`unknown shade ${name}`);
  return i;
}
