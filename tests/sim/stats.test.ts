// 模擬統計 (手動執行：npx vitest run tests/sim)。不在一般測試中執行。
import { it } from 'vitest';
import { LUMINARIES, PROFESSIONS, SHADES } from '../../src/engine/data';
import { newGame, submit, view } from '../../src/engine/game';
import { StrategyBot } from '../helpers/strategy';
it.skipIf(!process.env.SIM)('stats', () => {
  const rows: string[] = [];
  for (let seed = 1; seed <= Number(process.env.N ?? 40); seed++) {
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
    rows.push(`${seed} ${lum}/${prof}/${shade} r${s.round} explored ${s.world.exploredCount} final ${s.world.finalLocation ? 'Y' : '-'} shade ${s.world.shadeRevealed ? (s.world.shadeDefeated ? 'DEF' : 'rev') : '-'} corr ${s.world.corruption} tr ${s.world.completedTreacheries.length} xp ${s.player.xp} grow ${s.player.abilityGrowthPos}/${s.player.characterGrowthPos} ${s.outcome?.result}:${s.outcome?.rule}`);
  }
  console.log(rows.join('\n'));
}, 600000);
