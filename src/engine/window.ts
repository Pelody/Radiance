// 行動窗口 (EE-17、EE-18)：玩家主動做事的時機。
// 一般窗口列出所有合法的主動效果 (EE-05)、技能 (KC-18)、成長 (KC-05)、搜尋 (KC-29)，加上「繼續」。
import type { Answer, Ctx, Gen, Option } from './core';
import { InvalidAnswer } from './core';
import { cardName, playerCard } from './data';
import {
  activeEffects,
  defsForSkill,
  isMandatory,
  skillActive,
  type EffectDef,
  type Source,
  type SourcedDef,
} from './effects';
import { face, lightCost } from './calc';
import { addPath, emit, roundLimit, runEffect, spendLight, spendXP, usedThisRound } from './ops';
import { abilitySpace, abilityTrackLength, characterSpace, characterTrackLength } from './tracks';
import type { GameState, Phase, SkillState } from './types';

export interface WindowChoice {
  option: string;
  [k: string]: unknown;
}

// ---------------------------------------------------------------- 主動效果

interface ActiveOpt {
  id: string;
  label: string;
  rule: string;
  legal: boolean;
  reason?: string;
  run: (ctx: Ctx) => Gen;
}

function effectAvailable(ctx: Ctx, sd: SourcedDef, phase: Phase): string | null {
  const a = sd.def.active!;
  if (a.phases && !a.phases.includes(phase)) return `只能在 ${a.phases.join('/')} Phase 使用`;
  const lim = roundLimit(sd.def);
  if (lim !== undefined && usedThisRound(ctx, sd.src, sd.def) >= lim) return '本回合已使用';
  return a.available ? a.available(ctx.s, sd.src) : null;
}

/** KC-18 技能：第一次使用、橫置後第二次使用、橫置以啟動 */
function skillOptions(ctx: Ctx, phase: Phase): ActiveOpt[] {
  const s = ctx.s;
  const out: ActiveOpt[] = [];
  for (const sk of s.player.skills) {
    if (!sk.unlocked) continue;
    for (const def of defsForSkill(sk.name)) {
      if (!def.active) continue;
      const src: Source = { id: `skill:${sk.name}`, kind: 'skill', name: sk.name };
      const used = usedThisRound(ctx, src, def);
      const once = roundLimit(def) === 1;
      const active = skillActive(s, sk);
      const cond = (): string | null => {
        if (def.active!.phases && !def.active!.phases.includes(phase)) return `只能在 ${def.active!.phases.join('/')} Phase 使用`;
        return def.active!.available ? def.active!.available(s, src) : null;
      };
      if (sk.activatedByExhaust) {
        // 橫置以啟動：本回合可用 (1x 只能 1 次)
        const why = once && used >= 1 ? '本回合已使用' : cond();
        out.push(mkSkillOpt(sk, def, src, `skill:${sk.name}`, `${sk.name}`, why));
      } else if (active && !sk.exhausted) {
        if (once && used >= 1) {
          // 1x 技能第二次使用：橫置方塊
          const why = cond();
          out.push(mkSkillOpt(sk, def, src, `skill2:${sk.name}`, `${sk.name} (橫置，第 2 次)`, why, true));
        } else {
          out.push(mkSkillOpt(sk, def, src, `skill:${sk.name}`, sk.name, cond()));
        }
      }
    }
    if (!skillActive(s, sk) && !sk.exhausted) {
      out.push({
        id: `activate:${sk.name}`,
        label: `橫置 ${sk.name} 以啟動`,
        rule: 'KC-18',
        legal: true,
        run: function* (c: Ctx) {
          sk.exhausted = true;
          sk.activatedByExhaust = true;
          c.log('KC-18', `橫置 ${sk.name} 以啟動 (到 Refresh 棄牌步驟)`);
          yield* emit(c, { t: 'SkillExhausted', skill: sk.name });
        },
      });
    }
  }
  return out;
}

