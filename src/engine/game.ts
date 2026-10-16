// 驅動程式：「狀態 + 動作」介面。
//
// - 玩家的每個決定是一個 action (Answer)。submit() 回傳新的 Game，裡面有新狀態與下一個待決策。
// - 不需要玩家決定的步驟由引擎自動跑完並寫日誌 (DG-02)。
// - 存檔 = 最近一個階段開始時的狀態快照 + 之後的 action 列表；引擎是確定性的 (EE-25)，
//   重跑就得到完全相同的結果。
// - 復原 (UI-02、EE-26)：每次 submit 前保存快照；一旦翻開新資訊 (infoSeq 增加)，清空復原紀錄。
import { Ctx, GameOver, InvalidAnswer, type Answer, type Decision } from './core';
import './cards';
import { runPhase } from './phases';
import { initialState, setupGen, type SetupOptions } from './setup';
import type { GameState } from './types';

export interface Session {
  /** 某個階段開始時的狀態 */
  checkpoint: GameState;
  /** 從該階段開始以來的玩家決定 */
  answers: Answer[];
}

export interface Game {
  session: Session;
  undo: Session[];
}

export interface View {
  state: GameState;
  pending: Decision | null;
}

interface RunResult extends View {
  session: Session;
}

const clone = <T>(x: T): T => structuredClone(x);

/** 從快照重跑，直到需要新的玩家決定或遊戲結束 */
function run(session: Session): RunResult {
  const s = clone(session.checkpoint);
  const answers = session.answers;
  let idx = 0;
  let boundary: Session = session;
  try {
    while (!s.outcome) {
      const ctx = new Ctx(s);
      const gen = s.round === 0 ? setupGen(ctx, s.setup) : runPhase(ctx);
      let r = gen.next();
      while (!r.done) {
        const d = r.value;
        if (idx >= answers.length) {
          return { state: s, pending: d, session: boundary };
        }
        const a = answers[idx++];
        const err = validate(d, a);
        if (err) throw new InvalidAnswer(err);
        r = gen.next(a);
      }
      // 階段結束：在這裡建立新的快照，之後的 action 從這裡重跑
      boundary = { checkpoint: clone(s), answers: answers.slice(idx) };
    }
  } catch (e) {
    if (!(e instanceof GameOver)) throw e;
  }
  return { state: s, pending: null, session: { checkpoint: clone(s), answers: [] } };
}

function validate(d: Decision, a: Answer): string | null {
  if (d.validate) return d.validate(a);
  if (d.options) {
    const id = typeof a === 'string' ? a : (a as { option?: string })?.option;
    return d.options.some((o) => o.id === id && o.legal !== false) ? null : `不合法的選項：${String(id)}`;
  }
  return null;
}

const viewCache = new WeakMap<Session, RunResult>();

function runCached(session: Session): RunResult {
  let r = viewCache.get(session);
  if (!r) {
    r = run(session);
    viewCache.set(session, r);
    viewCache.set(r.session, r);
  }
  return r;
}

export function newGame(o: SetupOptions): Game {
  const s = initialState(o);
  const r = runCached({ checkpoint: s, answers: [] });
  return { session: r.session, undo: [] };
}

export function view(g: Game): View {
  const r = runCached(g.session);
  return { state: r.state, pending: r.pending };
}

/** 送出一個玩家決定。不合法時拋出 InvalidAnswer，Game 不變。 */
export function submit(g: Game, answer: Answer): Game {
  const before = runCached(g.session);
  if (!before.pending) throw new InvalidAnswer('目前沒有待決策');
  const r = runCached({ checkpoint: g.session.checkpoint, answers: [...g.session.answers, answer] });
  // UI-02：翻開新資訊之後不能復原到那之前
  const revealed = r.state.infoSeq > before.state.infoSeq;
  return { session: r.session, undo: revealed ? [] : [...g.undo, g.session] };
}

export function canUndo(g: Game): boolean {
  return g.undo.length > 0;
}

export function undo(g: Game): Game {
  if (!g.undo.length) return g;
  return { session: g.undo[g.undo.length - 1], undo: g.undo.slice(0, -1) };
}

/**
 * DG-18 預覽：假設送出 answer 之後的狀態 (用和實際結算同一套程式)。
 * 呼叫者只能顯示不含隱藏資訊的部分 (DG-17)；結果若翻開了新資訊，hidden = true。
 */
export function previewSubmit(g: Game, answer: Answer): { state: GameState; pending: Decision | null; hidden: boolean } | null {
  try {
    const before = runCached(g.session);
    const r = run({ checkpoint: g.session.checkpoint, answers: [...g.session.answers, answer] });
    return { state: r.state, pending: r.pending, hidden: r.state.infoSeq > before.state.infoSeq };
  } catch (e) {
    if (e instanceof InvalidAnswer) return null;
    throw e;
  }
}

/** 存檔 (localStorage)：Game 是純資料，直接序列化 */
export function serialize(g: Game): string {
  return JSON.stringify(g);
}
export function deserialize(json: string): Game {
  return JSON.parse(json) as Game;
}
