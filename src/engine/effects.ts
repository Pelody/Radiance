// 效果定義與來源 (EE-01 ~ EE-07)。
// 卡片效果寫成程式並用效果積木組合，不解析卡片文字 (EE-23)；以卡名 (+ 進階面) 對應。
import type { Ctx, GameEvent, Gen } from './core';
import type { AttackType } from './data';
import { getCard, playerCard } from './data';
import type { GameState, Phase, SkillState } from './types';

export type EffectType =
  | '1x'
  | 'Passive'
  | 'Unrestricted'
  | 'Mandatory1x'
  | 'MandatoryUnrestricted'
  | 'Eager1x'
  | 'EagerUnrestricted'
  | 'EagerPassive'
  | 'EagerMandatory1x'
  | 'EagerMandatoryUnrestricted';

export type SourceKind = 'card' | 'skill' | 'enemy' | 'location' | 'legacy' | 'shade' | 'lingering';

/** EE-07 效果的來源 (只有來源處於有效狀態時，效果才存在) */
export interface Source {
  id: string;
  kind: SourceKind;
  name: string;
  cardId?: string;
  /** 敵人所在區域 (KC-12d) */
  zone?: 'quest' | 'player';
  params?: Record<string, unknown>;
}

/** EE-01 衍生數值查詢 */
export interface StatQuery {
  stat:
    | 'enemyAttack'
    | 'enemyDefense'
    | 'enemyDarkness'
    | 'enemyHP'
    | 'ignoreDarkness'
    | 'lightCost'
    | 'mainAttack'
    | 'attackBoost'
    | 'mainExplore'
    | 'exploreBoost'
    | 'engagement'
    | 'distance'
    | 'threat'
    | 'locationEV'
    | 'cardDefense'
    | 'fetchCost'
    | 'freeLight';
  enemy?: string;
  card?: string;
  slot?: string;
  attackType?: AttackType;
  location?: string;
  /** 目前結算的階段 (例：Flaming Headwaters「During the Defend Phase」) */
  phase?: Phase;
}

/** EE-02 規則限制查詢：回傳不允許的原因 */
export type Restriction =
  | { kind: 'travelTo'; location: string }
  | { kind: 'attack'; enemy: string }
  | { kind: 'fetchCost' };

type Run = (ctx: Ctx, src: Source) => Gen;
type TriggerRun = (ctx: Ctx, src: Source, ev: GameEvent) => Gen;

export interface EffectDef {
  key: string;
  label: string;
  rule?: string;
  type?: EffectType;
  /** KC-12d：只在敵人位於該區時生效 */
  zone?: 'quest' | 'player';
  /** 'Once per round' 等次數上限 (EE-20、EE-21)；1x 類自動為 1 */
  perRound?: number;
  /** EE-05 主動效果 */
  active?: {
    phases?: Phase[];
    available?: (s: GameState, src: Source) => string | null;
    run: Run;
  };
  /** EE-04 觸發效果 */
  trigger?: {
    event: string;
    timing: 'when' | 'after';
    mandatory: boolean;
    filter?: (s: GameState, src: Source, ev: GameEvent) => boolean;
    run: TriggerRun;
  };
  /** KC-12a Start of / End of */
  phaseStart?: { phase: Phase; mandatory: boolean; run: Run };
  phaseEnd?: { phase: Phase; mandatory: boolean; run: Run };
  /** EE-18a 非玩家的「X Phase: …」強制效果：一般窗口可選時點，結束窗口必定結算 */
  phaseDuring?: { phase: Phase; run: Run };
  /** 卡片自身的 When Revealed / When Defeated / Upon Arrival / When Completed */
  whenRevealed?: Run;
  whenDefeated?: Run;
  uponArrival?: Run;
  whenCompleted?: Run;
  /** EE-01 */
  modify?: (s: GameState, src: Source, q: StatQuery, v: number) => number;
  /** EE-02 */
  restrict?: (s: GameState, src: Source, r: Restriction) => string | null;
}

// ---------------------------------------------------------------- 註冊表

const cardDefs = new Map<string, EffectDef[]>();
const skillDefs = new Map<string, EffectDef[]>();
const lingeringDefs = new Map<string, EffectDef>();
const shadeDefs = new Map<string, EffectDef[]>();

/** 卡名 → 效果；進階面用 `名稱+` */
export function defineCard(name: string, defs: EffectDef[]): void {
  cardDefs.set(name, defs);
}
export function defineSkill(name: string, defs: EffectDef[]): void {
  skillDefs.set(name, defs);
}
export function defineLingering(def: EffectDef): void {
  lingeringDefs.set(def.key, def);
}
export function defineShade(name: string, defs: EffectDef[]): void {
  shadeDefs.set(name, defs);
}

export function isPlayerUpgraded(s: GameState, id: string): boolean {
  return s.player.upgraded.includes(id);
}

export function defsForCard(s: GameState, id: string): EffectDef[] {
  const c = getCard(id);
  if (c.type === 'player_card') {
    const upgraded = isPlayerUpgraded(s, id);
    return cardDefs.get(upgraded ? `${c.name}+` : (c.name as string)) ?? [];
  }
  return cardDefs.get(c.name as string) ?? [];
}

export function defsForSkill(name: string): EffectDef[] {
  return skillDefs.get(name) ?? [];
}
export function lingeringDef(key: string): EffectDef {
  const d = lingeringDefs.get(key);
  if (!d) throw new Error(`unknown lingering effect ${key}`);
  return d;
}
export function defsForShade(name: string): EffectDef[] {
  return shadeDefs.get(name) ?? [];
}