function mkSkillOpt(sk: SkillState, def: EffectDef, src: Source, id: string, label: string, why: string | null, exhaust = false): ActiveOpt {
  return {
    id,
    label,
    rule: def.rule ?? 'KC-18',
    legal: !why,
    reason: why ?? undefined,
    run: function* (c: Ctx) {
      if (exhaust) {
        sk.exhausted = true;
        c.log('KC-18', `橫置 ${sk.name}，本回合第 2 次使用`);
      }
      sk.usesThisRound++;
      c.log(def.rule ?? 'KC-18', `使用技能 ${sk.name}`);
      yield* runEffect(c, src, def, () => def.active!.run(c, src));
      yield* emit(c, { t: 'SkillUsed', skill: sk.name });
    },
  };
}

export function activeOptions(ctx: Ctx, phase: Phase): ActiveOpt[] {
  const s = ctx.s;
  const out: ActiveOpt[] = [];
  for (const sd of activeEffects(s)) {
    const { src, def } = sd;
    if (src.kind === 'skill') continue; // 技能另外處理
    if (def.active) {
      const why = effectAvailable(ctx, sd, phase);
      out.push({
        id: `effect:${src.id}#${def.key}`,
        label: `${src.name}：${def.label}`,
        rule: def.rule ?? 'EE-05',
        legal: !why,
        reason: why ?? undefined,
        run: function* (c: Ctx) {
          c.log(def.rule ?? 'EE-05', `${src.name}：${def.label}`);
          yield* runEffect(c, src, def, () => def.active!.run(c, src));
        },
      });
    }
    // EE-18a 階段中強制效果：一般窗口可選時點
    if (def.phaseDuring && def.phaseDuring.phase === phase) {
      const k = `${src.id}#${def.key}`;
      if (!s.roundState.resolvedPhaseEffects.includes(k)) {
        out.push({
          id: `during:${k}`,
          label: `${src.name}：${def.label}`,
          rule: def.rule ?? 'EE-18a',
          legal: true,
          run: function* (c: Ctx) {
            c.s.roundState.resolvedPhaseEffects.push(k);
            c.log(def.rule ?? 'EE-18a', `${src.name}：${def.label}`);
            yield* runEffect(c, src, def, () => def.phaseDuring!.run(c, src));
          },
        });
      }
    }
  }
  out.push(...skillOptions(ctx, phase));
  out.push(...growthOptions(ctx));
  // KC-29 搜尋行動
  const p = s.player;
  out.push({
    id: 'search',
    label: `搜尋 (Path +${p.beacons.length})`,
    rule: 'KC-29',
    // KC-29 規則書 p.38 沒有要求至少 1 個信標
    legal: p.beaconMatReady,
    reason: !p.beaconMatReady ? '本地點已搜尋過' : undefined,
    run: function* (c: Ctx) {
      c.s.player.beaconMatReady = false;
      yield* addPath(c, c.s.player.beacons.length, 'KC-29', '搜尋行動');
      yield* emit(c, { t: 'SearchAction' });
    },
  });
  return out;
}

/**
 * EE-17 一般窗口。extra 是該階段自己的選項 (例：P6 分配 AP)，被選中時回傳給呼叫者。
 * 只剩「繼續」時直接繼續 (EE-24)。
 */
export function* generalWindow(
  ctx: Ctx,
  phase: Phase,
  prompt: string,
  extra: (s: GameState) => Option[] = () => [],
  canPass: (s: GameState) => string | null = () => null,
): Gen<WindowChoice | null> {
  for (;;) {
    if (ctx.s.outcome) return null;
    const acts = activeOptions(ctx, phase);
    const ex = extra(ctx.s);
    const passWhy = canPass(ctx.s);
    const options: Option[] = [
      ...ex,
      ...acts.map((a) => ({ id: a.id, label: a.label, rule: a.rule, legal: a.legal, reason: a.reason })),
      { id: 'pass', label: '繼續', legal: !passWhy, reason: passWhy ?? undefined },
    ];
    const legal = options.filter((o) => o.legal !== false);
    if (!legal.length) return null;
    if (legal.length === 1 && legal[0].id === 'pass') return null;
    const ans = (yield* ctx.decide({
      type: 'window',
      rule: 'EE-17',
      prompt,
      options,
      autoSingle: false,
      validate: (a: Answer) => {
        const id = typeof a === 'string' ? a : (a as WindowChoice)?.option;
        return legal.some((o) => o.id === id) ? null : `不合法的選項：${String(id)}`;
      },
    })) as WindowChoice | string;
    const choice: WindowChoice = typeof ans === 'string' ? { option: ans } : ans;
    if (choice.option === 'pass') return null;
    const act = acts.find((a) => a.id === choice.option);
    if (act) {
      yield* act.run(ctx);
      continue;
    }
    return choice;
  }
}

