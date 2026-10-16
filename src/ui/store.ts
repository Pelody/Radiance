// 遊戲狀態的 React hook：送出決定、復原、存檔 (UI-01：localStorage)。
import { useCallback, useEffect, useMemo, useState } from 'react';
import { InvalidAnswer } from '../engine/core';
import { canUndo, newGame, view, type Game, type View } from '../engine/game';
import type { SetupOptions } from '../engine/setup';
import type { LogEntry } from '../engine/types';
import { cloudLoad, cloudSave } from './cloud';
import { act, autoAdvance, emptyMemory, undoToStop, type FlowMemory, type FlowSettings } from './flow';

const SAVE_KEY = 'radiance.save.v1';
const SETTINGS_KEY = 'radiance.settings.v1';

interface Saved {
  game: Game;
  mem: FlowMemory;
  /** 存檔時間 (本機與雲端取較新的) */
  savedAt?: number;
}

/** 存檔只保留目前階段的快照與之後的決定 (不含復原紀錄)，日誌保留最後 300 行，控制大小 */
function compact(s: Saved): Saved {
  const cp = s.game.session.checkpoint;
  return {
    game: { session: { checkpoint: { ...cp, log: cp.log.slice(-300) }, answers: s.game.session.answers }, undo: [] },
    mem: s.mem,
    savedAt: s.savedAt,
  };
}

function load<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function save(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // 存不下時忽略 (遊戲仍可進行)
  }
}

/** UI-03 需要停下來讓玩家看清楚的重要事件 */
export function importantEvents(entries: LogEntry[]): LogEntry[] {
  return entries.filter(
    (e) =>
      (e.rule === 'TR-01' && e.text.startsWith('完成 Treachery')) ||
      (e.text.startsWith('腐化 ') && e.text.includes('→')) ||
      (e.rule === 'P5-04' && e.text.includes('已探索')) ||
      e.rule === 'FL-02' ||
      e.text.startsWith('擊敗') ||
      (e.rule === 'SH-04' && e.text.includes('進場')) ||
      e.text.startsWith('失敗') ||
      e.rule === 'WIN-01',
  );
}

export interface GameStore {
  game: Game | null;
  view: View | null;
  settings: FlowSettings;
  error: string | null;
  events: LogEntry[];
  canUndo: boolean;
  start: (o: SetupOptions) => void;
  submit: (answer: unknown) => void;
  undo: () => void;
  setSettings: (s: FlowSettings) => void;
  dismissEvents: () => void;
  quit: () => void;
}

export function useGameStore(): GameStore {
  const [saved, setSaved] = useState<Saved | null>(() => load<Saved>(SAVE_KEY));
  const [settings, setSettingsState] = useState<FlowSettings>(() => load<FlowSettings>(SETTINGS_KEY) ?? { stopAtEveryWindow: false });
  const [error, setError] = useState<string | null>(null);
  const [events, setEvents] = useState<LogEntry[]>([]);

  const v = useMemo(() => {
    if (!saved) return null;
    try {
      return view(saved.game);
    } catch (e) {
      console.error(e);
      return null;
    }
  }, [saved]);

  // 存檔：本機 localStorage + claude.ai 雲端 (有的話)
  useEffect(() => {
    if (!saved) return;
    const c = compact({ ...saved, savedAt: Date.now() });
    save(SAVE_KEY, c);
    void cloudSave(JSON.stringify(c), c.savedAt!);
  }, [saved]);

  // 開啟時讀雲端存檔；比本機新就用雲端的
  useEffect(() => {
    let alive = true;
    void cloudLoad().then((r) => {
      if (!alive || !r) return;
      try {
        const cloud = JSON.parse(r.json) as Saved | null; // null = 放棄了那一局
        setSaved((local) => (!local || (local.savedAt ?? 0) < r.savedAt ? cloud : local));
      } catch {
        // 壞掉的雲端存檔：忽略
      }
    });
    return () => {
      alive = false;
    };
  }, []);

  const run = useCallback(
    (f: () => Saved, before: number) => {
      try {
        const next = f();
        setSaved(next);
        setError(null);
        const after = view(next.game).state.log;
        const ev = importantEvents(after.slice(before));
        if (ev.length) setEvents((old) => [...old, ...ev]);
      } catch (e) {
        if (e instanceof InvalidAnswer) setError(e.message);
        else {
          console.error(e);
          setError(`程式錯誤：${(e as Error).message}`);
        }
      }
    },
    [],
  );

  const start = useCallback(
    (o: SetupOptions) => {
      const mem = emptyMemory();
      run(() => ({ game: autoAdvance(newGame(o), mem, settings), mem }), 0);
      setEvents([]);
    },
    [run, settings],
  );

  const submit = useCallback(
    (answer: unknown) => {
      if (!saved || !v) return;
      run(() => {
        const r = act(saved.game, answer, saved.mem, settings);
        return { game: r.game, mem: r.mem };
      }, v.state.log.length);
    },
    [saved, v, run, settings],
  );

  const undo = useCallback(() => {
    if (!saved) return;
    setSaved(undoToStop(saved.game, saved.mem, settings));
    setEvents([]);
    setError(null);
  }, [saved, settings]);

  const setSettings = useCallback(
    (s: FlowSettings) => {
      setSettingsState(s);
      save(SETTINGS_KEY, s);
      if (saved) setSaved({ game: autoAdvance(saved.game, saved.mem, s), mem: saved.mem });
    },
    [saved],
  );

  const quit = useCallback(() => {
    try {
      localStorage.removeItem(SAVE_KEY);
    } catch {
      // ignore
    }
    void cloudSave('null', Date.now());
    setSaved(null);
    setEvents([]);
  }, []);

  return {
    game: saved?.game ?? null,
    view: v,
    settings,
    error,
    events,
    canUndo: !!saved && canUndo(saved.game),
    start,
    submit,
    undo,
    setSettings,
    dismissEvents: () => setEvents([]),
    quit,
  };
}
