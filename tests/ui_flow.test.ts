// UI-10 遇到要選擇的才停；UI-02 復原回到上一個停下的地方。
import { describe, expect, it } from 'vitest';
import { act, autoAdvance, emptyMemory, undoToStop, type FlowSettings } from '../src/ui/flow';
import { resolutionToShow } from '../src/ui/store';
import { view } from '../src/engine/game';
import { idOf, st, startScenario } from './helpers/fixture';

const settings: FlowSettings = { stopAtEveryWindow: false };

describe('UI-10 自動繼續', () => {
  it('開局後直接停在 Action Set 選卡 (Staging 的窗口只有橫置以啟動，不停)', () => {
    const g = autoAdvance(startScenario(), emptyMemory(), settings);
    expect(view(g).pending!.type).toBe('actionSet');
  });

  it('免費光自動使用；有可用的行動卡效果時停一次，略過後同回合不再停', () => {
    let g = autoAdvance(startScenario(), emptyMemory(), settings);
    const s = st(g);
    let mem = emptyMemory();
    ({ game: g, mem } = act(g, { action: idOf(s, 'Ember Strike'), attack: idOf(s, 'Useful Rage'), booster: idOf(s, 'Hasten') }, mem, settings));
    // Farhome 免費光自動使用 → 光 17
    expect(st(g).player.light).toBe(17);
    // 停在 Action Set 窗口：Ember Strike 與 Shout 可用
    let d = view(g).pending!;
    expect(d.type).toBe('window');
    expect(d.options!.some((o) => o.id.includes('Ember Strike/0'))).toBe(true);
    ({ game: g, mem } = act(g, 'pass', mem, settings));
    // 同回合不再為同樣的效果停：下一次停在 Darkness 的 EP 分配
    d = view(g).pending!;
    expect(d.rule).toBe('P4-02');
  });

  it('「每個窗口都停」開關', () => {
    const g = autoAdvance(startScenario(), emptyMemory(), { stopAtEveryWindow: true });
    expect(view(g).pending!.type).toBe('window');
  });

  it('復原跳過自動繼續的窗口', () => {
    let g = autoAdvance(startScenario(), emptyMemory(), settings);
    const s = st(g);
    let mem = emptyMemory();
    const before = st(g);
    ({ game: g, mem } = act(g, { action: idOf(s, 'Ember Strike'), attack: idOf(s, 'Useful Rage'), booster: idOf(s, 'Hasten') }, mem, settings));
    const back = undoToStop(g, mem, settings).game;
    expect(view(back).pending!.type).toBe('actionSet');
    expect(st(back)).toEqual(before);
  });

  it('UI-10 第 5 點：復原回到略過的窗口時，忘記那次略過', () => {
    let g = autoAdvance(startScenario(), emptyMemory(), settings);
    const s = st(g);
    let mem = emptyMemory();
    ({ game: g, mem } = act(g, { action: idOf(s, 'Ember Strike'), attack: idOf(s, 'Useful Rage'), booster: idOf(s, 'Hasten') }, mem, settings));
    const w = view(g).pending!;
    expect(w.type).toBe('window');
    const logAtWindow = st(g).log.length;
    ({ game: g, mem } = act(g, 'pass', mem, settings));
    expect(mem.passed.length).toBeGreaterThan(0);
    const r = undoToStop(g, mem, settings);
    expect(st(r.game).log.length).toBe(logAtWindow);
    expect(view(r.game).pending!.prompt).toBe(w.prompt);
    expect(r.mem.passed).toEqual([]);
  });
});

describe('UI-11b 結算視窗', () => {
  const e = (phase: string, text: string, rule = 'X') => ({ round: 1, phase: phase as never, rule, text });
  it('跨過階段才跳視窗；同一階段的小動作不跳', () => {
    expect(resolutionToShow([e('attack', '5 AP → A')], { round: 1, phase: 'attack' }, { round: 1, phase: 'attack' })).toBeNull();
    expect(resolutionToShow([e('attack', '擊敗 A')], { round: 1, phase: 'attack' }, { round: 1, phase: 'attack' })).not.toBeNull();
    expect(resolutionToShow([e('darkness', 'x')], { round: 1, phase: 'darkness' }, { round: 1, phase: 'explore' })).not.toBeNull();
    expect(resolutionToShow([], { round: 1, phase: 'darkness' }, { round: 2, phase: 'staging' })).toBeNull();
  });
});