/** KC-12a 開始 / 結束窗口：強制的必須結算；多個時玩家排序 */
export function* boundaryWindow(ctx: Ctx, phase: Phase, which: 'start' | 'end'): Gen {
  const s = ctx.s;
  const tag = `${which}:${phase}`;
  for (;;) {
    if (s.outcome) return;
    const cands: { sd: SourcedDef; k: string; mandatory: boolean; run: (c: Ctx, src: Source) => Gen; label: string }[] = [];
    for (const sd of activeEffects(s)) {
      const b = which === 'start' ? sd.def.phaseStart : sd.def.phaseEnd;
      const k = `${tag}|${sd.src.id}#${sd.def.key}`;
      if (s.roundState.resolvedPhaseEffects.includes(k)) continue;
      if (b && b.phase === phase) cands.push({ sd, k, mandatory: b.mandatory || isMandatory(sd.def), run: b.run, label: sd.def.label });
      // EE-18a 階段中強制效果：結束窗口還沒結算的一定結算
      if (which === 'end' && sd.def.phaseDuring?.phase === phase) {
        const dk = `${sd.src.id}#${sd.def.key}`;
        if (!s.roundState.resolvedPhaseEffects.includes(dk))
          cands.push({ sd, k: dk, mandatory: true, run: sd.def.phaseDuring.run, label: sd.def.label });
      }
    }
    if (!cands.length) return;
    const mandatory = cands.filter((c) => c.mandatory);
    const opts: Option[] = cands.map((c, i) => ({ id: String(i), label: `${c.sd.src.name}：${c.label}`, rule: c.sd.def.rule ?? 'KC-12a' }));
    if (!mandatory.length) opts.push({ id: 'skip', label: '不使用', rule: 'KC-12a' });
    const pick = cands.length === 1 && mandatory.length === 1 ? '0' : yield* ctx.choose('KC-12a', `${which === 'start' ? 'Start' : 'End'} of ${phase}：選擇要結算的效果`, opts, false);
    if (pick === 'skip') {
      for (const c of cands) s.roundState.resolvedPhaseEffects.push(c.k);
      return;
    }
    const c = cands[Number(pick)];
    s.roundState.resolvedPhaseEffects.push(c.k);
    ctx.log(c.sd.def.rule ?? 'KC-12a', `${c.sd.src.name}：${c.label}`);
    yield* runEffect(ctx, c.sd.src, c.sd.def, () => c.run(ctx, c.sd.src));
  }
}

// ---------------------------------------------------------------- 成長 (KC-05 ~ KC-08)

export function abilityGrowthStatus(s: GameState): { ok: boolean; cost: number; reason?: string } {
  const pos = s.player.abilityGrowthPos;
  if (pos >= abilityTrackLength(s)) return { ok: false, cost: 0, reason: '已到最後一格' };
  const cost = abilitySpace(s, pos + 1).cost ?? 0;
  if (s.player.xp < cost) return { ok: false, cost, reason: `需要 ${cost} XP` };
  return { ok: true, cost };
}

export function characterGrowthStatus(s: GameState): { ok: boolean; cost: number; reason?: string } {
  const pos = s.player.characterGrowthPos;
  if (pos >= characterTrackLength(s)) return { ok: false, cost: 0, reason: '已到最後一格' };
  const sp = characterSpace(s, pos + 1);
  const cost = sp.cost ?? 0;
  if (s.player.xp < cost) return { ok: false, cost, reason: `需要 ${cost} XP` };
  if (sp.perm_booster && !affordablePermBoosters(s).length) return { ok: false, cost, reason: '沒有付得起的永久加成卡 (KC-08)' };
  return { ok: true, cost };
}

