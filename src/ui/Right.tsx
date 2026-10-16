// UI-05a 右：HP、XP、其他數值；UI-06a/06b 直式軌道 (光、腐化、威脅、抗性)；牌庫張數。
import { handSize, lightProduction, luminaryHP, restValue } from '../engine/calc';
import { shadeInfo } from '../engine/shades';
import { abilitySpace, abilityTrackLength, characterSpace, characterTrackLength, corr, engagementSegment, growth } from '../engine/tracks';
import type { EngagementSegment } from '../engine/tracks';
import { useUI } from './ctx';
import { Icon, Stat } from './parts';

export function StatusPanel() {
  const { s } = useUI();
  const p = s.player;
  const nextA = p.abilityGrowthPos < abilityTrackLength(s) ? abilitySpace(s, p.abilityGrowthPos + 1).cost : undefined;
  const nextC = p.characterGrowthPos < characterTrackLength(s) ? characterSpace(s, p.characterGrowthPos + 1).cost : undefined;
  const info = shadeInfo(s.world.shade);
  return (
    <section className="panel stats3">
      <Stat icon="HP" value={luminaryHP(s)} title="HP" />
      <Stat icon="Wound" value={p.wounds} title="Wounds" />
      <Stat icon="XP" value={p.xp} title="XP" />
      <Stat icon="CharacterGrowth" value={nextC ?? '—'} title="Character Growth 下一格費用" />
      <Stat icon="AbilityGrowth" value={nextA ?? '—'} title="Ability Growth 下一格費用" />
      <Stat icon="HandSize" value={handSize(s)} title="Hand Size" />
      <Stat icon="Light" value={`+${lightProduction(s)}`} title="Light Production" />
      <Stat icon="Rest" value={restValue(s)} title="Rest" />
      <Stat title="已完成 Treachery / 上限" value={s.world.completedTreacheries.length} of={info.treacheryLimit}>
        <span className="tiny muted">Tr.</span>
      </Stat>
    </section>
  );
}

function segLabel(seg: EngagementSegment): string {
  return seg.reveal.length ? `${seg.engage}+` : String(seg.engage);
}

