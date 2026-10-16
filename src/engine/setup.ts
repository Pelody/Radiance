// 開局 (04-setup-and-difficulty.md SU-01 ~ SU-22)。
import type { Ctx, Gen } from './core';
import { makeConfig, type Difficulty, type GameConfig } from './config';
import {
  CARDS,
  cardName,
  findByName,
  locationCard,
  ownerBasicCards,
  skillMat,
  type Element,
  type EnemyData,
} from './data';
import { revealEnemy, revealTreachery } from './ops';
import { makeRng, shuffle, type RngState } from './rng';
import { emptyRoundState, type GameState, type SkillState } from './types';
import { unlockSkill } from './window';
import { newLocation } from './world';
import { enemyDarkness } from './calc';

export interface FixedSetup {
  /** 技能方塊與解鎖狀態 (依名稱) */
  skills?: { name: string; element: Element; unlocked: boolean }[];
  /** 牌庫順序 (卡名，頂端在前)；未指定則洗牌 */
  deck?: string[];
  duskDeck?: string[];
  doomDeck?: string[];
  activeTreachery?: string;
  locationDeck?: string[];
  hobbyDeck?: string[];
}

export interface SetupOptions {
  luminary: string;
  profession: string;
  hobby: string;
  permSource: string;
  shade: string;
  difficulty?: Difficulty;
  seed?: number;
  config?: Partial<GameConfig>;
  fixed?: FixedSetup;
}

function take<T>(rng: RngState, items: T[], fixed: boolean): [T[], RngState] {
  return fixed ? [items, rng] : shuffle(items, rng);
}

/** 依名稱取 id (同名多張時取第一張還沒用過的) */
function idsByNames(names: string[], pool: string[]): string[] {
  const left = pool.slice();
  return names.map((n) => {
    const i = left.findIndex((id) => cardName(id) === n);
    if (i < 0) throw new Error(`fixed setup: ${n} 不在牌堆中`);
    return left.splice(i, 1)[0];
  });
}

/** 建立開局前的空白狀態；實際開局步驟在 setupGen 中 (需要玩家決定 SU-03、SU-05) */
export function initialState(o: SetupOptions): GameState {
  const config = makeConfig(o.difficulty ?? 'Blaze', o.config);
  return {
    setup: o,
    config,
    rng: makeRng(o.seed ?? 1),
    infoSeq: 0,
    round: 0,
    phase: 'staging',
    player: {
      luminary: o.luminary,
      profession: o.profession,
      hobby: o.hobby,
      permSource: o.permSource,
      deck: [],
      hand: [],
      discard: [],
      actionSet: { action: null, attack: null, booster: null, explore: null },
      permBoosters: [],
      hobbyDeck: [],
      hobbyMarket: [],
      permBoosterSource: [],
      upgraded: [],
      skills: [],
      wounds: 0,
      xp: 0,
      light: 20,
      abilityGrowthPos: 0,
      characterGrowthPos: 0,
      beacons: [],
      beaconMatReady: true,
      fetchReady: true,
      deckTopKnown: false,
    },
    world: {
      questArea: [],
      playerArea: [],
      enemies: {},
      duskDeck: [],
      doomDeck: [],
      duskDiscard: [],
      doomDiscard: [],
      treacheryDeck: [],
      activeTreachery: null,
      treacheryProgress: 0,
      completedTreacheries: [],
      locationDeck: [],
      locationDiscard: [],
      removedLocations: [],
      location: newLocation(findByName('location', 'Farhome').id),
      newLocationTokenOnLocation: true,
      deferred: [],
      revealedLocation: null,
      visited: [],
      shade: o.shade,
      shadeRevealed: false,
      shadeDefeated: false,
      finalLocation: null,
      shadeRevealPending: false,
      corruption: 1,
      distanceBox: 0,
      threat: 0,
      resistance: 0,
      shadeInfluence: 0,
      exploredCount: 0,
    },
    roundState: emptyRoundState(),
    lingering: [],
    nextUid: 1,
    log: [],
    outcome: null,
  };
}

