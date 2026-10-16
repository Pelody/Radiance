// 卡片效果測試用：取得某階段開始的狀態，直接執行效果積木並自動回答決策。
import { Ctx, GameOver, type Decision, type Gen } from '../../src/engine/core';
import { CARDS, cardName, findCards, LUMINARIES, PROFESSIONS } from '../../src/engine/data';
import { activeEffects, defsForSkill, type Source } from '../../src/engine/effects';
import { newGame } from '../../src/engine/game';
import { emit, runEffect } from '../../src/engine/ops';
import type { GameState, Phase } from '../../src/engine/types';
import { newLocation } from '../../src/engine/world';
import { boundaryWindow } from '../../src/engine/window';
import { advance, defaultAnswer, startScenario } from './fixture';

export type AnswerFn = unknown | ((d: Decision, s: GameState) => unknown);

/** 第 1 回合某階段開始時的狀態。luminary/profession 不給時用範例開局 (Justice + Wayfarer) */
export function stateAt(phase: Phase, o: { luminary?: string; profession?: string; shade?: string; seed?: number } = {}): GameState {
  let g;
  if (!o.luminary) g = startScenario(o.shade ? { shade: o.shade } : {});
  else {
    const lum = o.luminary;
    const prof = o.profession ?? 'Wayfarer';
    const others = PROFESSIONS.filter((p) => p !== prof);
    g = newGame({
      luminary: lum,
      profession: prof,
      hobby: others[0],
      permSource: others[1],
      shade: o.shade ?? 'Greed',
      seed: o.seed ?? 3,
      config: { ignoreShadeSetup: true, ignoreShadeSpecial: true },
    });
  }
  g = advance(g, (_d, s) => s.round >= 1 && s.phase === phase);
  const s = structuredClone(g.session.checkpoint);
  if (s.phase !== phase) throw new Error(`checkpoint 不在 ${phase}`);
  // 測試從乾淨的狀態開始
  s.player.wounds = 0;
  s.roundState.resolvedPhaseEffects = [];
  s.roundState.usage = {};
  return s;
}

void LUMINARIES;

const enemyIds = (name: string) => findCards((c) => c.type === 'enemy' && c.name === name).map((c) => c.id);

/** 把敵人放到某區 (從牌庫拿出來) */
export function addEnemy(s: GameState, name: string, zone: 'quest' | 'player' = 'player', front = true): string {
  const id = enemyIds(name).find((x) => !s.world.enemies[x]);
  if (!id) throw new Error(`沒有可用的 ${name}`);
  const w = s.world;
  for (const k of ['duskDeck', 'doomDeck', 'duskDiscard', 'doomDiscard'] as const) w[k] = w[k].filter((x) => x !== id);
  w.enemies[id] = { id, wounds: 0, progress: 0, attachments: [] };
  const area = zone === 'quest' ? w.questArea : w.playerArea;
  if (front) area.push(id);
  else area.unshift(id);
  return id;
}

export function clearEnemies(s: GameState): void {
  s.world.questArea = [];
  s.world.playerArea = [];
  s.world.enemies = {};
}

export function locId(name: string): string {
  const c = CARDS.find((x) => x.type === 'location' && x.name === name);
  if (!c) throw new Error(`沒有地點 ${name}`);
  return c.id;
}

export function setLocation(s: GameState, name: string): string {
  const id = locId(name);
  s.world.locationDeck = s.world.locationDeck.filter((x) => x !== id);
  s.world.locationDiscard = s.world.locationDiscard.filter((x) => x !== id);
  s.world.location = newLocation(id);
  s.world.removedLocations = s.world.removedLocations.filter((x) => x !== id);
  return id;
}

export function treacheryId(name: string): string {
  return CARDS.find((x) => x.type === 'treachery' && x.name === name)!.id;
}

/** 找玩家卡 id (手牌、牌庫、棄牌堆、行動組、嗜好牌庫) */
export function playerCardId(s: GameState, name: string, used: string[] = []): string {
  const p = s.player;
  const pools = [p.hand, p.deck, p.discard, Object.values(p.actionSet).filter((x): x is string => !!x), p.hobbyMarket, p.hobbyDeck, p.permBoosterSource];
  for (const pool of pools) {
    const id = pool.find((x) => cardName(x) === name && !used.includes(x));
    if (id) return id;
  }
  // 不在這個角色的牌組：直接拿 (測試用)
  const c = CARDS.find((x) => x.type === 'player_card' && x.name === name && (x as { side?: string }).side !== 'advanced' && !used.includes(x.id));
  if (!c) throw new Error(`找不到玩家卡 ${name}`);
  return c.id;
}

function pullOut(s: GameState, id: string): void {
  const p = s.player;
  p.hand = p.hand.filter((x) => x !== id);
  p.deck = p.deck.filter((x) => x !== id);
  p.discard = p.discard.filter((x) => x !== id);
  p.hobbyMarket = p.hobbyMarket.filter((x) => x !== id);
  p.hobbyDeck = p.hobbyDeck.filter((x) => x !== id);
  p.permBoosterSource = p.permBoosterSource.filter((x) => x !== id);
  for (const k of ['action', 'attack', 'booster', 'explore'] as const) if (p.actionSet[k] === id) p.actionSet[k] = null;
}

