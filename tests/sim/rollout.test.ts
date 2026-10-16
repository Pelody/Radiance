// 「贏得了嗎」驗證：重要決策用模擬 (往後下完幾局) 選最好的選項。
// 會看到未來 (作弊)，只用來證明引擎裡的遊戲確實可以贏。手動執行：SIM=1 npx vitest run tests/sim/rollout
import { it } from 'vitest';
import type { Answer, Decision } from '../../src/engine/core';
import { LUMINARIES, PROFESSIONS, SHADES } from '../../src/engine/data';
import { newGame, submit, view, type Game } from '../../src/engine/game';
import { validateActionSet } from '../../src/engine/phases';
import { face, lightCost } from '../../src/engine/calc';
import { engagementSegment } from '../../src/engine/tracks';
import type { GameState } from '../../src/engine/types';
import { StrategyBot } from '../helpers/strategy';

function score(s: GameState): number {
  if (s.outcome?.result === 'win') return 100000 - s.round * 10;
  return s.round * 30 + s.world.exploredCount * 40 + (s.world.finalLocation ? 150 : 0) + (s.world.shadeDefeated ? 600 : 0) + (s.world.shadeRevealed ? 100 : 0) - s.player.wounds * 3;
}

function rollout(g: Game, seed: number, maxSteps = 3000): GameState {
  const bot = new StrategyBot(seed);
  for (let i = 0; i < maxSteps; i++) {
    const v = view(g);
    if (!v.pending) return v.state;
    try {
      g = submit(g, bot.answer(v.pending, v.state));
    } catch {
      return v.state;
    }
  }
  return view(g).state;
}

/** 這個決策要不要用模擬，以及要比較哪些候選回答 */
function candidates(d: Decision, s: GameState, base: StrategyBot): Answer[] | null {
  const legal = d.options?.filter((o) => o.legal !== false) ?? [];
  if (d.type === 'actionSet') {
    const hand = d.cards!;
    const all: { a: Answer; h: number }[] = [];
    for (const a of hand)
      for (const b of hand)
        for (const c of hand) {
          if (a === b || b === c || a === c) continue;
          const x = { action: a, attack: b, booster: c };
          if (validateActionSet({ s }, x)) continue;
          const cost = lightCost(s, a, 'action') + lightCost(s, b, 'attack') + lightCost(s, c, 'booster');
          const seg = engagementSegment(s, Math.max(0, s.player.light - cost));
          const h = face(s, b).attack + face(s, c).attack_booster + face(s, c).explore_booster + 0.5 * face(s, b).explore - 4 * seg.engage - 6 * seg.reveal.length;
          all.push({ a: x, h });
        }
    return all.sort((x, y) => y.h - x.h).slice(0, 8).map((x) => x.a);
  }
  if (d.type === 'number' && d.rule === 'P4-02') {
    const vals = new Set([d.min!, d.max!, Math.round((d.min! + d.max!) / 2), base.answer(d, s) as number]);
    return [...vals];
  }
  if (d.type === 'choose' && ['T1', 'T1c', 'P8-03', 'KC-12f', 'T1a', 'T1b'].includes(d.rule) && legal.length > 1) return legal.map((o) => o.id);
  if (d.type === 'window' && legal.some((o) => o.id.startsWith('assign:'))) {
    const opts: Answer[] = legal.filter((o) => o.id.startsWith('assign:')).map((o) => ({ option: o.id, amount: o.data!.max }));
    if (legal.some((o) => o.id === 'pass')) opts.push('pass');
    opts.push(base.answer(d, s));
    return opts;
  }
  if (d.type === 'window' && legal.some((o) => o.id === 'growAbility' || o.id === 'growCharacter')) {
    return ['pass', ...legal.filter((o) => o.id.startsWith('grow')).map((o) => ({ option: o.id }))].filter((a) => a === 'pass' ? legal.some((o) => o.id === 'pass') : true);
  }
  return null;
}

function playSmart(seed: number, lum: string, prof: string, shade: string, rollouts = 3): GameState {
  const others = PROFESSIONS.filter((x) => x !== prof);
  let g = newGame({ luminary: lum, profession: prof, hobby: others[0], permSource: others[1], shade, difficulty: 'Ember', seed });
  const base = new StrategyBot(seed);
  for (let step = 0; step < 6000; step++) {
    const v = view(g);
    if (!v.pending) break;
    const cands = candidates(v.pending, v.state, base);
    let ans: Answer = base.answer(v.pending, v.state);
    if (cands && cands.length > 1) {
      let best = -Infinity;
      for (const c of cands) {
        let next: Game;
        try {
          next = submit(g, c);
        } catch {
          continue;
        }
        let tot = 0;
        for (let r = 0; r < rollouts; r++) tot += score(rollout(next, seed * 100 + r + step));
        if (tot > best) {
          best = tot;
          ans = c;
        }
      }
    }
    g = submit(g, ans);
  }
  return view(g).state;
}

it.skipIf(!process.env.SIM)('rollout', () => {
  const N = Number(process.env.N ?? 6);
  const out: string[] = [];
  for (let seed = Number(process.env.FROM ?? 1); seed <= N; seed++) {
    const lum = LUMINARIES[seed % 4];
    const prof = PROFESSIONS[(seed >> 2) % 4];
    const shade = SHADES[(seed >> 1) % 4];
    const s = playSmart(seed, lum, prof, shade);
    out.push(`${seed} ${lum}/${prof}/${shade} r${s.round} explored ${s.world.exploredCount} shade ${s.world.shadeRevealed ? (s.world.shadeDefeated ? 'DEF' : 'rev') : '-'} ${s.outcome?.result}:${s.outcome?.rule} ${s.outcome?.reason}`);
    console.log(out[out.length - 1]);
  }
}, 7200000);
