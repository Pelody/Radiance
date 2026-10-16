import { describe, expect, it } from 'vitest';
import { makeRng, nextFloat, shuffle } from '../src/engine/rng';
import { CARDS, getCard } from '../src/engine/data';

describe('EE-25 seeded RNG', () => {
  it('同一個種子產生同樣的洗牌結果', () => {
    const deck = Array.from({ length: 20 }, (_, i) => i);
    const [a] = shuffle(deck, makeRng(42));
    const [b] = shuffle(deck, makeRng(42));
    const [c] = shuffle(deck, makeRng(43));
    expect(a).toEqual(b);
    expect(a).not.toEqual(c);
    expect([...a].sort((x, y) => x - y)).toEqual(deck);
  });

  it('純函式：不改動輸入狀態', () => {
    const rng = makeRng(7);
    const [v1, s1] = nextFloat(rng);
    const [v2] = nextFloat(rng);
    expect(v1).toBe(v2);
    expect(s1).not.toEqual(rng);
    expect(v1).toBeGreaterThanOrEqual(0);
    expect(v1).toBeLessThan(1);
  });
});

describe('card data', () => {
  it('320 張卡面，id 與頁列欄一致', () => {
    expect(CARDS).toHaveLength(320);
    for (const c of CARDS) {
      const id = `p${String(c.page).padStart(2, '0')}r${c.row}c${c.col}`;
      expect(c.id).toBe(id);
    }
    expect(getCard('p01r0c0').name).toBe('Force of Will');
  });
});
