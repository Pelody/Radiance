// 引擎核心：待決策 (EE-24)、結算堆疊 (EE-09 ~ EE-14)、事件 (EE-07/08)、日誌 (DG-02)。
//
// 流程程式碼寫成 generator：遇到需要玩家決定的地方就 `yield` 一個 Decision，
// 由驅動程式 (game.ts) 用玩家的 action 回答。整個流程是確定性的 (EE-25)，
// 所以「狀態快照 + 之後的 action 列表」就能重建任何時點。
import type { GameState, LogEntry, Phase } from './types';

export type Answer = unknown;

export interface Option {
  id: string;
  label: string;
  /** 不合法的選項仍列出 (DG-16 顯示原因)，但不能選 */
  legal?: boolean;
  reason?: string;
  rule?: string;
  data?: Record<string, unknown>;
}

/** EE-24 型別化的待決策 */
export interface Decision {
  type: 'choose' | 'window' | 'actionSet' | 'number' | 'cards' | 'order';
  rule: string;
  prompt: string;
  options?: Option[];
  min?: number;
  max?: number;
  /** cards / order：可選的卡 */
  cards?: string[];
  data?: Record<string, unknown>;
  /** 只有一個合法選項時自動選擇 (EE-24)；false = 一定要問 */
  autoSingle?: boolean;
  /** 驗證玩家的回答，回傳錯誤訊息或 null (不序列化) */
  validate?: (a: Answer) => string | null;
}

export type Gen<T = void> = Generator<Decision, T, Answer>;

export class GameOver extends Error {
  constructor(
    public result: 'win' | 'lose',
    public rule: string,
    public reason: string,
  ) {
    super(`${result}: ${reason}`);
  }
}

export class InvalidAnswer extends Error {}

/** 引擎事件 (03-effect-engine.md 事件清單)。內容依事件而定。 */
export interface GameEvent {
  t: string;
  [k: string]: unknown;
}

export interface QueuedTrigger {
  sourceId: string;
  key: string;
  ev: GameEvent;
}

export class Ctx {
  /** 正在結算的效果層數 (EE-09/EE-10) */
  effectDepth = 0;
  /** 正在進行的遊戲動作層數 (EE-11) */
  gameActionDepth = 0;
  deferredEvents: GameEvent[] = [];
  /** EE-10 after 效果待辦 */
  afterQueue: QueuedTrigger[] = [];
  /** EE-14 echo 快照堆疊 */
  echoStack: (string | null)[] = [];

  constructor(public s: GameState) {}

  log(rule: string, text: string): void {
    const e: LogEntry = { round: this.s.round, phase: this.s.round === 0 ? 'setup' : this.s.phase, rule, text };
    this.s.log.push(e);
  }

  /** 翻開新資訊 (UI-02、DG-17)：復原紀錄會被清空 */
  revealInfo(): void {
    this.s.infoSeq++;
  }

  *decide(d: Decision): Gen<Answer> {
    if (d.options && d.autoSingle !== false && (d.type === 'choose' || d.type === 'window')) {
      const legal = d.options.filter((o) => o.legal !== false);
      if (legal.length === 1) return d.type === 'window' ? { option: legal[0].id } : legal[0].id; // EE-24
    }
    return yield d;
  }

  /** 選一個選項，回傳選項 id */
  *choose(rule: string, prompt: string, options: Option[], autoSingle = true): Gen<string> {
    const legal = options.filter((o) => o.legal !== false);
    if (legal.length === 0) throw new Error(`no legal option: ${prompt}`);
    const a = yield* this.decide({
      type: 'choose',
      rule,
      prompt,
      options,
      autoSingle,
      validate: (x) => (legal.some((o) => o.id === x) ? null : `不合法的選項：${String(x)}`),
    });
    return a as string;
  }

  *chooseNumber(rule: string, prompt: string, min: number, max: number): Gen<number> {
    if (min === max) return min;
    const a = yield* this.decide({
      type: 'number',
      rule,
      prompt,
      min,
      max,
      validate: (x) => (Number.isInteger(x) && (x as number) >= min && (x as number) <= max ? null : `需要 ${min}–${max} 的整數`),
    });
    return a as number;
  }

  get phase(): Phase {
    return this.s.phase;
  }
}
