// EE-25 可重現性：所有洗牌使用可設定種子的亂數產生器。
// 狀態只有一個 32-bit 整數，可直接序列化進存檔 (localStorage)。

export interface RngState {
  seed: number;
}

/** mulberry32：回傳 [0,1) 的亂數與下一個狀態 (純函式，不改動輸入)。 */
export function nextFloat(rng: RngState): [number, RngState] {
  let t = (rng.seed + 0x6d2b79f5) | 0;
  const seed = t;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  const value = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  return [value, { seed }];
}

/** EE-25 洗牌 (Fisher–Yates)，回傳新陣列與下一個亂數狀態。 */
export function shuffle<T>(items: readonly T[], rng: RngState): [T[], RngState] {
  const out = items.slice();
  let state = rng;
  for (let i = out.length - 1; i > 0; i--) {
    let r: number;
    [r, state] = nextFloat(state);
    const j = Math.floor(r * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return [out, state];
}

export function makeRng(seed: number): RngState {
  return { seed: seed | 0 };
}
