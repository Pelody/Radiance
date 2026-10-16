// 隨機玩家：對任何待決策給出隨機的合法回答。用於煙霧測試 (整局跑完不當機、不變量成立)。
import type { Answer, Decision } from '../../src/engine/core';
import { validateActionSet } from '../../src/engine/phases';
import type { GameState } from '../../src/engine/types';
import { makeRng, nextFloat, type RngState } from '../../src/engine/rng';
import { apBreakdown, enemyDefenseVs, enemyHP } from '../../src/engine/calc';

export class Bot {
  rng: RngState;
  constructor(seed: number, public passBias = 0.5) {
    this.rng = makeRng(seed);
  }
  rand(): number {
    const [v, r] = nextFloat(this.rng);
    this.rng = r;
    return v;
  }
  int(lo: number, hi: number): number {
    return lo + Math.floor(this.rand() * (hi - lo + 1));
  }
  pick<T>(xs: T[]): T {
    return xs[Math.floor(this.rand() * xs.length)];
  }

  answer(d: Decision, s: GameState): Answer {
    switch (d.type) {
      case 'choose': {
        const legal = d.options!.filter((o) => o.legal !== false);
        return this.pick(legal).id;
      }
      case 'window': {
        const legal = d.options!.filter((o) => o.legal !== false);
        const pass = legal.find((o) => o.id === 'pass');
        if (pass && this.rand() < this.passBias) return 'pass';
        const o = this.pick(legal);
        if (o.id.startsWith('assign:')) return { option: o.id, amount: this.int(1, o.data!.max as number) };
        return { option: o.id };
      }
      case 'number':
        return this.int(d.min!, d.max!);
      case 'cards': {
        const cs = d.cards!.filter(() => this.rand() < 0.3);
        return cs.slice(0, d.max ?? cs.length);
      }
      case 'order': {
        const cs = d.cards!.slice();
        for (let i = cs.length - 1; i > 0; i--) {
          const j = this.int(0, i);
          [cs[i], cs[j]] = [cs[j], cs[i]];
        }
        return cs;
      }
      case 'actionSet': {
        const hand = d.cards!;
        const combos: { action: string; attack: string; booster: string }[] = [];
        for (const a of hand) for (const b of hand) for (const c of hand) {
          if (a === b || b === c || a === c) continue;
          const x = { action: a, attack: b, booster: c };
          if (!validateActionSet({ s }, x)) combos.push(x);
        }
        return this.pick(combos);
      }
    }
  }
}

/** 簡單策略玩家：防禦擋滿、攻擊打得死的敵人、優先抵消黑暗、能成長就成長。用來跑到遊戲後期。 */
export class SmartBot extends Bot {
  answer(d: Decision, s: GameState): Answer {
    const legal = d.options?.filter((o) => o.legal !== false) ?? [];
    const has = (id: string) => legal.some((o) => o.id === id);
    if (d.type === 'window') {
      if (has('growAbility') && this.rand() < 0.7) return { option: 'growAbility' };
      if (has('growCharacter') && this.rand() < 0.7) return { option: 'growCharacter' };
      const assign = legal.filter((o) => o.id.startsWith('assign:'));
      if (assign.length) {
        // 只分配剛好擊敗所需的 AP (打不死就全給)
        const o = this.pick(assign);
        const max = o.data!.max as number;
        const id = o.data!.enemy as string;
        const need = enemyDefenseVs(s, id, apBreakdown(s).type ?? 'Physical') + enemyHP(s, id) - s.world.enemies[id].wounds;
        return { option: o.id, amount: Math.max(1, Math.min(max, need)) };
      }
      const atk = legal.find((o) => o.id.startsWith('attacker:'));
      if (atk) return { option: atk.id };
      const skill = legal.find((o) => o.id.startsWith('skill:'));
      if (skill && this.rand() < 0.5) return { option: skill.id };
      if (has('search') && this.rand() < 0.5) return { option: 'search' };
      if (has('pass')) return 'pass';
      return super.answer(d, s);
    }
    if (d.rule === 'P7-02' && d.type === 'choose') {
      const m = /\((\d+)，已擋 (\d+)\)/.exec(d.prompt);
      if (m && Number(m[2]) >= Number(m[1])) return 'done';
      const hand = legal.find((o) => o.id.startsWith('hand:'));
      if (hand) return hand.id;
      if (has('peek')) return 'peek';
      if (has('top')) return 'top';
      return 'done';
    }
    if (d.rule === 'P8-03') {
      if (has('physical')) return 'physical';
      return 'done';
    }
    if (d.rule === 'P8-04' && d.type === 'choose') return 'done';
    if (d.type === 'number' && d.rule === 'P4-02') {
      // 抵消大部分黑暗，但留一點探索
      return Math.max(d.min!, d.max! - (this.rand() < 0.5 ? 1 : 0));
    }
    if (d.type === 'cards' && d.rule === 'P4-01') return [];
    if (d.rule === 'T1c' && d.type === 'choose') {
      if (has('travel') && this.rand() < 0.6) return 'travel';
      if (has('save') && this.rand() < 0.5) return 'save';
      if (has('defer')) return 'defer';
    }
    if (d.rule === 'T1' && has('beacon') && this.rand() < 0.5) return 'beacon';
    if (d.type === 'actionSet') {
      // 付得起的組合中選光費最低的
      const hand = d.cards!;
      let best: { action: string; attack: string; booster: string } | null = null;
      let bestScore = Infinity;
      for (const a of hand) for (const b of hand) for (const c of hand) {
        if (a === b || b === c || a === c) continue;
        const x = { action: a, attack: b, booster: c };
        if (validateActionSet({ s }, x)) continue;
        const score = this.rand();
        if (score < bestScore) {
          bestScore = score;
          best = x;
        }
      }
      return best!;
    }
    return super.answer(d, s);
  }
}