function growthOptions(ctx: Ctx): ActiveOpt[] {
  const s = ctx.s;
  const a = abilityGrowthStatus(s);
  const c = characterGrowthStatus(s);
  return [
    {
      id: 'growAbility',
      label: `Ability Growth (${a.cost} XP)`,
      rule: 'KC-05',
      legal: a.ok,
      reason: a.reason,
      run: (cx) => growAbility(cx),
    },
    {
      id: 'growCharacter',
      label: `Character Growth (${c.cost} XP)`,
      rule: 'KC-05',
      legal: c.ok,
      reason: c.reason,
      run: (cx) => growCharacter(cx),
    },
  ];
}

function* growAbility(ctx: Ctx): Gen {
  const s = ctx.s;
  const st = abilityGrowthStatus(s);
  if (!st.ok) throw new InvalidAnswer(st.reason ?? '不能成長');
  yield* spendXP(ctx, st.cost, 'KC-05', 'Ability Growth');
  s.player.abilityGrowthPos++;
  const sp = abilitySpace(s, s.player.abilityGrowthPos);
  ctx.log('KC-07', `Ability Growth → 第 ${s.player.abilityGrowthPos} 格`);
  for (let i = 0; i < (sp.unlock ?? 0); i++) yield* unlockSkill(ctx, 'KC-07');
  for (let i = 0; i < (sp.recruit ?? 0); i++) yield* recruit(ctx, 'KC-07');
  for (let i = 0; i < (sp.upgrade ?? 0); i++) yield* upgradeFromHand(ctx, 'KC-07');
  yield* emit(ctx, { t: 'Growth', track: 'ability' });
}

function* growCharacter(ctx: Ctx): Gen {
  const s = ctx.s;
  const st = characterGrowthStatus(s);
  if (!st.ok) throw new InvalidAnswer(st.reason ?? '不能成長');
  yield* spendXP(ctx, st.cost, 'KC-05', 'Character Growth');
  s.player.characterGrowthPos++;
  const sp = characterSpace(s, s.player.characterGrowthPos);
  ctx.log('KC-08', `Character Growth → 第 ${s.player.characterGrowthPos} 格`);
  for (let i = 0; i < (sp.perm_booster ?? 0); i++) yield* equipPermBooster(ctx);
  yield* emit(ctx, { t: 'Growth', track: 'character' });
}

/** KC-08 永久加成卡費用 = 該卡光費 + 已裝備同元素永久加成的光費總和 */
export function permBoosterCost(s: GameState, id: string): number {
  const el = playerCard(id).element;
  return (
    playerCard(id).light_cost +
    s.player.permBoosters.filter((x) => playerCard(x).element === el).reduce((n, x) => n + playerCard(x).light_cost, 0)
  );
}

export function affordablePermBoosters(s: GameState): string[] {
  // ⚠ INTERP (KC-08)：只能選付得起的卡
  return s.player.permBoosterSource.filter((id) => permBoosterCost(s, id) <= s.player.light);
}

function* equipPermBooster(ctx: Ctx): Gen {
  const s = ctx.s;
  const ids = affordablePermBoosters(s);
  if (!ids.length) return;
  const pick = yield* ctx.choose(
    'KC-08',
    '選擇要裝備的永久加成卡',
    ids.map((id) => ({ id, label: `${cardName(id)} (光 ${permBoosterCost(s, id)})` })),
  );
  yield* spendLight(ctx, permBoosterCost(s, pick), 'KC-08', `裝備 ${cardName(pick)}`);
  s.player.permBoosterSource = s.player.permBoosterSource.filter((x) => x !== pick);
  s.player.permBoosters.push(pick);
  ctx.log('KC-09', `裝備永久加成卡 ${cardName(pick)} (${playerCard(pick).element})`);
}

// ---------------------------------------------------------------- 技能解鎖 (KC-13)

