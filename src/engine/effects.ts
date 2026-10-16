// 效果定義與來源 (EE-01 ~ EE-07)。
// 卡片效果寫成程式並用效果積木組合，不解析卡片文字 (EE-23)；以卡名 (+ 進階面) 對應。
import type { Ctx, GameEvent, Gen } from './core';
import type { AttackType, Element } from './data';
import { getCard, playerCard } from './data';
import type { GameState, LocationInPlay, Phase, SkillState } from './types';

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
    | 'enemyAttackFinal'
    | 'enemyAttackCount'
    | 'enemyDefense'
    | 'enemyDefenseFinal'
    | 'enemyDarkness'
    | 'enemyDarknessFinal'
    | 'enemyHP'
    | 'enemyXP'
    | 'ignoreDarkness'
    | 'lightCost'
    | 'mainAttack'
    | 'attackBoost'
    | 'mainExplore'
    | 'exploreBoost'
    | 'engagement'
    | 'distance'
    | 'distanceHere'
    | 'threat'
    | 'locationEV'
    | 'cardDefense'
    | 'cardDefenseFinal'
    | 'fetchCost'
    | 'freeLight'
    | 'growthCost'
    | 'lightProduction'
    | 'flag';
  enemy?: string;
  card?: string;
  slot?: string;
  attackType?: AttackType;
  location?: string;
  /** 目前結算的階段 (例：Flaming Headwaters「During the Defend Phase」) */
  phase?: Phase;
  /** stat = 'flag' 時的旗標名稱 (規則改寫，例：'invertAttackType') */
  flag?: string;
  /** 假設的加成卡元素 (打出行動組前計算光費用，Singular Focus) */
  element?: Element | null;
  track?: 'ability' | 'character';
}

