// 世界：探索完成與移動 (P5-04、P5-05、T1 ~ T5、FL-02/03、SH-02)。
import type { Ctx, Gen, Option } from './core';
import { cardName, locationCard } from './data';
import { activeEffects } from './effects';
import {
  beaconLimit,
  canTravelTo,
  distanceBreakdown,
  fetchCost,
  isFinalCandidate,
  isFinalLocation,
  locationEV,
  travelCost,
} from './calc';
import {
  advanceResistance,
  advanceThreat,
  emit,
  emitWill,
  gainXP,
  locName,
  runEffect,
  spendXP,
} from './ops';
import { shuffle } from './rng';
import { shadeInfluenceSpaces, startBoxForCorruption } from './tracks';
import type { LocationInPlay } from './types';

export function newLocation(id: string): LocationInPlay {
  return { id, progress: 0, threatTokens: 0, paths: 0, obstacles: 0, attachments: [], explored: false };
}

/** 在目前地點放 Progress；P5-05 任何時候因此完全探索都立即移動 */
export function* placeLocationProgress(ctx: Ctx, n: number, rule: string, why: string): Gen {
  if (n <= 0) return;
  // 取代效果 (Sol Starcaster：前 2 個改放到 Treachery)
  const will = yield* emitWill(ctx, { t: 'WillPlaceLocationProgress', n });
  n = will.n as number;
  if (n <= 0) return;
  const loc = ctx.s.world.location;
  loc.progress += n;
  ctx.log(rule, `${locName(loc.id)} Progress +${n} (${why})，共 ${loc.progress}/${locationEV(ctx.s)}`);
  yield* emit(ctx, { t: 'ProgressPlaced', target: 'location', n });
  yield* checkExplored(ctx);
}

/** Envy：在玩家區的地點放 Progress；探索完成就移出遊戲 (附著的敵人解除附著)，獲得 XP */
export function* placeEnvyProgress(ctx: Ctx, id: string, n: number): Gen {
  const w = ctx.s.world;
  const loc = w.envyLocations.find((l) => l.id === id);
  if (!loc || n <= 0) return;
  loc.progress += n;
  const ev = locationEV(ctx.s, id);
  ctx.log('SH-01', `玩家區的 ${cardName(id)} Progress +${n}，共 ${loc.progress}/${ev}`);
  if (loc.progress < ev) return;
  w.envyLocations = w.envyLocations.filter((l) => l.id !== id);
  for (const [e, l] of Object.entries(w.envyAttach)) if (l === id) delete w.envyAttach[e];
  for (const a of loc.attachments) ctx.s.player.discard.push(a);
  w.removedLocations.push(id);
  ctx.log('SH-01', `玩家區的 ${cardName(id)} 已探索，移出遊戲`);
  yield* gainXP(ctx, locationCard(id).xp_reward, 'SH-01', `探索 ${cardName(id)}`);
  yield* emit(ctx, { t: 'LocationExplored', location: id, final: false, envy: true });
}

/** P5-03 / P5-04 / FL-02 / FL-03 */
export function* checkExplored(ctx: Ctx): Gen {
  const s = ctx.s;
  const loc = s.world.location;
  const ev = locationEV(s);
  if (isFinalLocation(s, loc.id)) {
    if (!loc.explored && loc.progress >= ev) {
      loc.explored = true;
      ctx.log('FL-02', `最終地點 ${locName(loc.id)} 已探索 (${loc.progress}/${ev})：橫置，不移動、不獲得 XP`);
      yield* emit(ctx, { t: 'LocationExplored', location: loc.id, final: true });
    } else if (loc.explored && loc.progress < ev) {
      loc.explored = false;
      ctx.log('FL-03', `最終地點 ${locName(loc.id)} 恢復為未探索 (${loc.progress}/${ev})`);
    }
    return;
  }
  if (loc.progress < ev) return;
  const card = locationCard(loc.id);
  ctx.log('P5-04', `${card.name} 已探索 (${loc.progress}/${ev})`);
  s.world.exploredCount++;
  yield* gainXP(ctx, card.xp_reward, 'P5-04', `探索 ${card.name}`);
  yield* emit(ctx, { t: 'LocationExplored', location: loc.id, final: false });
  yield* travel(ctx, true);
}