/** KC-13 相鄰 */
export function skillsAdjacent(a: SkillState, b: SkillState): boolean {
  if (a === b) return false;
  const same = a.mat === b.mat;
  if (same && a.column === b.column && Math.abs(a.row - b.row) === 1) return true;
  const pair = (x: SkillState, y: SkillState): boolean => {
    if (x.mat === 'luminary' && y.mat === 'luminary' && x.column === 0 && y.column === 1) return y.row === x.row || y.row === x.row + 1; // 例外 1
    if (x.mat === 'luminary' && y.mat === 'profession' && x.column === 1 && y.column === 0) return x.row === y.row; // 跨墊
    if (x.mat === 'profession' && y.mat === 'profession' && x.column === 0 && y.column === 1) return x.row === y.row;
    if (x.mat === 'profession' && y.mat === 'profession' && x.column === 1 && y.column === 2) return true; // 例外 2
    return false;
  };
  return pair(a, b) || pair(b, a);
}

export function unlockableSkills(s: GameState): SkillState[] {
  const sks = s.player.skills;
  return sks.filter((k) => !k.unlocked && sks.some((u) => u.unlocked && skillsAdjacent(u, k)));
}

export function* unlockSkill(ctx: Ctx, rule: string, candidates?: SkillState[]): Gen {
  const list = candidates ?? unlockableSkills(ctx.s);
  if (!list.length) {
    ctx.log('KC-13', '沒有可以解鎖的技能');
    return;
  }
  const pick = yield* ctx.choose(
    'KC-13',
    '選擇要解鎖的技能',
    list.map((k) => ({ id: k.name, label: `${k.name} (${k.cubeElement})` })),
  );
  const sk = ctx.s.player.skills.find((k) => k.name === pick)!;
  sk.unlocked = true;
  ctx.log(rule, `解鎖技能 ${sk.name}`);
  yield* emit(ctx, { t: 'SkillUnlocked', skill: sk.name });
}

// ---------------------------------------------------------------- Recruit / Upgrade

/** KC-30 Recruit */
export function* recruit(ctx: Ctx, rule: string): Gen {
  const p = ctx.s.player;
  const visible = [...p.hobbyMarket, ...p.hobbyDeck.slice(0, 1)];
  if (!visible.length) {
    ctx.log('KC-30', '嗜好市場是空的');
    return;
  }
  ctx.revealInfo();
  const take = yield* ctx.choose('KC-30', 'Recruit：選 1 張加入手牌', visible.map((id) => ({ id, label: cardName(id) })));
  const rest = visible.filter((x) => x !== take);
  let bottom: string | null = null;
  if (rest.length) {
    bottom = yield* ctx.choose('KC-30', 'Recruit：選 1 張放到嗜好牌庫底部', rest.map((id) => ({ id, label: cardName(id) })));
  }
  p.hobbyMarket = p.hobbyMarket.filter((x) => x !== take && x !== bottom);
  p.hobbyDeck = p.hobbyDeck.filter((x) => x !== take && x !== bottom);
  if (bottom) p.hobbyDeck.push(bottom);
  p.hand.push(take);
  while (p.hobbyMarket.length < 2 && p.hobbyDeck.length > 1) p.hobbyMarket.push(p.hobbyDeck.shift()!);
  ctx.log(rule, `Recruit ${cardName(take)}${bottom ? `；${cardName(bottom)} 放到嗜好牌庫底部` : ''}`);
  yield* emit(ctx, { t: 'CardRecruited', card: take });
}

/** KC-07 Upgrade：從手牌選 1 張基礎面卡翻到進階面 */
export function* upgradeFromHand(ctx: Ctx, rule: string): Gen {
  const p = ctx.s.player;
  const cands = p.hand.filter((id) => !p.upgraded.includes(id) && playerCard(id).back_id);
  if (!cands.length) {
    ctx.log('KC-07', '手牌中沒有可以升級的卡');
    return;
  }
  const pick = yield* ctx.choose('KC-07', 'Upgrade：選擇手牌中要升級的卡', cands.map((id) => ({ id, label: `${cardName(id)} (光 ${lightCost(ctx.s, id)})` })));
  p.upgraded.push(pick);
  ctx.log(rule, `升級 ${cardName(pick)} → 進階面 (光費 ${face(ctx.s, pick).light_cost})`);
  yield* emit(ctx, { t: 'CardUpgraded', card: pick });
}