/** EE-02 規則限制查詢：回傳不允許的原因 */
export type Restriction =
  | { kind: 'travelTo'; location: string }
  | { kind: 'attack'; enemy: string }
  | { kind: 'push'; enemy: string }
  | { kind: 'defendFromDeck' }
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
  /**
   * EE-04 觸發效果。timing：
   * - when：事件發生時立即插入 (EE-09)
   * - after：最外層效果結算完再結算 (EE-10)
   * - will：事件「即將發生」時結算，可以改寫事件內容 (EE-03 取代效果、「When taking Wound…」)
   */
  trigger?: {
    event: string;
    timing: 'when' | 'after' | 'will';
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
  /** P7-01a 效果給敵人的額外攻防類型 (例：Waking Wraith 另有 PhotonicDefense) */
  extraTypes?: (s: GameState, src: Source, enemy: string) => AttackType[];
  /** 改寫敵人的先後攻 (revealing = 正在翻開放入任務區) */
  initiative?: (s: GameState, src: Source, enemy: string, v: 'Fast' | 'Slow', revealing: boolean) => 'Fast' | 'Slow';
  /** EE-02 */
  restrict?: (s: GameState, src: Source, r: Restriction) => string | null;
  /** 附著卡：忽略宿主敵人的效果 (Arcing Shot+) */
  ignoresHost?: boolean;
  /** 地點：加成卡元素不會啟動這些元素的技能 (The Barren Hills) */
  blocksSkillElements?: Element[];
  /** 技能：echo 的元素也算啟動中 (Enduring Hope) */
  echoElementActive?: boolean;
  /** 技能：這個技能的方塊另外具有某技能方塊的元素 (From the Ashes) */
  cubeAlsoElementOf?: string;
  /** 技能：不能使用時也列在有效效果中，由效果自己檢查 (Singular Focus 要在打出行動組前修正光費) */
  alwaysListed?: boolean;
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
export function registeredCardNames(): string[] {
  return [...cardDefs.keys()];
}
export function registeredSkillNames(): string[] {
  return [...skillDefs.keys()];
}

// ---------------------------------------------------------------- 來源 (EE-07)

export const isEager = (d: EffectDef) => !!d.type && d.type.startsWith('Eager');
export const isMandatory = (d: EffectDef) => !!d.type && (d.type.includes('Mandatory') || d.type.endsWith('Passive'));
export const isOncePerRound = (d: EffectDef) => !!d.type && d.type.endsWith('1x');

/** 本回合使技能啟動的元素：加成卡元素 (KC-18) + Enduring Hope 的 echo 元素 */
export function activeElements(s: GameState): Element[] {
  const out = new Set<Element>();
  const be = s.roundState.activeElement;
  const blocked = defsForCard(s, s.world.location.id).flatMap((d) => d.blocksSkillElements ?? []);
  if (be && !blocked.includes(be)) out.add(be);
  // Enduring Hope：本身要先以加成卡元素 (或其他方式) 啟動，才能讓 echo 的元素也啟動 (只算一層)
  const base = [...out];
  for (const sk of s.player.skills) {
    if (!defsForSkill(sk.name).some((d) => d.echoElementActive)) continue;
    if (!skillUnlocked(s, sk) || sk.exhausted && !sk.activatedByExhaust) continue;
    if (!activeWith(s, sk, base)) continue;
    const d = s.player.discard;
    if (d.length) out.add(playerCard(d[d.length - 1]).element);
  }
  return [...out];
}

function cubeElements(s: GameState, sk: SkillState): Element[] {
  const els = [sk.cubeElement];
  for (const d of defsForSkill(sk.name)) {
    if (d.cubeAlsoElementOf) {
      const other = s.player.skills.find((k) => k.name === d.cubeAlsoElementOf);
      if (other) els.push(other.cubeElement);
    }
  }
  return els;
}

function activeWith(s: GameState, sk: SkillState, els: Element[]): boolean {
  const m = s.roundState.skillMods;
  if (m.activeAll && skillUnlocked(s, sk)) return true;
  if (m.active.includes(sk.name)) return true;
  return sk.activatedByExhaust || cubeElements(s, sk).some((e) => els.includes(e));
}

/** KC-13 已解鎖 (含本回合的改寫：Inner Strength+、Winds of Change+、Equilibrium) */
export function skillUnlocked(s: GameState, sk: SkillState): boolean {
  const m = s.roundState.skillMods;
  if (m.locked.includes(sk.name)) return false;
  return sk.unlocked || m.unlockAll || m.unlocked.includes(sk.name);
}

/** KC-18 技能是否啟動中 */
export function skillActive(s: GameState, sk: SkillState): boolean {
  return activeWith(s, sk, activeElements(s));
}

/** KC-18 技能目前可以使用 (已解鎖 + Ready + 啟動中；橫置以啟動例外) */
export function skillUsable(s: GameState, sk: SkillState): boolean {
  if (!skillUnlocked(s, sk)) return false;
  if (sk.activatedByExhaust) return true;
  return !sk.exhausted && skillActive(s, sk);
}

export function findSkill(s: GameState, name: string): SkillState | undefined {
  return s.player.skills.find((k) => k.name === name);
}

/** 敵人的效果是否被忽略 (Unfettered Resolve、Arcing Shot+、Lay of the Land+) */
export function enemyIgnored(s: GameState, eid: string): boolean {
  if (s.roundState.ignoredEnemies.includes(eid)) return true;
  const atts = s.world.enemies[eid]?.attachments ?? [];
  if (s.roundState.flags.ignoreTrapped && atts.some((a) => playerTraits(s, a).includes('Trap'))) return true;
  return atts.some((a) => defsForCard(s, a).some((d) => d.ignoresHost));
}

/** 玩家卡目前的特質 (不含效果加的；完整版見 calc.cardTraits) */
function playerTraits(s: GameState, id: string): string[] {
  const c = playerCard(id);
  const f = isPlayerUpgraded(s, id) && c.back_id ? playerCard(c.back_id) : c;
  return f.traits;
}

export interface SourcedDef {
  src: Source;
  def: EffectDef;
}

function locationSources(s: GameState, loc: LocationInPlay, out: SourcedDef[], envy: boolean): void {
  const lid = loc.id;
  const src: Source = { id: `location:${lid}`, kind: 'location', name: getCard(lid).name as string, cardId: lid, params: envy ? { envy: true } : undefined };
  for (const def of defsForCard(s, lid)) {
    // Envy：玩家區地點的 Upon Arrival 忽略
    if (envy && def.uponArrival) continue;
    out.push({ src, def });
  }
  for (const aid of loc.attachments) {
    const asrc: Source = { id: `card:${aid}`, kind: 'card', name: playerCard(aid).name, cardId: aid, params: { attachedToLocation: lid } };
    for (const def of defsForCard(s, aid)) if (isEager(def)) out.push({ src: asrc, def });
  }
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
    const usable = skillUsable(s, sk);
    for (const def of defsForSkill(sk.name)) {
      if (usable || isEager(def) || def.alwaysListed) out.push({ src, def });
    }
  }

  // 敵人 (KC-12d)；被忽略效果的敵人略過
  const enemyZones: [string[], 'quest' | 'player'][] = [
    [w.questArea, 'quest'],
    [w.playerArea, 'player'],
  ];
  for (const [area, zone] of enemyZones) {
    for (const eid of area) {
      if (enemyIgnored(s, eid)) continue;
      const src: Source = { id: `enemy:${eid}`, kind: 'enemy', name: getCard(eid).name as string, cardId: eid, zone };
      for (const def of defsForCard(s, eid)) {
        if (!def.zone || def.zone === zone) out.push({ src, def });
      }
    }
  }

  // 目前地點 (最終地點橫置後仍有效，FL-04) 與附著在地點的卡；Envy 放在玩家區的地點
  locationSources(s, w.location, out, false);
  for (const loc of w.envyLocations) locationSources(s, loc, out, true);

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
      src: { id: `linger:${l.uid}`, kind: 'lingering', name: l.sourceName, params: l.params, cardId: l.params.cardId as string | undefined },
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
    if (m.stat !== q.stat) continue;
    if (m.enemy && m.enemy !== q.enemy) continue;
    if (m.card && m.card !== q.card) continue;
    v += m.value;
  }
  return v;
}

/** 規則改寫旗標 (EE-02)：例 'invertAttackType'、'swapMainStats' */
export function flag(s: GameState, name: string): boolean {
  return (s.roundState.flags[name] ?? 0) > 0 || applyMods(s, { stat: 'flag', flag: name }, 0) > 0;
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
