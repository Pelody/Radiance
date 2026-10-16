// 煙霧測試：隨機玩家跑完整局 (各種角色、職業、Shade、難度)，檢查不當機與不變量。
import { describe, expect, it } from 'vitest';
import { CARDS, LUMINARIES, PROFESSIONS, SHADES } from '../src/engine/data';
import { deserialize, newGame, serialize, submit, view, type Game } from '../src/engine/game';
import type { GameState } from '../src/engine/types';
import { luminaryHP } from '../src/engine/calc';
import { Bot } from './helpers/bot';

const ENEMY_TOTAL = CARDS.filter((c) => c.type === 'enemy' && (c.class === 'Dusk' || c.class === 'Doom')).length;
const LOCATION_TOTAL = CARDS.filter((c) => c.type === 'location').length;

function invariants(s: GameState): void {
  const p = s.player;
  const w = s.world;
  // 玩家卡守恆：自己 12 + 嗜好 6 + 永久加成來源 6，不重複、不遺失
  const slots = Object.values(p.actionSet).filter((x): x is string => !!x);
  const attached = [...Object.values(w.enemies).flatMap((e) => e.attachments), ...w.location.attachments];
  const all = [...p.deck, ...p.hand, ...p.discard, ...slots, ...attached, ...p.hobbyDeck, ...p.hobbyMarket, ...p.permBoosterSource, ...p.permBoosters];
  expect(new Set(all).size).toBe(all.length);
  expect(all.length).toBe(24);
  // 敵人守恆 (Dusk + Doom)
  const enemiesInPlay = [...w.questArea, ...w.playerArea].filter((id) => !id.startsWith('p33') && !id.startsWith('p35'));
  const enemyAll = [...w.duskDeck, ...w.doomDeck, ...w.duskDiscard, ...w.doomDiscard, ...enemiesInPlay];
  expect(new Set(enemyAll).size).toBe(enemyAll.length);
  expect(enemyAll.length).toBe(ENEMY_TOTAL);
  // 地點守恆
  const locs = [...w.locationDeck, ...w.locationDiscard, ...p.beacons, w.location.id, ...w.removedLocations, ...w.deferred, ...(w.revealedLocation ? [w.revealedLocation] : [])];
  expect(new Set(locs).size).toBe(locs.length);
  expect(locs.length).toBe(LOCATION_TOTAL);
  // 數值範圍
  expect(p.light).toBeGreaterThanOrEqual(0);
  expect(p.light).toBeLessThanOrEqual(20);
  if (!s.outcome) expect(p.wounds).toBeLessThan(luminaryHP(s));
  expect(p.beacons.length).toBeLessThanOrEqual(5);
}

function playOut(seed: number, maxDecisions = 4000): { g: Game; decisions: number } {
  const lum = LUMINARIES[seed % 4];
  const prof = PROFESSIONS[(seed >> 2) % 4];
  const others = PROFESSIONS.filter((x) => x !== prof);
  let g = newGame({
    luminary: lum,
    profession: prof,
    hobby: others[seed % 3],
    permSource: others[(seed + 1) % 3],
    shade: SHADES[seed % 3], // Envy 的特殊規則屬於階段 4
    difficulty: (['Ember', 'Blaze', 'Radiant'] as const)[seed % 3],
    seed,
  });
  const bot = new Bot(seed * 7 + 1);
  let n = 0;
  for (; n < maxDecisions; n++) {
    const v = view(g);
    if (!v.pending) break;
    g = submit(g, bot.answer(v.pending, v.state));
    if (n % 25 === 0 && view(g).state.round >= 1) invariants(view(g).state);
  }
  return { g, decisions: n };
}

describe('隨機整局 (煙霧測試)', () => {
  const seeds = Array.from({ length: 24 }, (_, i) => i + 1);
  it.each(seeds)('seed %i：跑到結束或決策上限，不當機、不變量成立', (seed) => {
    const { g } = playOut(seed);
    const s = view(g).state;
    invariants(s);
    expect(s.round).toBeGreaterThanOrEqual(1);
  });

  it('同一個種子、同樣的決定 → 完全相同的結果 (EE-25)', () => {
    const a = view(playOut(5, 300).g).state;
    const b = view(playOut(5, 300).g).state;
    expect(b).toEqual(a);
  });

  it('存檔序列化後還原，狀態與待決策相同', () => {
    const { g } = playOut(9, 200);
    const g2 = deserialize(serialize(g));
    expect(view(g2).state).toEqual(view(g).state);
    expect(view(g2).pending?.prompt).toEqual(view(g).pending?.prompt);
  });
});
