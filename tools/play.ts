// 文字介面：在終端機裡一步一步親自玩 (只顯示紙本玩家看得到的資訊，DG-17)。
//   node tools/.play/play.js new Courage Wayfarer Scorchwright Hunter Greed Blaze 7
//   node tools/.play/play.js show
//   node tools/.play/play.js a '<回答 JSON 或選項 id>'
//   node tools/.play/play.js undo
//   node tools/.play/play.js text   (場上卡片的完整文字)
//   node tools/.play/play.js log [N]
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { deserialize, newGame, serialize, view, type Game } from '../src/engine/game';
import { act, autoAdvance, emptyMemory, undoToStop, type FlowMemory } from '../src/ui/flow';
import {
  apBreakdown,
  cardTraits,
  enemyAttack,
  enemyAttackCount,
  enemyDarkness,
  enemyDefenseVs,
  enemyHP,
  enemyInitiative,
  enemyTypes,
  engagementCount,
  epBreakdown,
  face,
  lightCost,
  locationEV,
  luminaryHP,
  questDarkness,
  threatBreakdown,
  treacheryPV,
  handSize,
  lightProduction,
  restValue,
  cardDefense,
} from '../src/engine/calc';
import { cardName, enemyCard, getCard, locationCard, treacheryCard } from '../src/engine/data';
import { skillUnlocked, skillUsable } from '../src/engine/effects';
import { shadeInfo } from '../src/engine/shades';
import type { GameState } from '../src/engine/types';
import type { Decision } from '../src/engine/core';
import { abilityGrowthStatus, characterGrowthStatus } from '../src/engine/window';

const FILE = process.env.PLAY_FILE ?? 'tools/.play-save/game.json';
const settings = { stopAtEveryWindow: process.env.STOP_ALL === '1' };

interface Saved {
  game: string;
  mem: FlowMemory;
  logPos: number;
}

function load(): { g: Game; mem: FlowMemory; logPos: number } {
  const x = JSON.parse(readFileSync(FILE, 'utf8')) as Saved;
  return { g: deserialize(x.game), mem: x.mem, logPos: x.logPos };
}
function save(g: Game, mem: FlowMemory, logPos: number): void {
  writeFileSync(FILE, JSON.stringify({ game: serialize(g), mem, logPos }));
}

function card(s: GameState, id: string): string {
  const f = face(s, id);
  const up = s.player.upgraded.includes(id) ? '+' : '';
  return `${cardName(id)}${up} [光${lightCost(s, id)} ${f.element} 攻${f.attack}${f.attack_type === 'Physical' ? '物' : '光'} 防${cardDefense(s, id)} 探${f.explore} 加成${f.attack_booster}/${f.explore_booster}] ${cardTraits(s, id).join(',')}`;
}

function enemy(s: GameState, id: string): string {
  const e = s.world.enemies[id];
  const types = enemyTypes(s, id).map((t) => `${t === 'Physical' ? '物' : '光'}${enemyDefenseVs(s, id, t)}`).join('/');
  const cnt = enemyAttackCount(s, id);
  const att = e?.attachments.length ? ` 附著:${e.attachments.map(cardName).join(',')}` : '';
  return `${cardName(id)}(${enemyCard(id).class} ${enemyInitiative(s, id)} ${enemyCard(id).faction}) 暗${enemyDarkness(s, id)} 攻${enemyAttack(s, id)}${cnt > 1 ? `×${cnt}` : ''} 防${types} HP${enemyHP(s, id) - (e?.wounds ?? 0)}/${enemyHP(s, id)}${e?.progress ? ` 進度${e.progress}` : ''}${att} {${cardTraits(s, id).join(',')}}${s.roundState.disarmed.includes(id) ? ' [Disarm]' : ''}`;
}

function showState(s: GameState): string[] {
  const p = s.player;
  const w = s.world;
  const loc = locationCard(w.location.id);
  const t = w.activeTreachery;
  const info = shadeInfo(w.shade);
  const out: string[] = [];
  out.push(`== 第 ${s.round} 回合 ${s.phase} | ${p.luminary}/${p.profession} vs ${w.shade}${w.shadeRevealed ? (w.shadeDefeated ? ' (已擊敗)' : ' (已揭示)') : ''}`);
  out.push(`傷 ${p.wounds}/${luminaryHP(s)}  光 ${p.light}  XP ${p.xp}  腐化 ${w.corruption}/${info.corruptionLimit}  完成 Treachery ${w.completedTreacheries.length}/${info.treacheryLimit}  手牌上限 ${handSize(s)} 產光 ${lightProduction(s)} 休息 ${restValue(s)}`);
  out.push(`威脅 ${threatBreakdown(s).total} (軌道格 ${w.threat})  抗性格 ${w.resistance}  距離框 ${w.distanceBox}  Shade 影響 ${w.shadeInfluence}  接戰數(目前光) ${engagementCount(s)}`);
  out.push(`地點 ${loc.name} (${loc.coordinates.east},${loc.coordinates.south}) {${cardTraits(s, w.location.id).join(',')}} 進度 ${w.location.progress}/${locationEV(s)}  Path ${w.location.paths} Obstacle ${w.location.obstacles} Threat ${w.location.threatTokens}${w.finalLocation ? `  最終地點 ${cardName(w.finalLocation)}` : `  最終候選 ${info.finalLocations.join('/')}`}`);
  if (t) out.push(`Treachery ${cardName(t)} ${w.treacheryProgress}/${treacheryPV(s)}：完成時 ${treacheryCard(t).when_completed} | legacy ${treacheryCard(t).legacy}`);
  if (w.completedTreacheries.length) out.push(`  已完成：${w.completedTreacheries.map(cardName).join('、')}`);
  out.push(`任務區 (左=後 → 右=前，黑暗 ${questDarkness(s).effective})：`);
  for (const id of w.questArea) out.push(`  ${enemy(s, id)}`);
  out.push(`玩家區：`);
  for (const id of w.playerArea) out.push(`  ${enemy(s, id)}`);
  const a = p.actionSet;
  out.push(`行動組：行動 ${a.action ? cardName(a.action) : '-'} / 攻擊 ${a.attack ? cardName(a.attack) : '-'} / 加成 ${a.booster ? cardName(a.booster) : '-'} / 探索 ${a.explore ? card(s, a.explore) : '-'}`);
  if (a.attack) out.push(`  AP ${apBreakdown(s).total} (${apBreakdown(s).type})  EP ${epBreakdown(s).total}`);
  out.push(`手牌 (${p.hand.length})：`);
  for (const id of p.hand) out.push(`  ${card(s, id)}`);
  out.push(`牌庫 ${p.deck.length}  棄牌堆 ${p.discard.length} (echo ${p.discard.length ? cardName(p.discard[p.discard.length - 1]) : '-'})  信標 ${p.beacons.map(cardName).join('、') || '-'}`);
  out.push(`永久加成 ${p.permBoosters.map(cardName).join('、') || '-'}  嗜好市場 ${p.hobbyMarket.map(cardName).join('、')}`);
  out.push(`技能：${p.skills.map((k) => `${k.name}[${k.cubeElement[0]}${k.exhausted ? '×' : ''}${skillUnlocked(s, k) ? (skillUsable(s, k) ? ' 可用' : ' 解鎖') : ''}]`).join(' ')}`);
  const ag = abilityGrowthStatus(s);
  const cg = characterGrowthStatus(s);
  out.push(`成長：能力 ${p.abilityGrowthPos} (下一格 ${ag.cost} XP)  角色 ${p.characterGrowthPos} (下一格 ${cg.cost} XP)`);
  return out;
}