export function hasRegisteredEffects(name: string): boolean {
  return cardDefs.has(name) || skillDefs.has(name);
}

// ---------------------------------------------------------------- 來源 (EE-07)

export const isEager = (d: EffectDef) => !!d.type && d.type.startsWith('Eager');
export const isMandatory = (d: EffectDef) => !!d.type && (d.type.includes('Mandatory') || d.type === 'EagerPassive');
export const isOncePerRound = (d: EffectDef) => !!d.type && d.type.endsWith('1x');

/** KC-18 技能是否啟動中 */
export function skillActive(s: GameState, sk: SkillState): boolean {
  return sk.cubeElement === s.roundState.activeElement || sk.activatedByExhaust;
}

/** KC-18 技能目前可以使用 (已解鎖 + Ready + 啟動中；橫置以啟動例外) */
export function skillUsable(s: GameState, sk: SkillState): boolean {
  if (!sk.unlocked) return false;
  if (sk.activatedByExhaust) return true;
  return !sk.exhausted && sk.cubeElement === s.roundState.activeElement;
}

export interface SourcedDef {
  src: Source;
  def: EffectDef;
}

/** 目前有效的所有 (來源, 效果)。純函式，預覽與結算共用 (DG-18)。 */
export function activeEffects(s: GameState): SourcedDef[] {
  const out: SourcedDef[] = [];
  const p = s.player;
  const w = s.world;

  // KC-11 行動卡；Eager 效果可以來自行動組其他卡槽 (EE-07)
  const slots = ['action', 'attack', 'booster', 'explore'] as const;
  for (const slot of slots) {
    const id = p.actionSet[slot];
    if (!id) continue;
    const src: Source = { id: `card:${id}`, kind: 'card', name: playerCard(id).name, cardId: id, params: { slot } };
    for (const def of defsForCard(s, id)) {
      if (slot === 'action' || isEager(def)) out.push({ src, def });
    }
  }
  // 附著在敵人身上的卡：只有 Eager 效果 (KC-10、KC-17)
  for (const eid of [...w.questArea, ...w.playerArea]) {
    for (const aid of w.enemies[eid]?.attachments ?? []) {
      const src: Source = { id: `card:${aid}`, kind: 'card', name: playerCard(aid).name, cardId: aid, params: { attachedTo: eid } };
      for (const def of defsForCard(s, aid)) if (isEager(def)) out.push({ src, def });
    }
  }

  // 技能 (KC-18)；Eager 技能可無視啟動條件
  for (const sk of p.skills) {
    const src: Source = { id: `skill:${sk.name}`, kind: 'skill', name: sk.name };
    for (const def of defsForSkill(sk.name)) {
      if (skillUsable(s, sk) || (isEager(def) && def.type !== undefined)) out.push({ src, def });
    }
  }

  // 敵人 (KC-12d)
  const enemyZones: [string[], 'quest' | 'player'][] = [
    [w.questArea, 'quest'],
    [w.playerArea, 'player'],
  ];
  for (const [area, zone] of enemyZones) {
    for (const eid of area) {
      const src: Source = { id: `enemy:${eid}`, kind: 'enemy', name: getCard(eid).name as string, cardId: eid, zone };
      for (const def of defsForCard(s, eid)) {
        if (!def.zone || def.zone === zone) out.push({ src, def });
      }
    }
  }

  // 目前地點 (最終地點橫置後仍有效，FL-04)
  {
    const lid = w.location.id;
    const src: Source = { id: `location:${lid}`, kind: 'location', name: getCard(lid).name as string, cardId: lid };
    for (const def of defsForCard(s, lid)) out.push({ src, def });
  }

  // Treachery legacy：完成後整局生效 (KC-12e)
  for (const tid of w.completedTreacheries) {
    const src: Source = { id: `legacy:${tid}`, kind: 'legacy', name: getCard(tid).name as string, cardId: tid };
    for (const def of defsForCard(s, tid)) if (!def.whenCompleted) out.push({ src, def });
  }

  // Shade 卡背面的特殊規則 (SH-01)
  if (!s.config.ignoreShadeSpecial && !w.shadeDefeated) {
    const src: Source = { id: `shade:${w.shade}`, kind: 'shade', name: w.shade };
    for (const def of defsForShade(w.shade)) out.push({ src, def });
  }

  // EE-06 回合內持續效果
  for (const l of s.lingering) {
    out.push({
      src: { id: `linger:${l.uid}`, kind: 'lingering', name: l.sourceName, params: l.params },
      def: lingeringDef(l.key),
    });
  }
  return out;
}

export function usageKey(src: Source, def: EffectDef): string {
  return `${src.id}#${def.key}`;
}

/** EE-01：基礎值 + 所有生效中的修正 (現場計算，不改卡片上存的值) */
export function applyMods(s: GameState, q: StatQuery, base: number): number {
  let v = base;
  for (const { src, def } of activeEffects(s)) {
    if (def.modify) v = def.modify(s, src, q, v);
  }
  for (const m of s.roundState.mods) {
    if (m.stat === q.stat) v += m.value;
  }
  return v;
}

/** EE-02：所有限制集中檢查；回傳第一個不允許的原因 */
export function restriction(s: GameState, r: Restriction): string | null {
  for (const { src, def } of activeEffects(s)) {
    if (def.restrict) {
      const why = def.restrict(s, src, r);
      if (why) return why;
    }
  }
  return null;
}
