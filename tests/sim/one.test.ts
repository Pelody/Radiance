import { it } from 'vitest';
import { LUMINARIES, PROFESSIONS, SHADES } from '../../src/engine/data';
import { newGame, submit, view } from '../../src/engine/game';
import { StrategyBot } from '../helpers/strategy';
it.skipIf(!process.env.SIM)('one', () => {
  const seed = Number(process.env.SEED ?? 2);
  const lum = LUMINARIES[seed % 4];
  const prof = PROFESSIONS[(seed >> 2) % 4];
  const others = PROFESSIONS.filter((x) => x !== prof);
  const shade = SHADES[(seed >> 1) % 4];
  let g = newGame({ luminary: lum, profession: prof, hobby: others[0], permSource: others[1], shade, difficulty: 'Ember', seed });
  const bot = new StrategyBot(seed);
  for (let n = 0; n < 8000; n++) {
    const v = view(g);
    if (!v.pending) break;
    g = submit(g, bot.answer(v.pending, v.state));
  }
  const s = view(g).state;
  const re = new RegExp(process.env.GREP ?? '.');
  console.log(s.log.filter((l) => re.test(l.text) || re.test(l.rule)).map((l) => `${l.round} ${l.phase} [${l.rule}] ${l.text}`).join('\n'));
}, 600000);
