// 遊戲狀態模型 (01-state-and-data.md「遊戲狀態模型」)。
// 全部是可序列化的純資料：存檔 (localStorage) 與復原快照 (EE-26) 直接複製整份狀態。
// 實體操作一律轉成狀態 (DG-04、DG-05)，不模擬方塊或指示物。
import type { AttackType, Element } from './data';
import type { RngState } from './rng';
import type { GameConfig } from './config';
import type { SetupOptions } from './setup';

export type Phase =
  | 'staging'
  | 'actionSet'
  | 'engagement'
  | 'darkness'
  | 'explore'
  | 'attack'
  | 'defend'
  | 'refresh';

export const PHASES: Phase[] = [
  'staging',
  'actionSet',
  'engagement',
  'darkness',
  'explore',
  'attack',
  'defend',
  'refresh',
];

export const PHASE_NAMES: Record<Phase, string> = {
  staging: 'Staging',
  actionSet: 'Action Set',
  engagement: 'Engagement',
  darkness: 'Darkness',
  explore: 'Explore',
  attack: 'Attack',
  defend: 'Defend',
  refresh: 'Refresh',
};

export interface SkillState {
  name: string;
  mat: 'luminary' | 'profession';
  column: number;
  /** 在該欄中由上往下的位置 */
  row: number;
  cubeElement: Element;
  unlocked: boolean;
  /** 方塊翻到有 x 的面 (KC-18)，Refresh 不會重置 */
  exhausted: boolean;
  /** 本回合以橫置方式啟動 (KC-18)，到 P8-04 為止 */
  activatedByExhaust: boolean;
  /** 本回合使用次數 (EE-20) */
  usesThisRound: number;
}

export interface EnemyInPlay {
  id: string;
  wounds: number;
  progress: number;
  attachments: string[];
}

export interface LocationInPlay {
  id: string;
  progress: number;
  threatTokens: number;
  paths: number;
  obstacles: number;
  attachments: string[];
  /** 最終地點已探索 (FL-02 橫置) */
  explored: boolean;
}

export interface ActionSet {
  action: string | null;
  attack: string | null;
  booster: string | null;
  explore: string | null;
}

export interface PlayerState {
  luminary: string;
  profession: string;
  hobby: string;
  permSource: string;
  deck: string[]; // index 0 = 頂端
  hand: string[];
  discard: string[]; // 最後一張 = 頂端 = echo (KC-20)
  actionSet: ActionSet;
  permBoosters: string[];
  hobbyDeck: string[]; // index 0 = 頂端
  hobbyMarket: string[]; // 2 張正面
  permBoosterSource: string[];
  /** 已翻到進階面的卡 (KC-07 Upgrade，永久) */
  upgraded: string[];
  skills: SkillState[];
  wounds: number;
  xp: number;
  light: number;
  abilityGrowthPos: number;
  characterGrowthPos: number;
  beacons: string[];
  beaconMatReady: boolean;
  fetchReady: boolean;
  /** 牌庫頂端已被查看 (P7-02、OPEN-05) */
  deckTopKnown: boolean;
}

export interface WorldState {
  questArea: string[]; // index 0 = 左端 (後端)，最後 = 右端 (前端)
  playerArea: string[]; // index 0 = 左端 (後端)
  enemies: Record<string, EnemyInPlay>;
  duskDeck: string[];
  doomDeck: string[];
  duskDiscard: string[];
  doomDiscard: string[];
  treacheryDeck: string[];
  activeTreachery: string | null;
  treacheryProgress: number;
  completedTreacheries: string[];
  locationDeck: string[];
  locationDiscard: string[];
  /** 被開局規則移出遊戲的地點 (例：Greed Setup) */
  removedLocations: string[];
  location: LocationInPlay;
  newLocationTokenOnLocation: boolean;
  /** 本次移動延後的地點 (T1c，移動結束時放回地點牌庫底部) */
  deferred: string[];
  /** 移動中剛翻開、等待玩家決定的地點 (T1c) */
  revealedLocation: string | null;
  /** 走過的地點 (依移動順序)，地圖用 */
  visited: string[];
  shade: string;
  shadeRevealed: boolean;
  shadeDefeated: boolean;
  /** 本局的最終地點 (SH-02)；未抵達任何候選時為 null */
  finalLocation: string | null;
  /** 已抵達最終地點，等待下一個 Staging 結束時揭示 (SH-02) */
  shadeRevealPending: boolean;
  corruption: number;
  distanceBox: number;
  threat: number;
  resistance: number;
  shadeInfluence: number;
  /** 已探索完成的地點數 (T4 的可靠計數，不受 Shade 影響墊上限影響) */
  exploredCount: number;
}

