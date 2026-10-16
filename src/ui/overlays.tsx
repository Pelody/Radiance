// UI-11 回合流程的彈出視窗：階段開場 (UI-11a)、結算動畫 (UI-11b)、決定視窗 (UI-11c)、效果選單 (UI-11d)。
import { useEffect, useRef, useState } from 'react';
import type { Decision, Option } from '../engine/core';
import {
  apAvailable,
  attackType,
  enemyAttack,
  enemyAttackCount,
  engagementCount,
  epBreakdown,
  locationEV,
  questDarkness,
  treacheryPV,
} from '../engine/calc';
import { CARDS, cardName, getCard } from '../engine/data';
import { PHASES, PHASE_NAMES, type GameState, type LogEntry, type Phase } from '../engine/types';
import { useUI } from './ctx';
import type { FlowSettings } from './flow';
import { Card, Icon, Stat } from './parts';
import { coverPreview, travelPreview } from './preview';
import { isImportant } from './store';

// ---------------------------------------------------------------- 共用

/** Enter / 空白鍵 = 主要按鈕 */
function useEnter(f: () => void) {
  const ref = useRef(f);
  ref.current = f;
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        ref.current();
      }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, []);
}

const phaseNo = (p: Phase) => PHASES.indexOf(p) + 1;

/** 卡片 id (選項 id 可能就是卡片 id)；不是卡片時回傳 null */
function asCard(id: string): string | null {
  try {
    getCard(id);
    return id;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------- UI-11a 階段開場

interface Brief {
  lines: string[];
  stats: { icon: string; value: React.ReactNode; of?: React.ReactNode; title: string }[];
}

/** 這個階段要做什麼 (帶入目前的數字) */
export function phaseBrief(s: GameState, d: Decision | null): Brief {
  const dark = questDarkness(s).effective;
  const pv = treacheryPV(s);
  const tr = { icon: 'Progress', value: s.world.treacheryProgress, of: pv, title: 'Treachery Progress' };
  switch (s.phase) {
    case 'staging':
      return {
        lines: ['新翻開的敵人已經放進 Quest Area。', '可以先使用效果，然後進入 Action Set。'],
        stats: [{ icon: 'Darkness', value: dark, title: 'Quest Area Darkness' }, tr],
      };
    case 'actionSet':
      return {
        lines: ['從手牌點 3 張卡：依序放到 Action、Attack、Booster。', '打出後剩下的 Light 越少，接戰的敵人越多。'],
        stats: [
          { icon: 'Light', value: s.player.light, title: 'Light' },
          { icon: 'Engagement', value: engagementCount(s), title: '目前的接戰數' },
        ],
      };
    case 'engagement':
      return {
        lines: [`這回合會有 ${engagementCount(s)} 個敵人從 Quest Area 前端接戰。`, '接戰前後都可以使用效果。'],
        stats: [{ icon: 'Engagement', value: engagementCount(s), title: '接戰數' }],
      };
    case 'darkness': {
      const ep = epBreakdown(s).total;
      return {
        lines: [
          `Quest Area 有 ${dark} Darkness，你有 ${ep} EP。`,
          '先決定用多少 EP 抵消黑暗；沒抵消的黑暗變成 Treachery Progress，剩下的 EP 拿去探索。',
        ],
        stats: [{ icon: 'Darkness', value: dark, title: 'Darkness' }, { icon: 'MainExplore', value: ep, title: 'EP' }, tr],
      };
    }
    case 'explore':
      return {
        lines: [`在 ${cardName(s.world.location.id)} 放 Progress (EV ${locationEV(s)})。`, '探索完成後選擇要移動到哪裡。'],
        stats: [{ icon: 'Progress', value: s.world.location.progress, of: locationEV(s), title: '地點 Progress / EV' }],
      };
    case 'attack': {
      const t = attackType(s);
      return {
        lines: [`你有 ${apAvailable(s)} AP${t ? ` (${t})` : ''}。`, '點 Player Area 的敵人分配 AP；每個敵人每階段只能被攻擊一次。'],
        stats: [{ icon: 'Attack', value: apAvailable(s), title: 'AP' }],
      };
    }
    case 'defend': {
      const ids = s.world.playerArea.filter((id) => !s.roundState.disarmed.includes(id));
      const total = ids.reduce((n, id) => n + enemyAttack(s, id) * enemyAttackCount(s, id), 0);
      return {
        lines: [`${ids.length} 個敵人會攻擊，共 ${total} 點。`, '依序點敵人決定誰先攻擊，再點手牌中同類型的卡防禦。'],
        stats: [
          { icon: 'EnemyAttack', value: total, title: '攻擊總和' },
          { icon: 'Wound', value: s.player.wounds, title: '目前傷害' },
        ],
      };
    }
    case 'refresh':
      return {
        lines: ['產生 Light，可以休息 (Physical：花 3 XP)。', '棄掉行動組 (最後一張成為 echo)，補牌到手牌上限。'],
        stats: [{ icon: 'XP', value: s.player.xp, title: 'XP' }],
      };
  }
  void d;
  return { lines: [], stats: [] };
}

export function PhaseIntro({ onClose }: { onClose: () => void }) {
  const { s, d } = useUI();
  const b = phaseBrief(s, d);
  useEnter(onClose);
  return (
    <div className="ov-bg" onClick={onClose}>
      <div className="ov-box intro" onClick={onClose}>
        <div className="intro-round">Round {s.round}</div>
        <div className="intro-title">
          <span className="intro-no">{phaseNo(s.phase as Phase)}</span>
          {PHASE_NAMES[s.phase as Phase]}
        </div>
        <div className="intro-lines">
          {b.lines.map((l) => (
            <div key={l}>{l}</div>
          ))}
        </div>
        {b.stats.length > 0 && (
          <div className="intro-stats">
            {b.stats.map((x) => (
              <Stat key={x.title} icon={x.icon} value={x.value} of={x.of} title={x.title} big />
            ))}
          </div>
        )}
        <button className="primary" autoFocus>
          開始
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- UI-11b 結算動畫

const SPEED_MS = { fast: 90, normal: 220, slow: 450, off: 0 } as const;

/** 只是標示階段開始的日誌，不放進結算視窗 */
function trivial(e: LogEntry): boolean {
  return (e.rule === 'EE-17' && e.text.endsWith('Phase')) || e.rule === 'P1' || e.rule === 'P8-07' || (e.rule === 'P1-02' && e.text.startsWith('剩餘'));
}

/** 日誌提到的卡 (翻開、接戰、擊敗)：結算視窗裡顯示小卡圖 */
function cardOf(text: string): string | null {
  const m =
    /^翻開 Treachery：(.+?) \(/.exec(text) ??
    /^翻開地點 (.+)$/.exec(text) ??
    /^翻開 (.+?) \(/.exec(text) ??
    /^(.+?) 進入 Player Area/.exec(text) ??
    /^擊敗 (.+)$/.exec(text);
  if (!m) return null;
  const name = m[1].trim();
  const c = CARDS.find((x) => x.name === name && (x.type === 'enemy' || x.type === 'location' || x.type === 'treachery'));
  return c ? c.id : null;
}

interface Group {
  key: string;
  title: string;
  entries: LogEntry[];
}

function groupsOf(events: LogEntry[]): Group[] {
  const out: Group[] = [];
  for (const e of events) {
    if (trivial(e)) continue;
    const key = `${e.round}|${e.phase}`;
    const last = out[out.length - 1];
    if (last && last.key === key) last.entries.push(e);
    else
      out.push({
        key,
        title: e.phase === 'setup' ? '開局' : `Round ${e.round} · ${phaseNo(e.phase)} ${PHASE_NAMES[e.phase]}`,
        entries: [e],
      });
  }
  return out;
}

export function Resolution({ events, speed, onClose }: { events: LogEntry[]; speed: FlowSettings['animSpeed']; onClose: () => void }) {
  const groups = groupsOf(events);
  const total = groups.reduce((n, g) => n + g.entries.length, 0);
  const ms = SPEED_MS[speed ?? 'normal'];
  const [shown, setShown] = useState(ms ? 0 : total);
  const listRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (shown >= total) return;
    const t = window.setTimeout(() => setShown((n) => n + 1), ms);
    return () => window.clearTimeout(t);
  }, [shown, total, ms]);
  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [shown]);
  const done = shown >= total;
  const next = () => (done ? onClose() : setShown(total));
  useEnter(next);
  if (!total) {
    // 只有階段標示：直接關掉
    queueMicrotask(onClose);
    return null;
  }
  let i = 0;
  return (
    <div className="ov-bg">
      <div className="ov-box resolve">
        <div className="resolve-head">
          <span className="panel-title">結算</span>
          <span className="muted small">
            {Math.min(shown, total)} / {total}
          </span>
        </div>
        <div className="resolve-list" ref={listRef}>
          {groups.map((g) => {
            const visible = g.entries.filter(() => i++ < shown);
            if (!visible.length) return null;
            return (
              <div key={g.key} className="resolve-group">
                <div className="resolve-title">{g.title}</div>
                {visible.map((e, k) => {
                  const cid = cardOf(e.text);
                  return (
                    <div key={k} className={`resolve-line${isImportant(e) ? ' important' : ''}`}>
                      {cid ? <Card id={cid} w={30} /> : <span className="resolve-dot" />}
                      <span className="resolve-text">{e.text}</span>
                      <span className="rule">{e.rule}</span>
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
        <button className="primary" onClick={next} autoFocus>
          {done ? '繼續' : '全部顯示'}
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- UI-11c 決定視窗

/** 不用點盤面就能做的決定放在視窗裡；要點手牌 / 敵人 / 卡槽的留在主畫面 */
export function isModalDecision(d: Decision | null): boolean {
  if (!d) return false;
  if (d.type === 'number' || d.type === 'cards' || d.type === 'order') return true;
  if (d.type === 'choose') return d.rule !== 'P7-02';
  return false;
}

export function DecisionModal({ onHide }: { onHide: () => void }) {
  const { d } = useUI();
  if (!d) return null;
  return (
    <div className="ov-bg dim">
      <div className="ov-box decision">
        <div className="dec-head">
          <span className="dec-prompt" title={d.prompt}>
            {d.prompt}
          </span>
          <span className="rule">{d.rule}</span>
          <button className="ghost" onClick={onHide} title="暫時收起視窗看盤面">
            看盤面
          </button>
        </div>
        {d.type === 'number' ? <NumberBody /> : d.type === 'cards' ? <CardsBody /> : d.type === 'order' ? <OrderBody /> : <ChooseBody />}
      </div>
    </div>
  );
}

function NumberBody() {
  const { s, d, submit } = useUI();
  const min = d!.min ?? 0;
  const max = d!.max ?? 0;
  const cover = d!.rule === 'P4-02';
  const init = cover ? max : min;
  const [n, setN] = useState(init);
  useEffect(() => setN(init), [d, init]);
  const pv = cover ? coverPreview(s, n) : null;
  useEnter(() => submit(n));
  return (
    <>
      {cover && <div className="dec-note">沒抵消的黑暗會變成 Treachery Progress；剩下的 EP 用來探索。</div>}
      <div className="dec-body center-row">
        <div className="stepper big">
          <button onClick={() => setN(Math.max(min, n - 1))}>−</button>
          {cover ? <Stat icon="Darkness" value={n} title="抵消的黑暗" big /> : <Stat value={n} of={max} title={`${min}–${max}`} big />}
          <button onClick={() => setN(Math.min(max, n + 1))}>+</button>
        </div>
        {pv && (
          <>
            <Stat icon="Progress" value={pv.treachery} of={pv.pv} title={`Treachery Progress${pv.completes ? '：會完成！' : ''}`} delta={pv.treachery - s.world.treacheryProgress} big />
            <Stat icon="MainExplore" value={pv.explore} title="探索 EP" big />
            {pv.completes && <span className="warn">Treachery 會完成</span>}
          </>
        )}
      </div>
      <div className="dec-actions">
        <button className="primary" onClick={() => submit(n)}>
          確認
        </button>
      </div>
    </>
  );
}

function CardsBody() {
  const { d, submit } = useUI();
  const [picked, setPicked] = useState<string[]>([]);
  useEffect(() => setPicked([]), [d]);
  const min = d!.min ?? 0;
  const max = d!.max ?? d!.cards!.length;
  const ok = picked.length >= min && picked.length <= max;
  const toggle = (id: string) => {
    if (picked.includes(id)) setPicked(picked.filter((x) => x !== id));
    else if (max === 1) setPicked([id]);
    else if (picked.length < max) setPicked([...picked, id]);
  };
  return (
    <>
      <div className="dec-note">
        點卡片選擇 ({min === max ? `${max} 張` : `${min}–${max} 張`})
        {d!.rule === 'P4-01' && `：每個信標 +2 探索加成，地點 +1 Obstacle`}
      </div>
      <div className="dec-cards">
        {d!.cards!.map((id) => (
          <Card key={id} id={id} selected={picked.includes(id)} title={cardName(id)} onClick={() => toggle(id)} />
        ))}
      </div>
      <div className="dec-actions">
        {d!.rule === 'P4-01' ? (
          <Stat icon="ExploreBoost" value={`+${picked.length * 2}`} title="探索加成" delta={picked.length} big />
        ) : (
          <Stat value={picked.length} of={min === max ? max : `${min}–${max}`} title="已選張數" big />
        )}
        <button className="primary" disabled={!ok} onClick={() => submit(picked)}>
          確認
        </button>
      </div>
    </>
  );
}

function OrderBody() {
  const { d, submit } = useUI();
  const [order, setOrder] = useState<string[]>([]);
  useEffect(() => setOrder([]), [d]);
  const left = d!.cards!.filter((x) => !order.includes(x));
  return (
    <>
      <div className="dec-note">依序點卡；最後一張成為 echo。</div>
      <div className="dec-cards">
        {order.map((id, i) => (
          <div key={id} className="ordered">
            <Card id={id} />
            <span className="order-no">{i + 1}</span>
          </div>
        ))}
        {left.map((id) => (
          <Card key={id} id={id} dim onClick={() => setOrder([...order, id])} />
        ))}
      </div>
      <div className="dec-actions">
        <button onClick={() => setOrder([])}>重選</button>
        <button className="primary" disabled={left.length > 0} onClick={() => submit(order)}>
          確認
        </button>
      </div>
    </>
  );
}

function ChooseBody() {
  const { s, d, submit } = useUI();
  const opts = d!.options ?? [];
  const revealed = s.world.revealedLocation;
  const travelPv = d!.rule === 'T1c' && revealed ? travelPreview(s, revealed, s.world.deferred.length) : null;
  const cardOpts = opts.filter((o) => asCard(o.id));
  const others = opts.filter((o) => !asCard(o.id));
  return (
    <>
      {travelPv && revealed && (
        <div className="dec-body center-row">
          <Card id={revealed} w={150} />
          <div className="col gap8">
            <Stat icon="Distance" value={travelPv.distance.total} title={`距離 = 地理 ${travelPv.distance.geographic} + Obstacle ${travelPv.distance.obstacles} − Path ${travelPv.distance.paths} + 延後 ${travelPv.distance.deferred}${travelPv.distance.effects ? ` + 效果 ${travelPv.distance.effects}` : ''} (DG-10)`} big />
            <Stat icon="ThreatTrack" value={`+${travelPv.cost.threat}`} title="威脅軌道推進" big />
            <Stat icon="ResistanceTrack" value={`+${travelPv.cost.resistance}`} title="抗性軌道推進" big />
            {travelPv.newTokens > 0 && <Stat icon="ThreatToken" value={travelPv.newTokens} title="新地點的 Threat token (T2c、T3b)" big />}
          </div>
        </div>
      )}
      {cardOpts.length > 0 && (
        <div className="dec-cards">
          {cardOpts.map((o) => (
            <div key={o.id} className={`dec-cardopt${o.legal === false ? ' off' : ''}`} title={o.legal === false ? o.reason : o.label}>
              <Card id={o.id} onClick={o.legal === false ? undefined : () => submit(o.id)} highlight={o.legal !== false} />
              <span className="small">{o.label}</span>
            </div>
          ))}
        </div>
      )}
      <div className="dec-options">
        {others.map((o) => (
          <button
            key={o.id}
            disabled={o.legal === false}
            title={o.legal === false ? `${o.label}：${o.reason ?? '不能選'}` : `${o.label}${o.rule ? ` (${o.rule})` : ''}`}
            onClick={() => submit(o.id)}
          >
            {o.label}
            {o.legal === false && o.reason && <span className="why">{o.reason}</span>}
          </button>
        ))}
      </div>
    </>
  );
}

// ---------------------------------------------------------------- UI-11d 同一張卡有多個效果

export function EffectPicker({ options, onPick, onClose }: { options: Option[]; onPick: (o: Option) => void; onClose: () => void }) {
  return (
    <div className="ov-bg dim" onClick={onClose}>
      <div className="ov-box decision" onClick={(e) => e.stopPropagation()}>
        <div className="dec-head">
          <span className="dec-prompt">使用哪個效果？</span>
          <button className="ghost" onClick={onClose}>
            取消
          </button>
        </div>
        <div className="dec-options">
          {options.map((o) => (
            <button key={o.id} onClick={() => onPick(o)}>
              <Icon name="Action" size={14} /> {o.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
