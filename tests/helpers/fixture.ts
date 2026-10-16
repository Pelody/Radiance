// 測試用：建立固定開局的遊戲，並在某個階段開始時改寫狀態。
import { cardName, findByName, type Element } from '../../src/engine/data';
import { newGame, submit, view, type Game } from '../../src/engine/game';
import type { Decision } from '../../src/engine/core';
import type { GameState, Phase } from '../../src/engine/types';
import type { SetupOptions } from '../../src/engine/setup';
import scenario from '../scenario_example_turn.json';
import { validateActionSet } from '../../src/engine/phases';

const S = scenario.setup;

export function scenarioOptions(extra: Partial<SetupOptions> = {}): SetupOptions {
  return {
    luminary: S.luminary,
    profession: S.profession,
    hobby: S.hobby_profession,
    permSource: S.perm_booster_source_profession,
    shade: S.shade,
    difficulty: 'Blaze',
    seed: 1,
    config: { ignoreShadeSetup: true, ignoreShadeSpecial: true },
    fixed: {
      skills: S.skills.map((k) => ({ name: k.name, element: k.element as Element, unlocked: k.unlocked })),
      deck: S.deck_top_to_bottom,
      duskDeck: S.dusk_deck_top_to_bottom,
      doomDeck: S.doom_deck_top_to_bottom,
      activeTreachery: S.active_treachery,
      locationDeck: S.location_deck_top_to_bottom,
    },
    ...extra,
  };
}

export const st = (g: Game) => view(g).state;
export const pending = (g: Game) => view(g).pending;

/** 開局 (探索卡選 Foresight)，停在第 1 回合 Staging 的第一個決策 */
export function startScenario(extra: Partial<SetupOptions> = {}): Game {
  let g = newGame(scenarioOptions(extra));
  const d = pending(g)!;
  g = submit(g, d.options!.find((o) => o.label === S.draw_7_then_choose_explore)!.id);
  return g;
}

export function passUntil(g: Game, pred: (d: Decision, s: GameState) => boolean, max = 200): Game {
  for (let i = 0; i < max; i++) {
    const d = pending(g);
    if (!d || pred(d, st(g))) return g;
    if (d.type !== 'window') throw new Error(`遇到非窗口的決策：${d.rule} ${d.prompt}`);
    g = submit(g, 'pass');
  }
  throw new Error('passUntil: 太多次');
}

export const inPhase = (p: Phase) => (_d: Decision, s: GameState) => s.phase === p;

/** 以某個狀態為「階段開始」建立新遊戲 (state.phase 那個階段從頭執行) */
export function gameFrom(state: GameState): Game {
  return { session: { checkpoint: structuredClone(state), answers: [] }, undo: [] };
}

/** 預設回答：窗口「繼續」(不能繼續時選第一個合法選項)，其他決策選第一個合法的 */
export function defaultAnswer(d: Decision, s: GameState): unknown {
  const legal = d.options?.filter((o) => o.legal !== false) ?? [];
  switch (d.type) {
    case 'window': {
      if (legal.some((o) => o.id === 'pass')) return 'pass';
      const o = legal[0];
      return o.id.startsWith('assign:') ? { option: o.id, amount: o.data!.max } : { option: o.id };
    }
    case 'choose':
      return legal[0].id;
    case 'number':
      return d.min; // P4-02 cover 0：EP 全部用於探索
    case 'cards':
      return [];
    case 'order':
      return d.cards;
    case 'actionSet': {
      const pref = { action: 'Ember Strike', attack: 'Useful Rage', booster: 'Hasten' };
      const h = d.cards!;
      const byName = (n: string) => h.find((id) => cardName(id) === n);
      if (byName(pref.action) && byName(pref.attack) && byName(pref.booster))
        return { action: byName(pref.action), attack: byName(pref.attack), booster: byName(pref.booster) };
      for (const a of h) for (const b of h) for (const c of h)
        if (a !== b && b !== c && a !== c && !validateActionSet({ s }, { action: a, attack: b, booster: c })) return { action: a, attack: b, booster: c };
      throw new Error('no affordable action set');
    }
  }
}

/** 用預設回答一路進行到條件成立 */
export function advance(g: Game, pred: (d: Decision, s: GameState) => boolean, max = 500): Game {
  for (let i = 0; i < max; i++) {
    const d = pending(g);
    if (!d || pred(d, st(g))) return g;
    g = submit(g, defaultAnswer(d, st(g)));
  }
  throw new Error('advance: 太多次');
}

/** 取得第 1 回合某階段開始時的狀態，改寫後從那裡開始 */
export function at(phase: Phase, mutate: (s: GameState) => void = () => {}, base?: Game): Game {
  let g = base ?? startScenario();
  if (phase !== 'staging' || st(g).round !== 1) g = advance(g, inPhase(phase));
  const s = structuredClone(g.session.checkpoint);
  if (s.phase !== phase) throw new Error(`checkpoint 不在 ${phase}`);
  mutate(s);
  return gameFrom(s);
}

export function idOf(s: GameState, name: string): string {
  const pools = [
    s.player.hand,
    s.player.deck,
    s.player.discard,
    Object.values(s.player.actionSet).filter((x): x is string => !!x),
    s.world.questArea,
    s.world.playerArea,
    s.world.locationDeck,
    s.player.beacons,
  ];
  for (const pool of pools) {
    const id = pool.find((x) => cardName(x) === name);
    if (id) return id;
  }
  throw new Error(`找不到 ${name}`);
}

export function logHas(g: Game, text: string): boolean {
  return st(g).log.some((l) => l.text.includes(text));
}

export const loc = (name: string) => findByName('location', name).id;
export const enemy = (name: string) => findByName('enemy', name).id;
