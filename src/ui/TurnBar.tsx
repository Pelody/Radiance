// UI-08「輪到你」決定列：DG-08 ~ DG-14 的預覽即時更新；比選擇前變高綠色、變低紅色。
import { useEffect, useState } from 'react';
import type { Option } from '../engine/core';
import { apAvailable, apBreakdown, enemyHP, engagementCount, epBreakdown } from '../engine/calc';
import { cardName } from '../engine/data';
import { attackPreview, validateActionSet } from '../engine/phases';
import { useUI } from './ctx';
import { Card, Icon, Stat } from './parts';
import { coverPreview, travelPreview } from './preview';

export function TurnBar({ error }: { error: string | null }) {
  const { d, s } = useUI();
  if (s.outcome) {
    return (
      <section className="turnbar" aria-label="目前的決定">
        <span className="tb-title">{s.outcome.result === 'win' ? '勝利' : '失敗'}</span>
        <span className="tb-prompt">{s.outcome.reason}</span>
      </section>
    );
  }
  if (!d) return <section className="turnbar" />;
  return (
    <section className="turnbar" aria-label="目前的決定">
      <span className="tb-title">輪到你</span>
      <Body />
      {error && (
        <span className="tb-error" title={error}>
          {error}
        </span>
      )}
    </section>
  );
}

function Body() {
  const { d } = useUI();
  switch (d!.type) {
    case 'actionSet':
      return <ActionSetBody />;
    case 'window':
      return <WindowBody />;
    case 'number':
      return <NumberBody />;
    case 'cards':
      return <CardsBody />;
    case 'order':
      return <OrderBody />;
    default:
      return <ChooseBody />;
  }
}

function Prompt({ text, rule }: { text: string; rule?: string }) {
  return (
    <span className="tb-prompt" title={`${text}${rule ? ` (${rule})` : ''}`}>
      {text}
    </span>
  );
}

