// UI-05a 左 = 世界：目前地點、信標與搜尋、地圖、Shade 影響墊；下方是日誌。
import { useEffect, useRef, useState } from 'react';
import { beaconLimit, isFinalCandidate, locationEV } from '../engine/calc';
import { CARDS, locationCard, type LocationData } from '../engine/data';
import { abilitySpace, abilityTrackLength, characterSpace, characterTrackLength, shadeInfluenceSpaces } from '../engine/tracks';
import { abilityGrowthStatus, characterGrowthStatus } from '../engine/window';
import { fetchStatus } from '../engine/world';
import { freeLightAvailable } from '../engine/ops';
import { useUI } from './ctx';
import { Card, Icon, Panel, Stat } from './parts';
import { ruleText } from './rules';

export function WorldPanel() {
  const { s, opt, anyOpt, submit } = useUI();
  const w = s.world;
  const loc = w.location;
  const c = locationCard(loc.id).coordinates;
  const fs = fetchStatus({ s }, true);
  const search = opt('search');
  const searchAny = anyOpt('search');
  const freeLight = freeLightAvailable({ s }); // EE-23
  const limit = beaconLimit(s);
  return (
    <Panel title="世界">
      <div className="world-top">
        <Card id={loc.id} badges={loc.explored ? <span className="badge top">Explored</span> : undefined} />
        <div className="grid2">
          <Stat icon="Progress" value={loc.progress} of={locationEV(s)} title="Progress / EV" />
          <Stat title="座標" value={`(${c.east}, ${c.south})`} />
          <Stat icon="Obstacle" value={loc.obstacles} title="Obstacle" />
          <Stat icon="Path" value={loc.paths} title="Path" />
          <Stat icon="ThreatToken" value={loc.threatTokens} title="Threat token" />
          {freeLight ? <Stat icon="Light" value="+1" title="Farhome：本回合 1 free Light (EE-23)" accent /> : <span />}
          {w.newLocationTokenOnLocation && <div className="tag green span2">New Location</div>}
          <div className={`tag span2 ${fs.ok ? 'gold' : 'off'}`} title={fs.ok ? 'Fetch 可用 (T1a)' : `Fetch：${fs.reason}`}>
            Fetch {s.player.fetchReady ? '' : '✗'}
          </div>
        </div>
      </div>
      <div className="beacons">
        <Stat icon="Beacon" value={s.player.beacons.length} of={limit} title="Beacons" />
        {s.player.beacons.map((b) => (
          <Card key={b} id={b} w={28} />
        ))}
        {Array.from({ length: Math.max(0, limit - s.player.beacons.length) }, (_, i) => (
          <span key={i} className="mini-slot" />
        ))}
        <button
          className="chip"
          disabled={!search}
          title={search ? `搜尋：Path +${s.player.beacons.length} (KC-29)` : (searchAny?.reason ?? '現在不能搜尋')}
          onClick={() => search && submit({ option: 'search' })}
        >
          Search
        </button>
      </div>
    </Panel>
  );
}

/** 地圖 (UI-05a)：目前位置、走過的地點 (連線)、Final Location 候選、已移出的座標 */
export function MapPanel() {
  const { s } = useUI();
  const w = s.world;
  const cell = 20;
  const gap = 2;
  const locs = CARDS.filter((x) => x.type === 'location') as LocationData[];
  const at = (e: number, so: number) => locs.find((l) => l.coordinates.east === e && l.coordinates.south === so);
  const removed = new Set(w.removedLocations);
  const visited = w.visited;
  const center = (id: string) => {
    const k = locationCard(id).coordinates;
    return [(k.east - 1) * (cell + gap) + cell / 2, (k.south - 1) * (cell + gap) + cell / 2];
  };
  const spaces = shadeInfluenceSpaces(s);
  return (
    <Panel className="mapbox">
      <div style={{ width: 134, flexShrink: 0 }}>
        <div className="panel-title" style={{ marginBottom: 8 }}>
          地圖
        </div>
        <div className="map" style={{ width: 6 * cell + 5 * gap, height: 6 * cell + 5 * gap }}>
          {Array.from({ length: 6 }, (_, r) =>
            Array.from({ length: 6 }, (_, col) => {
              const l = at(col + 1, r + 1);
              const cur = l && l.id === w.location.id;
              const final = l && (w.finalLocation ? w.finalLocation === l.id : isFinalCandidate(s, l.id));
              const cls = !l || removed.has(l.id) ? 'removed' : cur ? 'cur' : visited.includes(l.id) ? 'visited' : '';
              return (
                <div
                  key={`${r}-${col}`}
                  className={`mcell ${cls}${final ? ' final' : ''}`}
                  style={{ left: col * (cell + gap), top: r * (cell + gap), width: cell, height: cell }}
                  title={l ? `${l.name} (${l.coordinates.east}, ${l.coordinates.south})` : ''}
                />
              );
            }),
          )}
          <svg className="map-lines" width={6 * cell + 5 * gap} height={6 * cell + 5 * gap}>
            <polyline points={visited.map((id) => center(id).join(',')).join(' ')} />
          </svg>
        </div>
        <div className="legend">
          <span>
            <i style={{ color: 'var(--gold)' }}>■</i> 目前位置
          </span>
          <span>
            <i style={{ color: '#8a6d33' }}>■</i> 走過的地點
          </span>
          <span>
            <i style={{ color: '#c98fd1' }}>□</i> Final Location 候選
          </span>
          <span>┆ 已移出</span>
        </div>
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="panel-title small" style={{ marginBottom: 8 }}>
          Shade Influence
        </div>
        <div className="influence">
          {spaces.map((sp, i) => (
            <div key={i} className={`irow${i === w.shadeInfluence ? ' cur' : ''}`} title={i === 0 ? 'Start (開局放在這格，SU-09)' : `第 ${i} 次移動後`}>
              {i === 0 ? (
                <span>Start</span>
              ) : (
                <>
                  {/* 照實體墊子印的數字：10 → 0 遞減 (UI-06b，1.7.1) */}
                  <span className="muted">{sp.label}</span>
                  {sp.threat !== undefined && (
                    <span className="iv">
                      <Icon name="ThreatTrack" title="Threat" />+{sp.threat}
                    </span>
                  )}
                  {sp.xp !== undefined && (
                    <span className="iv">
                      <Icon name="XP" title="XP" />+{sp.xp}
                    </span>
                  )}
                </>
              )}
            </div>
          ))}
        </div>
      </div>
    </Panel>
  );
}