export function Tracks() {
  const { s, preview } = useUI();
  const w = s.world;
  const p = s.player;
  const g = growth(s);
  const c = corr(s);
  const lightAfter = preview && preview.cost > 0 ? preview.light : null;
  const curSeg = engagementSegment(s, p.light);
  const afterSeg = lightAfter !== null ? engagementSegment(s, lightAfter) : null;
  const ROW_L = 28;
  const limit = shadeInfo(w.shade).corruptionLimit;
  const tv = c.threat_track.value as Record<string, number>;
  const rv = c.resistance_track.value as Record<string, number>;
  const segs = (vals: Record<string, number>) => {
    const out: { from: number; to: number; v: number }[] = [];
    for (let i = 0; i <= 27; i++) {
      const v = vals[String(i)];
      if (out.length && out[out.length - 1].v === v) out[out.length - 1].to = i;
      else out.push({ from: i, to: i, v });
    }
    return out;
  };
  const toNext = (vals: Record<string, number>, pos: number) => {
    for (let i = pos + 1; i <= 27; i++) if (vals[String(i)] !== vals[String(pos)]) return i - pos;
    return null;
  };
  const vtrack = (vals: Record<string, number>, pos: number, cls: string) => (
    <div className="vtrack" style={{ gridTemplateRows: 'repeat(28, 21px)' }}>
      {segs(vals).map((sg) => (
        <span key={sg.from} className={`${cls}${pos >= sg.from && pos <= sg.to ? ' on' : ''}`} style={{ gridRow: `${sg.from + 1} / span ${sg.to - sg.from + 1}` }}>
          {sg.v}
        </span>
      ))}
    </div>
  );
  return (
    <section className="panel tracks">
      <div className="track-cols">
        {/* 光：上 20 → 下 0 */}
        <div style={{ width: 50 }}>
          <div className="thead" title="Light">
            <Icon name="Light" />
            <b className="gold">{p.light}</b>
            {lightAfter !== null && <b className="down small"> → {lightAfter}</b>}
          </div>
          <div className="tsub">
            <Icon name="Engagement" size={12} title="Engagement" />
          </div>
          <div className="vtrack" style={{ gridTemplateRows: `repeat(21, ${ROW_L}px)` }}>
            {(g.light_track.engagement as EngagementSegment[]).map((seg) => {
              const top = 20 - Math.max(...seg.spaces);
              const on = seg === curSeg;
              const after = afterSeg && seg === afterSeg && afterSeg !== curSeg;
              return (
                <span
                  key={seg.spaces[0]}
                  className={`lseg${on ? ' on' : ''}${after ? ' after' : ''}`}
                  style={{ gridRow: `${top + 1} / span ${seg.spaces.length}` }}
                  title={`光 ${Math.min(...seg.spaces)}–${Math.max(...seg.spaces)}：接戰 ${seg.engage}${seg.reveal.length ? `，再翻 ${seg.reveal.join('、')}` : ''}${seg.wounds ? `，受 ${seg.wounds} 傷` : ''}`}
                >
                  {segLabel(seg)}
                </span>
              );
            })}
          </div>
        </div>

        {/* 腐化 (UI-06a)：威脅 | 腐化值 | 抗性 */}
        <div style={{ width: 100 }}>
          <div className="thead" title="Corruption">
            <Icon name="Corruption" />
            <b>
              {w.corruption}
              <span className="of">/{limit}</span>
            </b>
          </div>
          <div className="tsub three">
            <Icon name="ThreatTrack" size={12} title="Threat" />
            <span />
            <Icon name="ResistanceTrack" size={12} title="Resistance" />
          </div>
          <div className="ctrack">
            {Array.from({ length: c.corruption_track.max }, (_, i) => i + 1).map((v) => (
              <span
                key={v}
                className={`cval${v === w.corruption ? ' cur' : ''}${v === limit ? ' limit' : ''}${v > limit ? ' faded' : ''}`}
                style={{ gridRow: v, gridColumn: 2 }}
              >
                {v}
              </span>
            ))}
            {c.distance_track.boxes.map((b) => {
              const r0 = Math.min(...b.under_corruption);
              const span = b.under_corruption.length;
              const cur = b.box === w.distanceBox;
              const style = { gridRow: `${r0} / span ${span}` };
              return [
                <span key={`t${b.box}`} className={`dbox${cur ? ' cur' : ''}${b.box % 2 ? ' alt' : ''}`} style={{ ...style, gridColumn: 1 }} title={`Distance box ${b.box}：威脅 +${b.threat}`}>
                  {b.box === 0 ? '—' : `+${b.threat}`}
                </span>,
                <span key={`r${b.box}`} className={`dbox${cur ? ' cur' : ''}${b.box % 2 ? ' alt' : ''}`} style={{ ...style, gridColumn: 3 }} title={`Distance box ${b.box}：抗性 +${b.resistance}`}>
                  {b.box === 0 ? '—' : `+${b.resistance}`}
                </span>,
              ];
            })}
          </div>
        </div>

        <div style={{ width: 50 }}>
          <div className="thead" title="Threat">
            <Icon name="ThreatTrack" />
            <b>{tv[String(w.threat)]}</b>
          </div>
          <div className="tsub small muted">{toNext(tv, w.threat) !== null ? `差 ${toNext(tv, w.threat)} 格` : '最後一段'}</div>
          {vtrack(tv, w.threat, 'tseg threat')}
        </div>

        <div style={{ width: 50 }}>
          <div className="thead" title="Resistance">
            <Icon name="ResistanceTrack" />
            <b>{rv[String(w.resistance)]}</b>
          </div>
          <div className="tsub small muted">{toNext(rv, w.resistance) !== null ? `差 ${toNext(rv, w.resistance)} 格` : '最後一段'}</div>
          {vtrack(rv, w.resistance, 'tseg resist')}
        </div>
      </div>
      <div className="muted small center" style={{ marginTop: 'auto', paddingTop: 8 }}>
        亮的是目前位置 · 金框是 Distance 方塊 · 紅是失敗
      </div>
    </section>
  );
}

export function Counts() {
  const { s } = useUI();
  return (
    <div className="panel counts">
      <span>
        Deck <b>{s.player.deck.length}</b>
      </span>
      <span>
        Discard <b>{s.player.discard.length}</b>
      </span>
      <span>
        Explored <b>{s.world.exploredCount}</b>
      </span>
    </div>
  );
}

