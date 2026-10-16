// 策略玩家：用簡單但合理的打法跑完整局，用來驗證遊戲「贏得了」(不是只會輸)。
// 打法：保持光高以減少接戰、只抵消會讓 Treachery 完成的黑暗、其餘全部探索、
// 傷害多時休息、防禦擋滿、朝最終地點移動、XP 優先留給休息再成長。
import type { Answer, Decision, Option } from '../../src/engine/core';
import { validateActionSet } from '../../src/engine/phases';
import type { GameState } from '../../src/engine/types';
import {
  apAvailable,
  attackType,
  cardDefense,
  enemyAttack,
  enemyDefenseVs,
  enemyHP,
  face,
  isFinalCandidate,
  lightCost,
  lightProduction,
  luminaryHP,
  questDarkness,
  treacheryPV,
} from '../../src/engine/calc';
import { cardName as locationName, locationCard, playerCard } from '../../src/engine/data';
import { shadeInfo } from '../../src/engine/shades';
import { Bot } from './bot';
import { defsForSkill } from '../../src/engine/effects';
import { engagementSegment } from '../../src/engine/tracks';

const coord = (id: string) => locationCard(id).coordinates;
const manhattan = (a: string, b: string) => Math.abs(coord(a).east - coord(b).east) + Math.abs(coord(a).south - coord(b).south);

/** 到最近的最終地點候選的距離 (已確定最終地點時就是它) */
function toFinal(s: GameState, id: string): number {
  const names = s.world.finalLocation ? [locationCard(s.world.finalLocation).name] : shadeInfo(s.world.shade).finalLocations;
  const all = [s.world.location.id, ...s.world.locationDeck, ...s.world.locationDiscard, ...s.player.beacons, ...s.world.deferred, ...(s.world.revealedLocation ? [s.world.revealedLocation] : [])];
  const finals = [...new Set(all)].filter((x) => names.includes(locationCard(x).name));
  if (!finals.length) return 0;
  return Math.min(...finals.map((f) => manhattan(id, f)));
}

/** 效果的完整說明 (技能選項只顯示名稱) */
function effectLabel(o: Option): string {
  const sk = o.data?.skill as string | undefined;
  if (sk) return defsForSkill(sk).map((d) => d.label).join(' ');
  return o.label;
}

