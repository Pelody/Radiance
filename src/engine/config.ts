// 遊戲設定：難度 (DF)、OPEN 項目的預設值 (90-open-items.md，做成可切換)。
// ⚠ INTERP 的解讀集中在這裡或單一函式，方便日後修改 (spec/README.md 第 5 點)。

export type Difficulty = 'Ember' | 'Spark' | 'Flame' | 'Blaze' | 'Radiant' | 'High Radiance';
export type Side = 'normal' | 'hard';

export interface OpenSettings {
  /** OPEN-03 敵人牌庫翻完：棄牌堆洗成新牌庫 */
  reshuffleEnemyDiscard: boolean;
  /** OPEN-12 Shadow 介入條件在 Staging 中成立：這個 Staging 結束就進場 */
  shadowEntersSameStaging: boolean;
  /** OPEN-13 Special Victory 任務：決戰開始後不能再接 (期限，不強制) */
  specialVictoryIsDeadline: boolean;
  /** OPEN-14 Baron 座標地點不存在：重抽 */
  baronRedrawMissing: boolean;
  /** OPEN-15 支線任務的 EP 只能在 Darkness 分配時付 */
  questEPOnlyInDarkness: boolean;
  /** OPEN-17 夥伴攻擊不算「你的攻擊」 */
  companionAttackIsYourAttack: boolean;
}

export const DEFAULT_OPEN: OpenSettings = {
  reshuffleEnemyDiscard: true,
  shadowEntersSameStaging: true,
  specialVictoryIsDeadline: true,
  baronRedrawMissing: true,
  questEPOnlyInDarkness: true,
  companionAttackIsYourAttack: false,
};

export interface GameConfig {
  difficulty: Difficulty;
  /** 成長墊、腐化墊 (SU-08、DF) */
  trackSide: Side;
  shadeInfluenceSide: Side;
  /** High Radiance：腐化 +1、威脅 +1、抗性 +5 (DF) */
  advanceCubes: boolean;
  startXP: number;
  /** 測試劇本用：忽略 Shade 卡 Setup / Special (Example Turn Guide 的指示) */
  ignoreShadeSetup: boolean;
  ignoreShadeSpecial: boolean;
  open: OpenSettings;
}

/** DF 預設難度 [p.70–75]。夥伴屬選用模組 (11)，這裡只記設定值。 */
export function difficultyConfig(d: Difficulty): Omit<GameConfig, 'ignoreShadeSetup' | 'ignoreShadeSpecial' | 'open'> {
  switch (d) {
    case 'Ember':
      return { difficulty: d, trackSide: 'normal', shadeInfluenceSide: 'normal', advanceCubes: false, startXP: 6 };
    case 'Spark':
      return { difficulty: d, trackSide: 'normal', shadeInfluenceSide: 'normal', advanceCubes: false, startXP: 3 };
    case 'Flame':
    case 'Blaze':
      return { difficulty: d, trackSide: 'normal', shadeInfluenceSide: 'normal', advanceCubes: false, startXP: 0 };
    case 'Radiant':
      return { difficulty: d, trackSide: 'hard', shadeInfluenceSide: 'hard', advanceCubes: false, startXP: 0 };
    case 'High Radiance':
      return { difficulty: d, trackSide: 'hard', shadeInfluenceSide: 'hard', advanceCubes: true, startXP: 0 };
  }
}

export function makeConfig(d: Difficulty = 'Blaze', extra: Partial<GameConfig> = {}): GameConfig {
  return {
    ...difficultyConfig(d),
    ignoreShadeSetup: false,
    ignoreShadeSpecial: false,
    open: { ...DEFAULT_OPEN },
    ...extra,
  };
}
