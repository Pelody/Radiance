// 驗收 (階段 3)：用官方範例開局，透過介面的流程層 (UI-10 自動繼續) 玩完第 1 回合。
// 與 tests/e2e/round1.cjs (瀏覽器) 使用相同的玩家決定。
import { describe, expect, it } from 'vitest';
import { cardName } from '../src/engine/data';
import { newGame, view, type Game } from '../src/engine/game';
import { act, autoAdvance, emptyMemory, type FlowMemory, type FlowSettings } from '../src/ui/flow';
import { exampleSetup } from '../src/ui/NewGame';

const settings: FlowSettings = { stopAtEveryWindow: false };

describe('介面流程：官方範例第 1 回合', () => {
  it('從開局玩到第 2 回合 Greed 進場', () => {
    let mem: FlowMemory = emptyMemory();
    let g: Game = autoAdvance(newGame(exampleSetup()), mem, settings);
    const s = () => view(g).state;
    const d = () => view(g).pending!;
    const id = (name: string) => {
      const st = s();
      const all = [...st.player.hand, ...st.world.questArea, ...st.world.playerArea, ...Object.values(st.player.actionSet)];
      return all.find((x) => x && cardName(x) === name)!;
    };
    const go = (a: unknown) => ({ game: g, mem } = act(g, a, mem, settings));
    const opt = (pred: (label: string) => boolean) => d().options!.find((o) => o.legal !== false && pred(o.label))!.id;

    go(id('Foresight')); // SU-05
    go({ action: id('Ember Strike'), attack: id('Useful Rage'), booster: id('Hasten') });
    expect(s().player.light).toBe(17); // 免費光自動使用
    go({ option: 'skill:Shout' });
    go('pass');
    expect(d().rule).toBe('P4-02');
    go(2);
    for (const c of ['save', 'save', 'save', 'defer', 'travel']) go(c);
    go({ option: opt((l) => l.startsWith('Ember Strike')) });
    go('2');
    go({ option: `assign:${id('Terragard Watchman')}`, amount: 4 });
    go({ option: `assign:${id('Moltan Spellcaster')}`, amount: 6 });
    go(id('Sol Conspirator'));
    go({ option: `assign:${id('Sol Conspirator')}`, amount: 4 });
    go(id('Moltan Spy'));
    // UI-10 第 4 點：擊敗敵人後 XP 夠成長，流程會在 Attack 窗口停下
    expect(d().options!.some((o) => o.id === 'growAbility' && o.legal !== false)).toBe(true);
    go('pass');
    go({ option: `attacker:${id('Moltan Spy')}` });
    go(`hand:${id('Equal Measure')}`);
    go('done');
    go('done'); // 不休息
    go(['Foresight', 'Hasten', 'Ember Strike'].map(id));
    go('done');
    // UI-10 第 4 點：第 2 回合開始時 XP 6 夠成長，流程在 Staging 窗口停下；放棄後本回合不再因成長停下
    expect(s().phase).toBe('staging');
    go('pass');
    const st = s();
    expect(st.round).toBe(2);
    expect(st.phase).toBe('actionSet');
    expect(st.player.wounds).toBe(4);
    expect(st.player.xp).toBe(6);
    expect(st.player.light).toBe(20);
    expect(st.world.shadeRevealed).toBe(true);
    expect(st.world.questArea.map(cardName)[0]).toBe('Greed');
    expect(cardName(st.world.location.id)).toBe('Sol');
  });
});