// ---------------------------------------------------------------- 成長墊 (UI-06c)

const GROWTH_ICON: Record<string, string> = {
  unlock: 'Unlocked',
  recruit: 'Recruit',
  upgrade: 'Upgrade',
  light: 'Light',
  hand_size: 'HandSize',
  rest: 'Rest',
  perm_booster: 'PermBooster',
};

/** UI-06c 成長墊：照實體墊子畫 Ability / Character 兩條成長軌道；目前位置亮起來，點一下打開成長畫面 */
export function GrowthPanel({ onOpen }: { onOpen: () => void }) {
  const { s, opt } = useUI();
  const p = s.player;
  const row = (name: string, icon: string, len: number, pos: number, get: (i: number) => Record<string, number | undefined>, next: { cost: number; ok: boolean }, can: boolean) => (
    <div className="grow-row" title={`${name}：下一格 ${next.cost} XP${can ? ' (現在可以成長)' : ''}`}>
      <Icon name={icon} size={16} title={name} />
      <div className="grow-cells">
        {Array.from({ length: len + 1 }, (_, i) => {
          const sp = get(i);
          return (
            <div key={i} className={`grow-cell${i === pos ? ' cur' : i < pos ? ' done' : ''}${i === pos + 1 && can ? ' next' : ''}`}>
              <span className="grow-cost">{i === 0 ? '' : i === pos + 1 ? next.cost : sp.cost}</span>
              {Object.entries(sp)
                .filter(([k, v]) => k !== 'cost' && v !== undefined)
                .map(([k, v]) => (
                  <span key={k} className="grow-ben">
                    <Icon name={GROWTH_ICON[k] ?? k} size={10} />
                    {v}
                  </span>
                ))}
            </div>
          );
        })}
      </div>
    </div>
  );
  return (
    <Panel title="Growth" className="growth-mat" right={<Stat icon="XP" value={p.xp} title="XP" />}>
      <div className="grow-click" onClick={onOpen} title="點擊打開成長畫面 (DG-14)">
        {row('Ability Growth', 'AbilityGrowth', abilityTrackLength(s), p.abilityGrowthPos, (i) => abilitySpace(s, i) as Record<string, number | undefined>, abilityGrowthStatus(s), !!opt('growAbility'))}
        {row('Character Growth', 'CharacterGrowth', characterTrackLength(s), p.characterGrowthPos, (i) => characterSpace(s, i) as Record<string, number | undefined>, characterGrowthStatus(s), !!opt('growCharacter'))}
      </div>
    </Panel>
  );
}

/** 日誌 (DG-02)：每行標規則編號，點擊顯示規則說明 */
export function LogPanel() {
  const { s } = useUI();
  const ref = useRef<HTMLDivElement>(null);
  const [rule, setRule] = useState<string | null>(null);
  const entries = s.log.filter((l) => l.round > 0).slice(-80);
  useEffect(() => {
    if (ref.current) ref.current.scrollTop = ref.current.scrollHeight;
  }, [s.log.length]);
  return (
    <Panel title="日誌" className="log" right={<span className="muted small">點規則編號可看說明</span>}>
      <div className="log-lines" ref={ref}>
        {entries.map((l, i) => (
          <div key={i} className="log-line">
            <button className="rule" onClick={() => setRule(l.rule)}>
              {l.rule}
            </button>
            <span title={l.text}>{l.text}</span>
          </div>
        ))}
      </div>
      {rule && (
        <div className="rule-pop" onClick={() => setRule(null)}>
          <b>{rule}</b>
          <p>{ruleText(rule) ?? '規格中沒有這個編號的條文。'}</p>
          <span className="muted small">點一下關閉</span>
        </div>
      )}
    </Panel>
  );
}
