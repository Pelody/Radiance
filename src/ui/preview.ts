// 「輪到你」列的預覽數值 (DG-08 ~ DG-11)：用引擎的 calc 函式在假設狀態上計算，和實際結算同一套 (DG-18)。
import {
  apBreakdown,
  distanceBreakdown,
  engagementCount,
  epBreakdown,
  face,
  lightCost,
  questDarkness,
  travelCost,
  treacheryPV,
} from '../engine/calc';
import { freeLightAvailable } from '../engine/ops';
import { engagementSegment } from '../engine/tracks';
import type { Element } from '../engine/data';
import type { GameState } from '../engine/types';

export interface ActionSel {
  action?: string;
  attack?: string;
  booster?: string;
}

export interface ActionSetPreview {
  /** 假設打出這組卡之後的狀態 */
  state: GameState;
  cost: number;
  light: number;
  engage: number;
  /** 該區段還會翻敵人 (P3-03) */
  engageReveal: boolean;
  ap: number;
  ep: number;
  element: Element | null;
  complete: boolean;
}

/** 不含日誌的淺複製 (預覽不需要) */
function hypo(s: GameState): GameState {
  return structuredClone({ ...s, log: [] });
}

/** DG-08 Action Set 預覽 */
export function actionSetPreview(s: GameState, sel: ActionSel): ActionSetPreview {
  const h = hypo(s);
  const ids = [sel.action, sel.attack, sel.booster].filter((x): x is string => !!x);
  h.player.hand = h.player.hand.filter((x) => !ids.includes(x));
  h.player.actionSet = { ...h.player.actionSet, action: sel.action ?? null, attack: sel.attack ?? null, booster: sel.booster ?? null };
  const cost = actionSetCostPartial(s, sel);
  // EE-23 免費光：少付 1 (畫面自動使用)
  const free = freeLightAvailable({ s }) && cost > 0 ? 1 : 0;
  h.player.light = Math.max(0, s.player.light - cost + free);
  h.roundState.activeElement = sel.booster ? face(s, sel.booster).element : null;
  h.roundState.attackType = sel.attack ? face(s, sel.attack).attack_type : null;
  const seg = engagementSegment(h, h.player.light);
  return {
    state: h,
    cost,
    light: h.player.light,
    engage: engagementCount(h),
    engageReveal: seg.reveal.length > 0,
    ap: apBreakdown(h).total,
    ep: epBreakdown(h).total,
    element: h.roundState.activeElement,
    complete: ids.length === 3,
  };
}

/** P2-03 光費：和 actionSetCost 同一個 lightCost (DG-18)，可以只算已選的卡 */
function actionSetCostPartial(s: GameState, sel: ActionSel): number {
  return (
    (sel.action ? lightCost(s, sel.action, 'action') : 0) +
    (sel.attack ? lightCost(s, sel.attack, 'attack') : 0) +
    (sel.booster ? lightCost(s, sel.booster, 'booster') : 0)
  );
}

/** DG-09 Darkness 預覽 */
export function coverPreview(s: GameState, cover: number) {
  const dark = questDarkness(s).effective;
  const ep = epBreakdown(s).total;
  const progress = s.world.treacheryProgress + Math.max(0, dark - cover);
  return { ep, dark, treachery: progress, pv: treacheryPV(s), completes: s.world.activeTreachery !== null && progress >= treacheryPV(s), explore: ep - cover };
}

/** DG-10 移動預覽 */
export function travelPreview(s: GameState, dest: string, deferred: number) {
  const d = distanceBreakdown(s, dest, deferred);
  const c = travelCost(s, d.total);
  return { distance: d, cost: c, newTokens: Math.floor(s.world.location.paths / 2) + c.threatTokens };
}
