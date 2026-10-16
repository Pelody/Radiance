// UI-04：每張卡都要有切好的卡圖 (tools/crop_cards.py 產生)
import { existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CARDS } from '../src/engine/data';

describe('UI-04 card images', () => {
  it('cards.json 每張卡在 public/cards 都有對應的 webp', () => {
    const missing = CARDS.filter((c) => !existsSync(`public/cards/${c.id}.webp`)).map((c) => c.id);
    expect(missing).toEqual([]);
  });
});