export function* setupGen(ctx: Ctx, o: SetupOptions): Gen {
  const s = ctx.s;
  const p = s.player;
  const w = s.world;
  const fx = o.fixed ?? {};
  const log = (rule: string, text: string) => ctx.log(rule, text);
  let rng = s.rng;

  // SU-01 / SU-02 技能方塊：Earth、Wind、Fire 各 4 顆隨機分配，Ready 面、全部鎖定
  const lum = skillMat(o.luminary);
  const prof = skillMat(o.profession);
  const layout: Omit<SkillState, 'cubeElement' | 'unlocked'>[] = [];
  for (const [mat, kind] of [
    [lum, 'luminary'],
    [prof, 'profession'],
  ] as const) {
    const rowInCol: Record<number, number> = {};
    for (const sk of mat.skills) {
      const row = rowInCol[sk.column] ?? 0;
      rowInCol[sk.column] = row + 1;
      layout.push({ name: sk.name, mat: kind, column: sk.column, row, exhausted: false, activatedByExhaust: false, usesThisRound: 0 });
    }
  }
  let cubes: Element[] = ['Earth', 'Earth', 'Earth', 'Earth', 'Wind', 'Wind', 'Wind', 'Wind', 'Fire', 'Fire', 'Fire', 'Fire'];
  if (fx.skills) {
    cubes = layout.map((l) => {
      const f = fx.skills!.find((x) => x.name === l.name);
      if (!f) throw new Error(`fixed setup: 技能 ${l.name} 沒有指定方塊`);
      return f.element;
    });
  } else {
    [cubes, rng] = shuffle(cubes, rng);
  }
  p.skills = layout.map((l, i) => ({ ...l, cubeElement: cubes[i], unlocked: !!fx.skills?.find((x) => x.name === l.name)?.unlocked }));
  log('SU-02', `技能方塊：${p.skills.map((k) => `${k.name} ${k.cubeElement[0]}`).join('、')}`);

  // SU-04 牌庫 = luminary 6 張 + profession 6 張基礎面
  const own = [...ownerBasicCards(o.luminary), ...ownerBasicCards(o.profession)].map((c) => c.id);
  if (fx.deck) p.deck = idsByNames(fx.deck, own);
  else [p.deck, rng] = shuffle(own, rng);

  // SU-03 從 luminary 最左欄 2 個技能選 1 個解鎖
  if (!p.skills.some((k) => k.unlocked)) {
    yield* unlockSkill(
      ctx,
      'SU-03',
      p.skills.filter((k) => k.mat === 'luminary' && k.column === 0),
    );
  }
  // SU-05 抽 7 張，選 1 張放探索卡槽 (不付光費)，其餘為手牌
  p.hand = p.deck.splice(0, 7);
  ctx.revealInfo();
  const ex = yield* ctx.choose(
    'SU-05',
    '選 1 張放到探索卡槽',
    p.hand.map((id) => ({ id, label: cardName(id) })),
  );
  p.hand = p.hand.filter((x) => x !== ex);
  p.actionSet.explore = ex;
  log('SU-05', `探索卡：${cardName(ex)}；手牌 ${p.hand.length} 張`);

  // SU-06 嗜好牌庫與市場；SU-07 永久加成來源
  const hobby = ownerBasicCards(o.hobby).map((c) => c.id);
  if (fx.hobbyDeck) p.hobbyDeck = idsByNames(fx.hobbyDeck, hobby);
  else [p.hobbyDeck, rng] = take(rng, hobby, !!fx.deck);
  p.hobbyMarket = p.hobbyDeck.splice(0, 2);
  p.permBoosterSource = ownerBasicCards(o.permSource).map((c) => c.id);
  log('SU-06', `嗜好：${o.hobby}；市場 ${p.hobbyMarket.map(cardName).join('、')}`);
  log('SU-07', `永久加成來源：${o.permSource}`);

  // SU-08 ~ SU-11 腐化墊與成長墊 (DF：High Radiance 方塊前進)
  if (s.config.advanceCubes) {
    w.corruption = 2;
    w.threat = 1;
    w.resistance = 5;
  }
  w.distanceBox = 0; // SU-09 / OPEN-18 開局放最左邊的框
  p.light = 20;
  p.xp = s.config.startXP;
  log('SU-09', `腐化 ${w.corruption}、威脅 ${w.threat}、抗性 ${w.resistance}、光 ${p.light}${p.xp ? `、XP ${p.xp}` : ''}`);

  // SU-12 敵人牌庫
  const enemies = CARDS.filter((c) => c.type === 'enemy') as EnemyData[];
  const dusk = enemies.filter((e) => e.class === 'Dusk').map((e) => e.id);
  const doom = enemies.filter((e) => e.class === 'Doom').map((e) => e.id);
  if (fx.duskDeck) w.duskDeck = idsByNames(fx.duskDeck, dusk);
  else [w.duskDeck, rng] = shuffle(dusk, rng);
  if (fx.doomDeck) w.doomDeck = idsByNames(fx.doomDeck, doom);
  else [w.doomDeck, rng] = shuffle(doom, rng);

  // SU-14 Treachery
  const tre = CARDS.filter((c) => c.type === 'treachery').map((c) => c.id);
  if (fx.activeTreachery) {
    const first = idsByNames([fx.activeTreachery], tre)[0];
    w.treacheryDeck = [first, ...tre.filter((x) => x !== first)];
  } else [w.treacheryDeck, rng] = shuffle(tre, rng);

  // SU-16 地點：Farhome 放一旁，其餘洗成地點牌庫；Shade 指示移除的地點在此移除
  const farhome = w.location.id;
  let locs = CARDS.filter((c) => c.type === 'location' && c.id !== farhome).map((c) => c.id);
  if (o.shade === 'Greed' && !s.config.ignoreShadeSetup) {
    // Greed Setup：移除座標含 6 的地點
    const removed = locs.filter((id) => {
      const c = locationCard(id).coordinates;
      return c.east === 6 || c.south === 6;
    });
    w.removedLocations = removed;
    locs = locs.filter((id) => !removed.includes(id));
    log('SU-16', `Greed Setup：移除 ${removed.length} 個座標含 6 的地點`);
  }
  if (fx.locationDeck) w.locationDeck = idsByNames(fx.locationDeck, locs);
  else [w.locationDeck, rng] = shuffle(locs, rng);
  s.rng = rng;

  // SU-17 / SU-18 / SU-19
  w.newLocationTokenOnLocation = true;
  p.fetchReady = true;
  p.beaconMatReady = true;
  w.shadeInfluence = 0;
  w.visited = [farhome];
  log('SU-17', 'Farhome 成為目前地點');

  // SU-13 從 Dusk 牌庫翻開直到累計黑暗 ≥ 3 (⚠ INTERP：When Revealed 也結算)
  let dark = 0;
  while (dark < 3) {
    const id = yield* revealEnemy(ctx, 'Dusk', 'SU-13');
    if (!id) break;
    dark += enemyDarkness(s, id);
  }
  // SU-14 翻開第一張 Treachery
  yield* revealTreachery(ctx);
  log('SU-15', `Shade：${o.shade}`);

  // SU-22 開局生效的效果：luminary 特殊規則 (Wisdom 免費解鎖職業墊最右邊的技能)
  if (o.luminary === 'Wisdom') {
    const right = p.skills.find((k) => k.mat === 'profession' && k.column === 2);
    if (right) {
      right.unlocked = true;
      log('SU-22', `Wisdom：解鎖 ${right.name}`);
    }
  }
  s.round = 1;
  s.phase = 'staging';
  ctx.log('P1', '第 1 回合開始');
}