export class StrategyBot extends Bot {
  used = new Set<string>();
  answer(d: Decision, s: GameState): Answer {
    const legal = d.options?.filter((o) => o.legal !== false) ?? [];
    const has = (id: string) => legal.some((o) => o.id === id);
    const hp = luminaryHP(s);
    const p = s.player;

    switch (d.type) {
      case 'window':
        return this.window(d, s, legal);
      case 'actionSet':
        return this.actionSet(d, s);
      case 'number':
        if (d.rule === 'P4-02') {
          // 只抵消會讓 Treachery 完成的部分；Shade 已揭示、最終地點已探索時全部抵消
          const dark = questDarkness(s).effective;
          // 離 Treachery 上限只差 1 張時全部抵消；否則留 2 點緩衝 (移動效果也會加 Progress)
          const allowed = shadeInfo(s.world.shade).treacheryLimit - 1 - s.world.completedTreacheries.length;
          if (allowed <= 0) return d.max!;
          const room = s.world.activeTreachery ? treacheryPV(s) - s.world.treacheryProgress - 3 : 99;
          const must = Math.max(0, dark - Math.max(0, room));
          const explored = s.world.finalLocation === s.world.location.id && s.world.location.explored;
          return Math.min(d.max!, explored ? d.max! : must);
        }
        return d.min!;
      case 'cards':
        if (d.rule === 'P4-01') return [];
        return d.cards!.slice(0, d.min ?? 0);
      case 'order':
        return d.cards;
    }

    // ---- choose
    if (d.rule === 'P7-02') return this.defend(d, s, legal);
    if (d.rule === 'P8-03') {
      if (has('physical') && p.wounds >= 1) return 'physical';
      const b = legal.find((o) => o.id.startsWith('beacon:'));
      if (b && p.wounds >= hp - 4) return b.id;
      return 'done';
    }
    if (d.rule === 'P8-04') return 'done';
    if (d.rule === 'T1') {
      if (has('fetch')) return 'fetch';
      if (has('beacon')) {
        const bestBeacon = Math.min(...p.beacons.map((b) => toFinal(s, b)));
        if (bestBeacon < toFinal(s, s.world.location.id) || p.beacons.some((b) => isFinalCandidate(s, b))) return 'beacon';
      }
      return has('seek') ? 'seek' : legal[0].id;
    }
    if (d.rule === 'T1a' || d.rule === 'T1b' || d.rule === 'OPEN-06') {
      // 選離最終地點最近的 (最終地點本身優先)
      const scored = legal.map((o) => ({ o, v: isFinalCandidate(s, o.id) ? -1 : toFinal(s, o.id) + ((o.data?.distance as number) ?? 0) * 0.3 }));
      scored.sort((a, b) => a.v - b.v);
      return scored[0].o.id;
    }
    if (d.rule === 'T1c' && s.world.revealedLocation) {
      const r = s.world.revealedLocation;
      const dist = (legal.find((o) => o.id === 'travel')?.data?.distance as number) ?? 99;
      const closer = toFinal(s, r) < toFinal(s, s.world.location.id);
      if (has('travel') && (isFinalCandidate(s, r) || (closer && dist <= 4) || s.world.deferred.length >= 2 || dist <= 2)) return 'travel';
      if (has('save') && (isFinalCandidate(s, r) || p.beacons.length < 2)) return 'save';
      if (has('defer')) return 'defer';
      return legal[0].id;
    }
    if (d.rule === 'T1c') return has('save') ? 'save' : legal[0].id;
    if (d.rule === 'EE-12') return legal[0].id; // 觸發效果：照順序結算
    // 負面選項 (KC-12f 等)：能不受傷就不受傷；受傷較少的優先
    const wound = (o: Option) => Number(/受 (\d+) 傷/.exec(o.label)?.[1] ?? 0);
    if (legal.some((o) => wound(o) > 0) && p.wounds + Math.min(...legal.map(wound)) < hp) {
      return legal.slice().sort((a, b) => wound(a) - wound(b))[0].id;
    }
    if (d.rule === 'KC-08') {
      // 永久加成：選光費最低的
      return legal.slice().sort((a, b) => playerCard(a.id).light_cost - playerCard(b.id).light_cost)[0].id;
    }
    return legal[0].id;
  }

  private window(_d: Decision, s: GameState, legal: Option[]): Answer {
    const p = s.player;
    const hp = luminaryHP(s);
    const has = (id: string) => legal.some((o) => o.id === id);
    // 先留 XP 給休息 (傷害多時)；其餘拿去成長
    const reserve = p.wounds >= Math.floor(hp / 3) ? 3 + (p.wounds >= hp / 2 ? 3 : 0) : 0;
    for (const id of ['growAbility', 'growCharacter']) {
      const o = legal.find((x) => x.id === id);
      if (!o) continue;
      const cost = Number(/\((\d+) XP\)/.exec(o.label)?.[1] ?? 99);
      if (p.xp - cost >= reserve) return { option: id };
    }
    // 免費光 (Farhome)
    const free = legal.find((o) => o.id.includes('Farhome/0'));
    if (free) return { option: free.id };
    // 分配 AP：先打得死的 (攻擊高的優先)，打不死就全部給攻擊最高的
    const assign = legal.filter((o) => o.id.startsWith('assign:'));
    if (assign.length) {
      const ap = apAvailable(s);
      const t = attackType(s) ?? 'Physical';
      const info = assign.map((o) => {
        const e = o.data!.enemy as string;
        const need = enemyDefenseVs(s, e, t) + enemyHP(s, e) - s.world.enemies[e].wounds;
        return { o, e, need, atk: enemyAttack(s, e) };
      });
      // 擊敗時會讓 Treachery 完成的敵人 (例：Thretin Marshals) 先不要打
      const room = s.world.activeTreachery ? treacheryPV(s) - s.world.treacheryProgress : 99;
      const safe = (e: string) => !(locationName(e) === 'Thretin Marshals' && s.world.corruption >= room);
      const kill = info.filter((x) => x.need <= ap && safe(x.e)).sort((a, b) => b.atk - a.atk || a.need - b.need);
      if (kill.length) return { option: kill[0].o.id, amount: kill[0].need };
      // 打不死：擋得少的才值得打
      const best = info.sort((a, b) => b.atk - a.atk)[0];
      if (enemyDefenseVs(s, best.e, t) < ap) return { option: best.o.id, amount: ap };
    }
    const atk = legal.find((o) => o.id.startsWith('attacker:'));
    if (atk) return { option: atk.id };
    // 使用不會傷到自己的卡片效果與技能 (每回合每個最多一次)
    const eff = legal.find(
      (o) =>
        (o.id.startsWith('effect:') || o.id.startsWith('skill:')) &&
        !/受|傷害|橫置|Disarm|花/.test(effectLabel(o).replace(/造成.*傷/, '')) &&
        !this.used.has(`${s.round}|${o.id}`),
    );
    if (eff) {
      this.used.add(`${s.round}|${eff.id}`);
      return { option: eff.id };
    }
    // 搜尋 (有信標時)
    if (has('search') && p.beacons.length >= 1) return { option: 'search' };
    // 強制要結算的階段效果
    const during = legal.find((o) => o.id.startsWith('during:'));
    if (during && !has('pass')) return { option: during.id };
    if (has('pass')) return 'pass';
    void hp;
    return { option: legal[0].id };
  }