/** 把卡放到行動組的某格 (upgraded = 進階面) */
export function setSlot(s: GameState, slot: 'action' | 'attack' | 'booster' | 'explore', name: string, upgraded = false): string {
  const id = playerCardId(s, name);
  pullOut(s, id);
  s.player.actionSet[slot] = id;
  if (upgraded && !s.player.upgraded.includes(id)) s.player.upgraded.push(id);
  if (slot === 'booster') s.roundState.activeElement = (CARDS.find((c) => c.id === id) as { element: never }).element;
  return id;
}

export function toHand(s: GameState, name: string, upgraded = false): string {
  const id = playerCardId(s, name, s.player.hand);
  pullOut(s, id);
  s.player.hand.push(id);
  if (upgraded && !s.player.upgraded.includes(id)) s.player.upgraded.push(id);
  return id;
}

export interface RunResult {
  s: GameState;
  decisions: Decision[];
  logs: string[];
  over?: GameOver;
}

/** 執行一段效果程式，依序使用 answers 回答決策；用完就用預設回答 */
export function run(s0: GameState, f: (ctx: Ctx) => Gen<unknown>, answers: AnswerFn[] = []): RunResult {
  const s = structuredClone(s0);
  const before = s.log.length;
  const ctx = new Ctx(s);
  const gen = f(ctx);
  const decisions: Decision[] = [];
  const q = answers.slice();
  let over: GameOver | undefined;
  try {
    let r = gen.next();
    let guard = 0;
    while (!r.done) {
      if (++guard > 500) throw new Error('run: 太多決策');
      const d = r.value;
      decisions.push(d);
      let a: unknown = q.length ? q.shift() : defaultAnswer(d, s);
      if (typeof a === 'function') a = (a as (d: Decision, s: GameState) => unknown)(d, s);
      const err = d.validate?.(a);
      if (err) throw new Error(`不合法的回答 ${JSON.stringify(a)}：${err} (${d.prompt})`);
      r = gen.next(a);
    }
  } catch (e) {
    if (e instanceof GameOver) over = e;
    else throw e;
  }
  return { s, decisions, logs: s.log.slice(before).map((l) => l.text), over };
}

/** 使用目前有效的主動效果 (卡片 / 地點 / 敵人)：key 例 'Ember Strike/0'、'Valiance+/1' */
export function useEffect(s: GameState, key: string, answers: AnswerFn[] = []): RunResult {
  const sd = activeEffects(s).find((x) => x.def.key === key && x.def.active);
  if (!sd) throw new Error(`沒有有效的主動效果 ${key}`);
  return run(s, (ctx) => runEffect(ctx, sd.src, sd.def, () => sd.def.active!.run(ctx, sd.src)), answers);
}

/** 使用技能 (測試時直接解鎖並以橫置啟動) */
export function useSkill(s0: GameState, name: string, answers: AnswerFn[] = []): RunResult {
  const s = structuredClone(s0);
  const sk = s.player.skills.find((k) => k.name === name);
  if (!sk) throw new Error(`沒有技能 ${name}`);
  sk.unlocked = true;
  sk.activatedByExhaust = true;
  const def = defsForSkill(name).find((d) => d.active);
  if (!def) throw new Error(`${name} 沒有主動效果`);
  const src: Source = { id: `skill:${name}`, kind: 'skill', name };
  return run(s, (ctx) => runEffect(ctx, src, def, () => def.active!.run(ctx, src)), answers);
}

/** 讓技能可用 (解鎖 + 方塊元素 = 加成卡元素) */
export function enableSkill(s: GameState, name: string): void {
  const sk = s.player.skills.find((k) => k.name === name);
  if (!sk) throw new Error(`沒有技能 ${name}`);
  sk.unlocked = true;
  sk.exhausted = false;
  sk.activatedByExhaust = true;
}

export function fire(s: GameState, ev: { t: string; [k: string]: unknown }, answers: AnswerFn[] = []): RunResult {
  return run(s, (ctx) => emit(ctx, ev), answers);
}

export function boundary(s: GameState, phase: Phase, which: 'start' | 'end', answers: AnswerFn[] = []): RunResult {
  return run(
    s,
    function* (ctx) {
      ctx.s.phase = phase;
      yield* boundaryWindow(ctx, phase, which);
    },
    answers,
  );
}

/** 用某個 id 開頭的選項回答 */
export const pick = (prefix: string) => (d: Decision) => {
  const o = d.options?.find((x) => x.id === prefix || x.id.startsWith(prefix) || x.label.includes(prefix));
  if (!o) throw new Error(`沒有選項 ${prefix}：${d.options?.map((x) => x.id + ' ' + x.label).join(' | ')}`);
  return d.type === 'window' ? { option: o.id } : o.id;
};