/** T1a Fetch 的條件 (DG-10 預覽也用) */
export function fetchStatus(ctx: { s: Ctx['s'] }, explored: boolean): { ok: boolean; reason: string } {
  const s = ctx.s;
  const c = locationCard(s.world.location.id).coordinates;
  if (!s.player.fetchReady) return { ok: false, reason: 'Fetch 已用過 (每局 1 次)' };
  if (!explored) return { ok: false, reason: '只能在探索完成後使用' };
  if (c.east + c.south < 6) return { ok: false, reason: `${locName(s.world.location.id)} 座標和 = ${c.east + c.south} < 6` };
  if (s.player.xp < fetchCost(s)) return { ok: false, reason: `需要 ${fetchCost(s)} XP` };
  if (!s.world.locationDeck.length) return { ok: false, reason: '地點牌庫是空的' };
  return { ok: true, reason: '' };
}

function travelOption(ctx: Ctx, id: string, deferred: number): Option {
  const why = canTravelTo(ctx.s, id);
  const d = distanceBreakdown(ctx.s, id, deferred);
  return { id, label: `${locName(id)} (距離 ${d.total})`, legal: !why, reason: why ?? undefined, data: { distance: d.total } };
}

/** P5-T 移動。explored = 出發地點是否已完全探索 (T4) */
export function* travel(ctx: Ctx, explored: boolean): Gen {
  const s = ctx.s;
  const w = s.world;
  const p = s.player;
  ctx.log('P5-T', `開始移動 (從 ${locName(w.location.id)})`);
  yield* emit(ctx, { t: 'TravelStarted' });

  // ---- T1 選擇目的地
  const fs = fetchStatus(ctx, explored);
  const beaconLegal = p.beacons.some((b) => !canTravelTo(s, b));
  const method = yield* ctx.choose('T1', '選擇移動方式', [
    { id: 'fetch', label: `Fetch (${fetchCost(s)} XP)`, legal: fs.ok, reason: fs.ok ? undefined : fs.reason, rule: 'T1a' },
    { id: 'beacon', label: '前往信標', legal: beaconLegal, reason: beaconLegal ? undefined : '沒有可前往的信標', rule: 'T1b' },
    { id: 'seek', label: '尋找目的地', rule: 'T1c' },
  ]);

  let dest: string;
  w.deferred = [];
  const deferred = w.deferred; // T1c 延後的地點存在狀態裡 (畫面要顯示)
  let via: string = method;
  if (method === 'fetch') {
    // T1a
    p.fetchReady = false;
    yield* spendXP(ctx, fetchCost(s), 'T1a', 'Fetch');
    ctx.revealInfo(); // 查看地點牌庫
    dest = yield* ctx.choose(
      'T1a',
      '從地點牌庫選擇目的地',
      w.locationDeck.map((id) => travelOption(ctx, id, 0)),
    );
    w.locationDeck = w.locationDeck.filter((x) => x !== dest);
    ctx.revealInfo();
  } else if (method === 'beacon') {
    // T1b
    dest = yield* ctx.choose('T1b', '選擇信標', p.beacons.map((id) => travelOption(ctx, id, 0)));
    p.beacons = p.beacons.filter((x) => x !== dest);
  } else {
    // T1c
    dest = '';
    while (!dest) {
      if (!w.locationDeck.length) {
        // OPEN-06：從已翻開 (延後) 的卡或信標中選；都沒有時把地點棄牌堆洗成新牌庫
        const choices = [...deferred, ...p.beacons].filter((id) => !canTravelTo(s, id));
        if (choices.length) {
          dest = yield* ctx.choose(
            'OPEN-06',
            '地點牌庫已空：選擇目的地',
            choices.map((id) => travelOption(ctx, id, deferred.filter((x) => x !== id).length)),
          );
          if (deferred.includes(dest)) deferred.splice(deferred.indexOf(dest), 1);
          else p.beacons = p.beacons.filter((x) => x !== dest);
          break;
        }
        if (!w.locationDiscard.length) throw new Error('沒有任何地點可以前往');
        const [nd, rng] = shuffle(w.locationDiscard, s.rng);
        s.rng = rng;
        w.locationDeck = nd;
        w.locationDiscard = [];
        ctx.revealInfo();
        ctx.log('OPEN-06', '地點棄牌堆洗成新牌庫');
      }
      let card = w.locationDeck.shift()!;
      if (ctx.s.roundState.flags.burningBright && w.locationDeck.length) {
        // Burning Bright：每次抽 3 張，選 1 張當作抽到的卡，其他 2 張 cycle
        const more = w.locationDeck.splice(0, 2);
        ctx.revealInfo();
        const all = [card, ...more];
        card = yield* ctx.choose('T1c', 'Burning Bright：選 1 張當作抽到的地點 (其他放到地點牌庫底部)', all.map((id) => ({ id, label: locName(id) })));
        w.locationDeck.push(...all.filter((x) => x !== card));
      }
      w.revealedLocation = card;
      ctx.revealInfo();
      ctx.log('T1c', `翻開地點 ${locName(card)}`);
      yield* emit(ctx, { t: 'LocationRevealed', location: card });
      const go = travelOption(ctx, card, deferred.length);
      const canSave = p.beacons.length < beaconLimit(s);
      // 緊急信標移動：保存或延後這張之後，必須有可以前往的信標
      const legalBeacons = p.beacons.filter((b) => !canTravelTo(s, b));
      const emergencyOk = legalBeacons.length > 0 || (canSave && !canTravelTo(s, card));
      const choice = yield* ctx.choose('T1c', `${locName(card)}：前往、保存為信標、延後或緊急信標移動`, [
        { ...go, id: 'travel', label: `前往 ${go.label}`, rule: 'T1c' },
        { id: 'save', label: '保存為信標', legal: canSave, reason: canSave ? undefined : `信標已滿 (${beaconLimit(s)})`, rule: 'T1c' },
        { id: 'defer', label: '延後 (距離 +1)', rule: 'T1c' },
        {
          id: 'emergency',
          label: '緊急信標移動',
          legal: emergencyOk,
          reason: emergencyOk ? undefined : '沒有可以前往的信標',
          rule: 'T1c',
        },
      ]);
      w.revealedLocation = null;
      if (choice === 'travel') {
        dest = card;
      } else if (choice === 'save') {
        p.beacons.push(card);
        ctx.log('T1c', `保存信標 ${locName(card)} (${p.beacons.length}/${beaconLimit(s)})`);
        yield* emit(ctx, { t: 'BeaconSaved', location: card });
      } else if (choice === 'defer') {
        deferred.push(card);
        ctx.log('T1c', `延後 ${locName(card)} (延後 ${deferred.length})`);
        yield* emit(ctx, { t: 'LocationDeferred', location: card });
      } else {
        // T1c 第 4 項 緊急信標移動：先保存或延後這張，再付代價，最後選信標
        const how = yield* ctx.choose('T1c', `緊急信標移動：${locName(card)} 要保存還是延後`, [
          { id: 'save', label: '保存為信標', legal: canSave, reason: canSave ? undefined : '信標已滿' },
          { id: 'defer', label: '延後', legal: legalBeacons.length > 0, reason: legalBeacons.length > 0 ? undefined : '延後後沒有可以前往的信標' },
        ]);
        if (how === 'save') p.beacons.push(card);
        else deferred.push(card);
        const pay = yield* ctx.choose('T1c', '緊急信標移動的代價', [
          { id: 'xp', label: '支付 3 XP', legal: p.xp >= 3, reason: p.xp >= 3 ? undefined : 'XP 不足 3' },
          { id: 'threat', label: '威脅軌道 +2' },
        ]);
        if (pay === 'xp') yield* spendXP(ctx, 3, 'T1c', '緊急信標移動');
        else yield* advanceThreat(ctx, 2, 'T1c', '緊急信標移動');
        dest = yield* ctx.choose('T1c', '緊急信標移動：選擇信標', p.beacons.map((id) => travelOption(ctx, id, deferred.length)));
        p.beacons = p.beacons.filter((x) => x !== dest);
        via = 'emergency';
      }
    }
  }

  // ---- T2 結算距離 (結算前的選擇性減少：Foresight+、Choose Wisely、Lay of the Land+ 等)
  const d = distanceBreakdown(s, dest, deferred.length);
  const dw = yield* emitWill(ctx, { t: 'WillResolveDistance', dest, distance: d.total, min: d.minimum, deferred: deferred.length, from: w.location.id });
  const distance = Math.max(dw.min as number, dw.distance as number);
  const cost = travelCost(s, distance);
  ctx.log(
    'T2a',
    `距離 ${distance} = 地理 ${d.geographic} + Obstacle ${d.obstacles} − Path ${d.paths} + 延後 ${d.deferred}${d.effects ? ` + 效果 ${d.effects}` : ''}${distance !== d.total ? ` (選擇性減少 ${d.total - distance})` : ''}`,
  );
  ctx.log('T2b', `距離方塊 box ${cost.fromBox} → ${cost.toBox}：威脅 +${cost.threat}、抗性 +${cost.resistance}`);
  yield* advanceThreat(ctx, cost.threat, 'T2b', '移動');
  yield* advanceResistance(ctx, cost.resistance, 'T2b', '移動');
  w.distanceBox = startBoxForCorruption(s);
  ctx.log('T2b', `距離方塊重設到 box ${w.distanceBox} (腐化 ${w.corruption})`);
  yield* emit(ctx, { t: 'DistanceResolved', distance, dest, from: w.location.id });

  // ---- T3 抵達
  const old = w.location;
  // T3a 棄掉已探索地點的 Threat token、Progress、附著卡 (KC-17)
  for (const a of old.attachments) s.player.discard.push(a);
  w.locationDiscard.push(old.id);
  // T3b 每 2 個 Path 在新地點放 1 個 Threat token
  const t3b = Math.floor(old.paths / 2);
  w.location = newLocation(dest);
  w.location.threatTokens = t3b + cost.threatTokens;
  w.newLocationTokenOnLocation = true;
  w.visited.push(dest);
  w.arrivalRound = s.round;
  ctx.log('T3a', `抵達 ${locName(dest)}；${locName(old.id)} 進入地點棄牌堆`);
  if (t3b) ctx.log('T3b', `舊地點 ${old.paths} 個 Path → 新地點 Threat token +${t3b}`);
  if (cost.threatTokens) ctx.log('T2c', `距離溢出 ${cost.overflow}：新地點 Threat token +${cost.threatTokens}`);
  // T3c
  s.player.beaconMatReady = true;
  // T3d
  if (deferred.length) {
    w.locationDeck.push(...deferred);
    ctx.log('T3d', `延後的 ${deferred.map(locName).join('、')} 放到地點牌庫底部`);
  }
  w.deferred = [];
  // T4 出發地點已完全探索時 Shade 影響 +1
  if (explored) {
    const max = shadeInfluenceSpaces(s).length - 1;
    w.shadeInfluence = Math.min(max, w.shadeInfluence + 1); // OPEN-09 停在最後一格
    ctx.log('T4', `Shade Influence → ${w.shadeInfluence}`);
  }
  // T5 Upon Arrival；最終地點 (SH-02)
  if (!w.finalLocation && isFinalCandidate(s, dest)) {
    w.finalLocation = dest;
    if (!w.shadeRevealed) w.shadeRevealPending = true;
    ctx.log('SH-02', `${locName(dest)} 成為本局的最終地點；下一個 Staging 結束時揭示 ${w.shade}`);
  }
  if (w.shade === 'Envy' && isFinalCandidate(s, dest) && !w.shadeRevealed && !ctx.s.roundState.flags.envySearched) envyLocations(ctx);
  const arrival = activeEffects(s).find((x) => x.src.cardId === dest && x.src.kind === 'location' && !x.src.params?.envy && x.def.uponArrival);
  if (arrival) {
    ctx.log('T5', `${locName(dest)} Upon Arrival`);
    yield* runEffect(ctx, arrival.src, arrival.def, () => arrival.def.uponArrival!(ctx, arrival.src));
  }
  yield* emit(ctx, { t: 'Arrived', location: dest, via, from: old.id, distance });
}