  private defend(d: Decision, s: GameState, legal: Option[]): Answer {
    const m = /\((\d+)，已擋 (\d+)\)/.exec(d.prompt);
    const incoming = m ? Number(m[1]) : 0;
    const blocked = m ? Number(m[2]) : 0;
    const left = incoming - blocked;
    if (left <= 0) return 'done';
    // 傷害很少、離死亡還遠時，承受 1 點省卡
    if (left <= 1 && s.player.wounds + left < luminaryHP(s) - 3) return 'done';
    const hand = legal
      .filter((o) => o.id.startsWith('hand:'))
      .map((o) => ({ o, def: cardDefense(s, o.id.slice(5)) }))
      .sort((a, b) => a.def - b.def);
    const enough = hand.find((h) => h.def >= left);
    if (enough) return enough.o.id;
    if (hand.length) return hand[hand.length - 1].o.id;
    if (legal.some((o) => o.id === 'peek')) return 'peek';
    if (legal.some((o) => o.id === 'top')) return 'top';
    return 'done';
  }

  private actionSet(d: Decision, s: GameState): Answer {
    const hand = d.cards!;
    let best: { action: string; attack: string; booster: string } | null = null;
    let bestScore = -Infinity;
    const enemies = s.world.questArea.length + s.world.playerArea.length;
    for (const a of hand)
      for (const b of hand)
        for (const c of hand) {
          if (a === b || b === c || a === c) continue;
          const x = { action: a, attack: b, booster: c };
          if (validateActionSet({ s }, x)) continue;
          const atk = face(s, b);
          const bst = face(s, c);
          const cost = lightCost(s, a, 'action') + lightCost(s, b, 'attack') + lightCost(s, c, 'booster');
          const ap = atk.attack + bst.attack_booster;
          const ep = bst.explore_booster + 0.6 * atk.explore; // 攻擊卡下回合變探索卡
          const lightLeft = Math.max(0, s.player.light - cost);
          const seg = engagementSegment(s, lightLeft);
          // 下回合要付得起：剩下的光 + 產光太少時重罰
          const nextLight = lightLeft + lightProduction(s);
          const engagePenalty = 4 * seg.engage + 6 * seg.reveal.length + 5 * seg.wounds + (nextLight < 8 ? 30 : 0);
          const score = ap * (enemies ? 1 : 0.3) + ep - cost * 0.3 - engagePenalty + this.rand() * 0.5;
          if (score > bestScore) {
            bestScore = score;
            best = x;
          }
        }
    return best!;
  }
}
