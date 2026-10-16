// EE-23：每張有效果文字的卡、每個技能都有寫成程式的效果。
import { describe, expect, it } from 'vitest';
import { CARDS } from '../src/engine/data';
import { registeredCardNames, registeredSkillNames } from '../src/engine/effects';
import '../src/engine/cards';

describe('卡片效果覆蓋率', () => {
  const cards = new Set(registeredCardNames());
  const skills = new Set(registeredSkillNames());
  it('所有玩家卡 (基礎面與進階面)', () => {
    const missing = CARDS.filter((c) => c.type === 'player_card')
      .map((c) => ((c as unknown as { side: string }).side === 'advanced' ? `${c.name}+` : (c.name as string)))
      .filter((n) => !cards.has(n));
    expect(missing).toEqual([]);
  });
  it('所有技能', () => {
    const missing = CARDS.filter((c) => c.type === 'skill_mat')
      .flatMap((m) => ((m as unknown as { skills: { name: string }[] }).skills ?? []).map((k) => k.name))
      .filter((n) => !skills.has(n));
    expect(missing).toEqual([]);
  });
  it('所有有效果文字的敵人 (Shadow 屬於選用模組 12)、地點、Treachery', () => {
    const missing = CARDS.filter(
      (c) => (c.type === 'enemy' && (c as { effect?: string }).effect && (c as { class?: string }).class !== 'Shadow') || c.type === 'location' || c.type === 'treachery',
    )
      .map((c) => c.name as string)
      .filter((n) => !cards.has(n));
    expect([...new Set(missing)]).toEqual([]);
  });
});
