// 主畫面各區塊共用的資料。
import { createContext, useContext } from 'react';
import type { Decision, Option } from '../engine/core';
import type { GameState } from '../engine/types';
import type { ActionSel, ActionSetPreview } from './preview';

export interface UI {
  s: GameState;
  d: Decision | null;
  submit: (a: unknown) => void;
  /** P2 選卡 (DG-08 即時預覽) */
  sel: ActionSel;
  setSel: (s: ActionSel) => void;
  preview: ActionSetPreview | null;
  /** P6 正在分配 AP 的敵人 */
  assign: string | null;
  setAssign: (id: string | null) => void;
  /** 待決策中某個合法選項 */
  opt: (id: string) => Option | undefined;
  /** 待決策中任何選項 (含不合法，用來顯示原因) */
  anyOpt: (id: string) => Option | undefined;
  /** UI-11d 同一張卡有多個效果時跳出選單 */
  pickEffect: (options: Option[]) => void;
}

export const UIContext = createContext<UI | null>(null);

export function useUI(): UI {
  const u = useContext(UIContext);
  if (!u) throw new Error('UIContext missing');
  return u;
}

export function makeOptLookup(d: Decision | null) {
  const all = d?.options ?? [];
  return {
    opt: (id: string) => all.find((o) => o.id === id && o.legal !== false),
    anyOpt: (id: string) => all.find((o) => o.id === id),
  };
}

/** UI-11d 窗口中這張卡可以用的效果 (卡片發光、點了就用) */
export function cardEffects(d: Decision | null, cardId: string): Option[] {
  if (!d || d.type !== 'window') return [];
  return (d.options ?? []).filter((o) => o.legal !== false && o.id.startsWith('effect:') && o.data?.cardId === cardId);
}

/** 窗口中技能或效果的選項 (點墊子上的技能 / 卡片時使用) */
export function windowOption(d: Decision | null, pred: (o: Option) => boolean): Option | undefined {
  if (!d || d.type !== 'window') return undefined;
  return d.options?.find((o) => o.legal !== false && pred(o));
}
