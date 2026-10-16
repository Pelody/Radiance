import { it } from 'vitest';
import { LUMINARIES, PROFESSIONS, SHADES } from '../../src/engine/data';
import { newGame, submit, view } from '../../src/engine/game';
import { StrategyBot } from '../helpers/strategy';
it.skipIf(!process.env.SIM)('sources', () => {
  const wounds: Record<string, number> = {};
  const tre: Record<string, number> = {};
  let rounds = 0;
  const N = Number(process.env.N ?? 60);
  for (let seed = 1; seed <= N; seed++) {
    const lum = LUMINARIES[seed % 4];
    const prof = PROFESSIONS[(seed >> 2) % 4];
    const others = PROFESSIONS.filter((x) => x !== prof);
    let g = newGame({ luminary: lum, profession: prof, hobby: others[0], permSource: others[1], shade: SHADES[(seed >> 1) % 4], difficulty: 'Ember', seed });
    const bot = new StrategyBot(seed);
    for (let n = 0; n < 8000; n++) {
      const v = view(g);
      if (!v.pending) break;
      g = submit(g, bot.answer(v.pending, v.state));
    }
    const s = view(g).state;
    rounds += s.round;
    for (const l of s.log) {
      let m = /受到 (\d+) 傷害 \((.*)\)/.exec(l.text);
      if (m) {
        const k = m[2].replace(/ 的攻擊$/, ' (攻擊)').replace(/^(.*) \(攻擊\)$/, '敵人攻擊');
        wounds[k] = (wounds[k] ?? 0) + Number(m[1]);
      }
      m = /Treachery Progress \+(\d+) \((.*)\)/.exec(l.text);
      if (m) tre[m[2]] = (tre[m[2]] ?? 0) + Number(m[1]);
    }
  }
  const top = (o: Record<string, number>) => Object.entries(o).sort((a, b) => b[1] - a[1]).slice(0, 25).map(([k, v]) => `${(v / N).toFixed(2)} ${k}`).join('\n');
  console.log(`avg rounds ${(rounds / N).toFixed(1)}\n-- wounds per game\n${top(wounds)}\n-- treachery per game\n${top(tre)}`);
}, 1800000);
