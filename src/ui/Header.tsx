// UI-05 上方：回合數、8 個階段的進度列、復原與選單。
import { PHASES, PHASE_NAMES } from '../engine/types';
import { useUI } from './ctx';

export function Header({ onUndo, canUndo, onGrowth, onSettings }: { onUndo: () => void; canUndo: boolean; onGrowth: () => void; onSettings: () => void }) {
  const { s } = useUI();
  const cur = PHASES.indexOf(s.phase);
  return (
    <header className="topbar">
      <div className="brand">
        <span className="logo">Radiance</span>
        <span className="muted">Round {s.round}</span>
      </div>
      <nav className="phases" aria-label="Phases">
        {PHASES.map((p, i) => (
          <span key={p} className={`phase${i === cur ? ' current' : i < cur ? ' done' : ''}`}>
            {i + 1} {PHASE_NAMES[p]}
            {i < cur ? ' ✓' : ''}
          </span>
        ))}
      </nav>
      <div className="menu">
        <button onClick={onUndo} disabled={!canUndo} title={canUndo ? '復原到上一個決定' : '翻開新資訊之後不能復原 (UI-02)'}>
          ↶ 復原
        </button>
        <button onClick={onGrowth}>Growth</button>
        <button onClick={onSettings}>設定</button>
      </div>
    </header>
  );
}