function showDecision(d: Decision): string[] {
  const out = [`>> 決定 [${d.type}] (${d.rule}) ${d.prompt}`];
  if (d.options) for (const o of d.options) out.push(`   ${o.legal === false ? '✗' : '•'} ${o.id}  ${o.label}${o.reason ? ` (${o.reason})` : ''}${o.data?.max !== undefined ? ` max=${o.data.max}` : ''}`);
  if (d.cards) out.push(`   卡：${d.cards.map((c) => `${c}=${cardName(c)}`).join('  ')}`);
  if (d.min !== undefined || d.max !== undefined) out.push(`   範圍 ${d.min ?? 0}–${d.max ?? '?'}`);
  return out;
}

function print(g: Game, logPos: number): number {
  const v = view(g);
  const s = v.state;
  const logs = s.log.slice(logPos).map((l) => `  ${l.round}/${l.phase} [${l.rule}] ${l.text}`);
  console.log(['-- 日誌 --', ...logs].join('\n'));
  if (s.outcome) {
    console.log(`\n*** 遊戲結束：${s.outcome.result === 'win' ? '勝利' : '失敗'} (${s.outcome.rule}) ${s.outcome.reason}`);
    return s.log.length;
  }
  console.log(['', ...showState(s), ...(v.pending ? showDecision(v.pending) : [])].join('\n'));
  return s.log.length;
}

function parseAnswer(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

const [cmd, ...args] = process.argv.slice(2);
if (cmd === 'new') {
  const [lum, prof, hobby, perm, shade, diff, seed] = args;
  const mem = emptyMemory();
  const g = autoAdvance(
    newGame({ luminary: lum, profession: prof, hobby, permSource: perm, shade, difficulty: (diff ?? 'Blaze') as never, seed: Number(seed ?? 1) }),
    mem,
    settings,
  );
  const pos = print(g, 0);
  save(g, mem, pos);
} else if (!existsSync(FILE)) {
  console.log('沒有進行中的遊戲');
} else {
  const st = load();
  if (cmd === 'show') {
    console.log(['', ...showState(view(st.g).state), ...(view(st.g).pending ? showDecision(view(st.g).pending!) : [])].join('\n'));
  } else if (cmd === 'a') {
    const d = view(st.g).pending;
    const raw = args.join(' ');
    const ans = d?.type === 'choose' ? raw : parseAnswer(raw);
    const r = act(st.g, ans, st.mem, settings);
    const pos = print(r.game, st.logPos);
    save(r.game, r.mem, pos);
  } else if (cmd === 'text') {
    // 紙本玩家看得到的卡片文字：地點、Treachery、Shade、場上敵人、手牌與行動組
    const s = view(st.g).state;
    const a = s.player.actionSet;
    const ids = [s.world.location.id, ...(s.world.activeTreachery ? [s.world.activeTreachery] : []), ...s.world.questArea, ...s.world.playerArea, ...s.player.hand, a.action, a.attack, a.booster, a.explore, ...s.player.permBoosters, ...s.player.beacons, ...s.player.hobbyMarket];
    const seen = new Set<string>();
    for (const id of ids) {
      if (!id) continue;
      const n = cardName(id);
      if (seen.has(n)) continue;
      seen.add(n);
      const c = getCard(id) as { raw_text?: string };
      console.log(`[${n}] ${(c.raw_text ?? '').replace(/\s+/g, ' ')}`);
    }
  } else if (cmd === 'log') {
    const logs = view(st.g).state.log;
    for (const l of logs.slice(-Number(args[0] ?? 40))) console.log(`  ${l.round}/${l.phase} [${l.rule}] ${l.text}`);
  } else if (cmd === 'undo') {
    const r = undoToStop(st.g, st.mem, settings);
    print(r.game, 0);
    save(r.game, r.mem, view(r.game).state.log.length);
  }
}
