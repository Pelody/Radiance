// 介面的流程控制 (純 TS，可在 Node 測試)：UI-10 遇到要選擇的才停、復原回到上一個停下的地方。
import type { Decision, Option } from '../engine/core';
import { canUndo, submit, undo, view, type Game } from '../engine/game';
import type { GameState } from '../engine/types';

export interface FlowSettings {
  /** UI-10：每個窗口都停 */
  stopAtEveryWindow: boolean;
  /** UI-11b 結算動畫速度 (預設 normal；off = 一次顯示全部) */
  animSpeed?: 'fast' | 'normal' | 'slow' | 'off';
  /** UI-11a 階段開場視窗 (預設開) */
  phaseIntro?: boolean;
}

export interface FlowMemory {
  round: number;
  /** 本回合停下時略過的效果選項 (UI-10 第 3 點) */
  passed: string[];
  /** 每個略過記錄當時的日誌長度 (與 passed 對應)；復原到那之前時忘記這次略過 (UI-10 第 5 點) */
  passedAt?: number[];
}

export const emptyMemory = (): FlowMemory => ({ round: 0, passed: [], passedAt: [] });

/** 復原後：忘記在這個狀態之後才做的略過 (舊存檔沒有 passedAt，視為 0 = 保留) */
export function rewindMemory(mem: FlowMemory, s: GameState): FlowMemory {
  const at = mem.passedAt ?? mem.passed.map(() => 0);
  const keep = mem.passed.map((_, i) => at[i] < s.log.length);
  return { round: mem.round, passed: mem.passed.filter((_, i) => keep[i]), passedAt: at.filter((_, i) => keep[i]) };
}

/** 只有好處、自動使用的效果 (UI-10：免費光 EE-23) */
const AUTO_USE_KEYS = ['Farhome/0'];

const legalOf = (d: Decision): Option[] => d.options?.filter((o) => o.legal !== false) ?? [];

export function autoUseOption(d: Decision): Option | undefined {
  if (d.type !== 'window') return undefined;
  return legalOf(d).find((o) => AUTO_USE_KEYS.includes(String(o.data?.key ?? '')));
}

/** 會讓畫面停下來的選項 (卡片、技能第一次使用、地點、敵人；付得起的成長) */
export function stoppingEffects(d: Decision): Option[] {
  return legalOf(d).filter(
    (o) =>
      ((o.id.startsWith('effect:') || o.id.startsWith('skill:')) && !AUTO_USE_KEYS.includes(String(o.data?.key ?? ''))) ||
      o.id === 'growAbility' ||
      o.id === 'growCharacter',
  );
}

/** UI-10 這個待決策要不要停下來給玩家 */
export function shouldStop(d: Decision, s: GameState, mem: FlowMemory, settings: FlowSettings): boolean {
  if (d.type !== 'window') return true;
  if (autoUseOption(d)) return false; // 先自動使用
  if (settings.stopAtEveryWindow) return true;
  const legal = legalOf(d);
  if (legal.some((o) => o.id.startsWith('assign:') || o.id.startsWith('attacker:'))) return true;
  const passed = mem.round === s.round ? mem.passed : [];
  return stoppingEffects(d).some((o) => o.data?.phaseOnly || !passed.includes(o.id));
}

/** 玩家在停下的窗口按「繼續」：記住略過的效果 */
export function rememberPass(d: Decision, s: GameState, mem: FlowMemory): FlowMemory {
  const same = mem.round === s.round;
  const passed = same ? [...mem.passed] : [];
  const passedAt = same ? [...(mem.passedAt ?? mem.passed.map(() => 0))] : [];
  for (const o of stoppingEffects(d)) {
    if (passed.includes(o.id)) continue;
    passed.push(o.id);
    passedAt.push(s.log.length);
  }
  return { round: s.round, passed, passedAt };
}

/** 自動進行到下一個要停的地方 */
export function autoAdvance(g: Game, mem: FlowMemory, settings: FlowSettings): Game {
  for (let i = 0; i < 1000; i++) {
    const v = view(g);
    if (!v.pending || shouldStop(v.pending, v.state, mem, settings)) return g;
    const auto = autoUseOption(v.pending);
    g = submit(g, auto ? { option: auto.id } : 'pass');
  }
  throw new Error('autoAdvance: 太多次');
}

/** 送出玩家的決定，然後自動進行 */
export function act(g: Game, answer: unknown, mem: FlowMemory, settings: FlowSettings): { game: Game; mem: FlowMemory } {
  const v = view(g);
  let m = mem;
  if (v.pending?.type === 'window' && (answer === 'pass' || (answer as { option?: string })?.option === 'pass')) {
    m = rememberPass(v.pending, v.state, mem);
  }
  const next = submit(g, answer);
  return { game: autoAdvance(next, m, settings), mem: m };
}

/** UI-02 復原：跳過自動繼續的窗口，回到上一個停下來的地方；同時忘記之後的略過 (UI-10 第 5 點) */
export function undoToStop(g: Game, mem: FlowMemory, settings: FlowSettings): { game: Game; mem: FlowMemory } {
  if (!canUndo(g)) return { game: g, mem };
  let h = undo(g);
  while (canUndo(h)) {
    const v = view(h);
    if (!v.pending || shouldStop(v.pending, v.state, rewindMemory(mem, v.state), settings)) break;
    h = undo(h);
  }
  return { game: h, mem: rewindMemory(mem, view(h).state) };
}
