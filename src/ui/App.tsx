// 階段 1 骨架：只有標題列與卡圖檢視器 (檢查切圖結果)。主畫面在階段 3 依 spec/20-ui.md 實作。
import { useMemo, useState } from 'react';
import { CARDS, cardImagePath, type CardType } from '../engine/data';
import { Icon } from './Icon';

export function App() {
  const types = useMemo(() => [...new Set(CARDS.map((c) => c.type))], []);
  const [type, setType] = useState<CardType>('player_card');
  const shown = CARDS.filter((c) => c.type === type);

  return (
    <div>
      <header style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '8px 12px', borderBottom: '1px solid var(--line)', background: 'var(--panel)' }}>
        <span style={{ fontFamily: "'Noto Serif TC', serif", fontSize: 22, fontWeight: 700, color: 'var(--gold)' }}>Radiance</span>
        <span style={{ color: 'var(--muted)' }}>卡圖檢視</span>
        <span style={{ color: 'var(--gold)' }}>
          <Icon name="Light" /> <Icon name="Progress" /> <Icon name="XP" />
        </span>
        <select value={type} onChange={(e) => setType(e.target.value as CardType)}>
          {types.map((t) => (
            <option key={t}>{t}</option>
          ))}
        </select>
        <span style={{ color: 'var(--muted)' }}>{shown.length}</span>
      </header>
      <main style={{ display: 'flex', flexWrap: 'wrap', gap: 8, padding: 12 }}>
        {shown.map((c) => (
          <figure key={c.id} style={{ margin: 0, width: 180 }}>
            <img src={cardImagePath(c.id)} alt={c.name ?? c.id} style={{ maxWidth: 180, maxHeight: 252 }} />
            <figcaption style={{ fontSize: 12, color: 'var(--muted)', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {c.id} {c.name}
            </figcaption>
          </figure>
        ))}
      </main>
    </div>
  );
}