function OptButtons({ options, onPick, primary }: { options: Option[]; onPick: (o: Option) => void; primary?: string }) {
  return (
    <div className="tb-buttons">
      {options.map((o) => (
        <button
          key={o.id}
          className={o.id === primary ? 'primary' : ''}
          disabled={o.legal === false}
          title={o.legal === false ? `${o.label}：${o.reason ?? '不能選'}` : `${o.label}${o.rule ? ` (${o.rule})` : ''}`}
          onClick={() => onPick(o)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------- P2 Action Set (DG-08)

function ActionSetBody() {
  const { s, sel, setSel, preview, submit } = useUI();
  const p = preview!;
  const err = p.complete ? validateActionSet({ s }, sel) : null;
  const ap0 = apBreakdown(s).total;
  const ep0 = epBreakdown(s).total;
  const skills = p.element ? s.player.skills.filter((k) => k.unlocked && !k.exhausted && k.cubeElement === p.element).map((k) => k.name) : [];
  return (
    <>
      <Prompt text={p.complete ? '確認行動組' : `選 ${3 - [sel.action, sel.attack, sel.booster].filter(Boolean).length} 張卡`} rule="P2-01" />
      <div className="tb-preview">
        <Stat icon="Light" value={p.light} title={`Light (光費 ${p.cost})`} delta={p.light - s.player.light} big />
        <Stat icon="Engagement" value={p.engageReveal ? `${p.engage}+` : p.engage} title="Engagement" delta={p.engage - engagementCount(s)} big />
        <Stat icon="Attack" value={p.ap} title={`Attack${p.state.roundState.attackType ? ` (${p.state.roundState.attackType})` : ''}`} delta={p.ap - ap0} big>
          {p.state.roundState.attackType && <Icon name={p.state.roundState.attackType} size={16} />}
        </Stat>
        <Stat icon="MainExplore" value={p.ep} title="Explore" delta={p.ep - ep0} big />
        {p.element && (
          <Stat icon={p.element} title={`Element：${p.element}；啟動的技能 ${skills.join('、') || '無'}`} big>
            <b className="gold small">{skills.join('、') || '—'}</b>
          </Stat>
        )}
      </div>
      <div className="tb-buttons">
        <button onClick={() => setSel({})}>重選</button>
        <button className="primary" disabled={!p.complete || !!err} title={err ?? '確認'} onClick={() => submit(sel)}>
          確認
        </button>
      </div>
    </>
  );
}

// ---------------------------------------------------------------- 窗口 (EE-17)

function WindowBody() {
  const { s, d, submit, assign, setAssign } = useUI();
  const opts = d!.options!.filter((o) => o.legal !== false);
  const assignOpts = opts.filter((o) => o.id.startsWith('assign:'));
  const attackerOpts = opts.filter((o) => o.id.startsWith('attacker:'));
  const others = opts.filter((o) => !o.id.startsWith('assign:') && !o.id.startsWith('attacker:') && o.id !== 'pass');
  // UI-10：會讓畫面停下的效果放外面，其他收進選單
  const main = others.filter((o) => o.id.startsWith('effect:') || o.id.startsWith('skill:'));
  const more = others.filter((o) => !main.includes(o));
  const pass = d!.options!.find((o) => o.id === 'pass');
  if (assign && assignOpts.some((o) => o.id === `assign:${assign}`)) return <AssignBody enemy={assign} onCancel={() => setAssign(null)} />;
  return (
    <>
      <Prompt text={d!.prompt} rule={d!.rule} />
      <div className="tb-preview">
        {assignOpts.length > 0 && (
          <>
            <Stat icon="Attack" value={apAvailable(s)} title="剩餘 AP" big />
            <span className="muted small">點 Player Area 的敵人分配 AP</span>
          </>
        )}
        {attackerOpts.length > 0 && <span className="muted small">點敵人決定下一個攻擊者 (P7-01)</span>}
      </div>
      <OptButtons options={[...attackerOpts, ...main]} onPick={(o) => submit({ option: o.id })} />
      {more.length > 0 && <MoreMenu options={more} onPick={(o) => submit({ option: o.id })} />}
      {pass && (
        <button
          className="primary pinned"
          disabled={pass.legal === false}
          title={pass.legal === false ? (pass.reason ?? '') : '繼續 (EE-17)'}
          onClick={() => submit({ option: 'pass' })}
        >
          繼續
        </button>
      )}
    </>
  );
}

/** 次要選項 (成長、搜尋、橫置以啟動…)：收在選單裡，墊子與上方按鈕也能直接用 */
function MoreMenu({ options, onPick }: { options: Option[]; onPick: (o: Option) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="more">
      <button onClick={() => setOpen(!open)}>其他 ▾</button>
      {open && (
        <div className="more-list" onMouseLeave={() => setOpen(false)}>
          {options.map((o) => (
            <button
              key={o.id}
              onClick={() => {
                setOpen(false);
                onPick(o);
              }}
              title={o.rule}
            >
              {o.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** DG-11 Attack 預覽 */
function AssignBody({ enemy, onCancel }: { enemy: string; onCancel: () => void }) {
  const { s, submit, setAssign } = useUI();
  const max = apAvailable(s);
  const e = s.world.enemies[enemy];
  const left = enemyHP(s, enemy) - (e?.wounds ?? 0);
  const [amount, setAmount] = useState(Math.min(max, left + attackPreview(s, enemy, max).blocked));
  useEffect(() => setAmount(Math.max(1, Math.min(max, left + attackPreview(s, enemy, max).blocked))), [enemy]); // eslint-disable-line react-hooks/exhaustive-deps
  const pv = attackPreview(s, enemy, amount);
  return (
    <>
      <Prompt text={`${cardName(enemy)}：分配 AP`} rule="P6-02" />
      <div className="tb-preview">
        <div className="stepper">
          <button onClick={() => setAmount(Math.max(1, amount - 1))}>−</button>
          <Stat icon="Attack" value={amount} title="分配的 AP" big />
          <button onClick={() => setAmount(Math.min(max, amount + 1))}>+</button>
        </div>
        <Stat icon="Defense" value={pv.blocked} title="被擋下" big />
        <Stat icon="Wound" value={pv.wounds} of={left} title="造成的傷害 / 剩餘 HP" delta={pv.wounds >= left ? 1 : 0} big />
        <Stat icon="Attack" value={max - amount} title="分配後剩餘 AP" big />
      </div>
      <div className="tb-buttons">
        <button onClick={onCancel}>重選</button>
        <button
          className="primary"
          onClick={() => {
            setAssign(null);
            submit({ option: `assign:${enemy}`, amount });
          }}
        >
          確認
        </button>
      </div>
    </>
  );
}

// ---------------------------------------------------------------- 數字 (P4-02 cover)

function NumberBody() {
  const { s, d, submit } = useUI();
  const min = d!.min ?? 0;
  const max = d!.max ?? 0;
  const [n, setN] = useState(max);
  useEffect(() => setN(max), [d, max]);
  const pv = d!.rule === 'P4-02' ? coverPreview(s, n) : null;
  return (
    <>
      <Prompt text={d!.prompt} rule={d!.rule} />
      <div className="tb-preview">
        <div className="stepper">
          <button onClick={() => setN(Math.max(min, n - 1))}>−</button>
          <Stat icon="Darkness" value={n} title="抵消的黑暗" big />
          <button onClick={() => setN(Math.min(max, n + 1))}>+</button>
        </div>
        {pv && (
          <>
            <Stat
              icon="Progress"
              value={pv.treachery}
              of={pv.pv}
              title={`Treachery Progress${pv.completes ? '：會完成！' : ''}`}
              delta={pv.treachery - s.world.treacheryProgress}
              big
            />
            <Stat icon="MainExplore" value={pv.explore} title="探索 EP" big />
          </>
        )}
      </div>
      <div className="tb-buttons">
        <button className="primary" onClick={() => submit(n)}>
          確認
        </button>
      </div>
    </>
  );
}

// ---------------------------------------------------------------- 選卡 (信標)

function CardsBody() {
  const { d, submit } = useUI();
  const [picked, setPicked] = useState<string[]>([]);
  useEffect(() => setPicked([]), [d]);
  return (
    <>
      <Prompt text={d!.prompt} rule={d!.rule} />
      <div className="tb-preview">
        {d!.cards!.map((id) => (
          <Card key={id} id={id} w={40} selected={picked.includes(id)} onClick={() => setPicked(picked.includes(id) ? picked.filter((x) => x !== id) : [...picked, id])} />
        ))}
        {d!.rule === 'P4-01' && <Stat icon="ExploreBoost" value={`+${picked.length * 2}`} title="探索加成" delta={picked.length} big />}
      </div>
      <div className="tb-buttons">
        <button className="primary" onClick={() => submit(picked)}>
          確認
        </button>
      </div>
    </>
  );
}

// ---------------------------------------------------------------- 排序 (P8-04)

function OrderBody() {
  const { d, submit } = useUI();
  const [order, setOrder] = useState<string[]>([]);
  useEffect(() => setOrder([]), [d]);
  const left = d!.cards!.filter((x) => !order.includes(x));
  return (
    <>
      <Prompt text={`${d!.prompt}：依序點卡`} rule={d!.rule} />
      <div className="tb-preview">
        {order.map((id, i) => (
          <span key={id} className="order-chip" title={cardName(id)}>
            {i + 1}. {cardName(id)}
          </span>
        ))}
        {left.map((id) => (
          <Card key={id} id={id} w={40} onClick={() => setOrder([...order, id])} />
        ))}
      </div>
      <div className="tb-buttons">
        <button onClick={() => setOrder([])}>重選</button>
        <button className="primary" disabled={left.length > 0} onClick={() => submit(order)}>
          確認
        </button>
      </div>
    </>
  );
}

// ---------------------------------------------------------------- 一般選擇

function ChooseBody() {
  const { s, d, submit } = useUI();
  const opts = d!.options ?? [];
  const revealed = s.world.revealedLocation;
  const travelPv = d!.rule === 'T1c' && revealed ? travelPreview(s, revealed, s.world.deferred.length) : null;
  // P7-02 手牌的卡直接點手牌，這裡只列其他選項
  const shown = d!.rule === 'P7-02' ? opts.filter((o) => !o.id.startsWith('hand:')) : opts;
  return (
    <>
      <Prompt text={d!.prompt} rule={d!.rule} />
      <div className="tb-preview">
        {travelPv && (
          <>
            <Stat icon="Distance" value={travelPv.distance.total} title={`距離 = 地理 ${travelPv.distance.geographic} + Obstacle ${travelPv.distance.obstacles} − Path ${travelPv.distance.paths} + 延後 ${travelPv.distance.deferred}${travelPv.distance.effects ? ` + 效果 ${travelPv.distance.effects}` : ''} (DG-10)`} big />
            <Stat icon="ThreatTrack" value={`+${travelPv.cost.threat}`} title="威脅軌道推進" big />
            <Stat icon="ResistanceTrack" value={`+${travelPv.cost.resistance}`} title="抗性軌道推進" big />
            {travelPv.newTokens > 0 && <Stat icon="ThreatToken" value={travelPv.newTokens} title="新地點的 Threat token (T2c、T3b)" big />}
          </>
        )}
        {d!.rule === 'P7-02' && <span className="muted small">點手牌中可防禦的卡 (金框)</span>}
      </div>
      <OptButtons options={shown} onPick={(o) => submit(o.id)} />
    </>
  );
}
