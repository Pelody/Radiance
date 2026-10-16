import { it } from 'vitest';
import { LUMINARIES, PROFESSIONS, SHADES } from '../../src/engine/data';
import { newGame, submit, view } from '../../src/engine/game';
import { StrategyBot } from '../helpers/strategy';
import { threatBreakdown, locationEV, luminaryHP } from '../../src/engine/calc';
import { locationCard } from '../../src/engine/data';
it.skipIf(!process.env.SIM)('rounds', () => {
  const seed = Number(process.env.SEED ?? 24);
  const lum = LUMINARIES[seed % 4];
  const prof = PROFESSIONS[(seed >> 2) % 4];
  const others = PROFESSIONS.filter((x) => x !== prof);
  const shade = SHADES[(seed >> 1) % 4];
  let g = newGame({ luminary: lum, profession: prof, hobby: others[0], permSource: others[1], shade, difficulty: 'Ember', seed });
  const bot = new StrategyBot(seed);
  let last = -1;
  const out: string[] = [`${lum}/${prof}/${shade}`];
  for (let n = 0; n < 8000; n++) {
    const v = view(g);
    const s = v.state;
    if (s.round !== last && s.phase === 'staging') {
      last = s.round;
      out.push(`R${s.round} wounds ${s.player.wounds}/${luminaryHP(s)} light ${s.player.light} xp ${s.player.xp} hand ${s.player.hand.length} deck ${s.player.deck.length} threat ${threatBreakdown(s).total} (track ${s.world.threat}) res ${s.world.resistance} corr ${s.world.corruption} tr ${s.world.treacheryProgress}/${s.world.completedTreacheries.length} loc ${locationCard(s.world.location.id).name} ${s.world.location.progress}/${locationEV(s)} quest ${s.world.questArea.length} player ${s.world.playerArea.length} beacons ${s.player.beacons.length}`);
    }
    if (!v.pending) break;
    g = submit(g, bot.answer(v.pending, v.state));
  }
  const s = view(g).state;
  out.push(`end ${s.outcome?.reason}`);
  console.log(out.join('\n'));
}, 600000);