/** EE-06 回合內持續效果：登記的效果積木 + 參數 + 到期時間 */
export interface LingeringEffect {
  uid: number;
  key: string; // 效果定義的 key (effects/registry)
  sourceId: string;
  /** 顯示用的來源名稱 */
  sourceName: string;
  params: Record<string, unknown>;
  until: 'round' | 'discardStep' | 'game';
}

export interface RoundState {
  activeElement: Element | null;
  attackType: AttackType | null;
  /** 本階段已分配出去的 AP (P6-02) */
  apSpent: number;
  /** 本階段已用 AP 攻擊過的敵人 (P6-02 new enemies) */
  attackedThisPhase: string[];
  /** 本回合已攻擊過玩家的敵人 (P7-01) */
  attackedPlayer: string[];
  ep: number;
  exploreEP: number;
  cover: number;
  /** 本回合每個效果來源的使用次數 (EE-20、EE-21) */
  usage: Record<string, number>;
  /** 本回合花過的光 (免費光 EE-23 用) */
  lightSpent: number;
  freeLightUsed: boolean;
  disarmed: string[];
  /** 本回合防禦用掉的卡數 (Useful Rage 等) */
  defendedWithCount: number;
  /** 本回合在 Darkness 棄掉的信標數 (P4-01) */
  beaconsDiscardedForExplore: number;
  /** 本回合加的特質 (KC-16) */
  grantedTraits: { target: string; trait: string }[];
  /** 本回合已結算的「階段中強制效果」(EE-18a) 與開始/結束效果 */
  resolvedPhaseEffects: string[];
  /** 本回合的數值修正 (EE-06 + EE-01)：例 Ember Strike +4 MainAttack */
  mods: { stat: string; value: number; sourceId: string }[];
  /** Shade 揭示回合的威脅加值 (SH-03) */
  shadeInfluenceThreat: number;
  /** 本回合要揭示 Shade (SH-02) */
  revealShadeThisRound: boolean;
}

export interface LogEntry {
  round: number;
  phase: Phase | 'setup';
  rule: string;
  text: string;
}

export interface Outcome {
  result: 'win' | 'lose';
  rule: string;
  reason: string;
}

export interface GameState {
  /** 開局選擇 (round 0 時依此執行開局) */
  setup: SetupOptions;
  config: GameConfig;
  rng: RngState;
  /** 每翻開一次新資訊 (翻牌、抽牌、洗牌、查看) 加 1；UI-02 用來清空復原紀錄 */
  infoSeq: number;
  round: number;
  phase: Phase;
  player: PlayerState;
  world: WorldState;
  roundState: RoundState;
  lingering: LingeringEffect[];
  nextUid: number;
  log: LogEntry[];
  outcome: Outcome | null;
}

export function emptyRoundState(): RoundState {
  return {
    activeElement: null,
    attackType: null,
    apSpent: 0,
    attackedThisPhase: [],
    attackedPlayer: [],
    ep: 0,
    exploreEP: 0,
    cover: 0,
    usage: {},
    lightSpent: 0,
    freeLightUsed: false,
    disarmed: [],
    defendedWithCount: 0,
    beaconsDiscardedForExplore: 0,
    grantedTraits: [],
    resolvedPhaseEffects: [],
    mods: [],
    shadeInfluenceThreat: 0,
    revealShadeThisRound: false,
  };
}