const ENVY_LOCATIONS = ['Eldirith Mountains', 'Sheer Valley', 'Terra Lake'];

/** Envy 背面「When You Travel to a Final Location」：把 3 個地點放到玩家區 */
function envyLocations(ctx: Ctx): void {
  const s = ctx.s;
  const w = s.world;
  if (w.envyLocations.length || w.removedLocations.some((id) => ENVY_LOCATIONS.includes(locName(id)))) return;
  const found: string[] = [];
  for (const name of ENVY_LOCATIONS) {
    const inDeck = w.locationDeck.find((id) => locName(id) === name);
    const inDiscard = w.locationDiscard.find((id) => locName(id) === name);
    const inBeacon = s.player.beacons.find((id) => locName(id) === name);
    const id = inDeck ?? inDiscard ?? inBeacon;
    if (!id || id === w.location.id) continue;
    w.locationDeck = w.locationDeck.filter((x) => x !== id);
    w.locationDiscard = w.locationDiscard.filter((x) => x !== id);
    s.player.beacons = s.player.beacons.filter((x) => x !== id);
    w.envyLocations.push(newLocation(id));
    found.push(name);
  }
  ctx.revealInfo();
  ctx.log('SH-01', `Envy：${found.join('、') || '沒有找到地點'} 放到玩家區 (效果生效到探索完成)`);
}
