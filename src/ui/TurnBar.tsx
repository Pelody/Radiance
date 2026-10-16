// UI-08 / UI-11 決定提示列 (細)：DG-08 ~ DG-14 的預覽即時更新；比選擇前變高綠色、變低紅色。
import { useEffect, useState } from 'react';
import type { Option } from '../engine/core';
import { apAvailable, apBreakdown, enemyHP, engagementCount, epBreakdown } from '../engine/calc';
import { cardName } from '../engine/data';
import { attackPreview, validateActionSet } from '../engine/phases';
import { PHASES, PHASE_NAMES, type Phase } from '../engine/types';
import { useUI } from './ctx';
import { isModalDecision } from './overlays';
import { Icon, Stat } from './parts';

export function TurnBar({ error, decisionHidden, onShowDecision }: { error: string | null; decisionHidden: boolean; onShowDecision: () => void }) {
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
      <span className="tb-phase" title={PHASE_NAMES[s.phase as Phase]}>
        {PHASES.indexOf(s.phase as Phase) + 1} {PHASE_NAMES[s.phase as Phase]}
      </span>
      {isModalDecision(d) ? (
        <>
          <Prompt text={d.prompt} rule={d.rule} />
          <div className="tb-preview" />
          {decisionHidden && (
            <button className="primary pinned" onClick={onShowDecision}>
              回到決定
            </button>
          )}
        </>
      ) : (
        <Body />
      )}
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
    default:
      return <DefendBody />;
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
  // UI-11d：效果在卡片 / 技能上發光，點了就用；這裡的選單是備用 (含成長、搜尋、橫置以啟動)
  const effects = opts.filter((o) => o.id.startsWith('effect:') || o.id.startsWith('skill'));
  const more = opts.filter((o) => !o.id.startsWith('assign:') && !o.id.startsWith('attacker:') && o.id !== 'pass' && !effects.includes(o));
  const pass = d!.options!.find((o) => o.id === 'pass');
  if (assign && assignOpts.some((o) => o.id === `assign:${assign}`)) return <AssignBody enemy={assign} onCancel={() => setAssign(null)} />;
  const hint =
    assignOpts.length > 0
      ? '點 Player Area 的敵人分配 AP'
      : attackerOpts.length > 0
        ? '點 Player Area 的敵人，決定下一個攻擊者'
        : effects.length > 0
          ? '可以使用發光的卡片或技能，或按繼續'
          : d!.prompt;
  return (
    <>
      <Prompt text={hint} rule={d!.rule} />
      <div className="tb-preview">{assignOpts.length > 0 && <Stat icon="Attack" value={apAvailable(s)} title="剩餘 AP" big />}</div>
      {effects.length > 0 && <MoreMenu label={`效果 ${effects.length} ▾`} options={effects} onPick={(o) => submit({ option: o.id })} />}
      {more.length > 0 && <MoreMenu label="其他 ▾" options={more} onPick={(o) => submit({ option: o.id })} />}
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
function MoreMenu({ label = '其他 ▾', options, onPick }: { label?: string; options: Option[]; onPick: (o: Option) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="more">
      <button onClick={() => setOpen(!open)}>{label}</button>
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

// ---------------------------------------------------------------- P7-02 防禦 (點手牌)

function DefendBody() {
  const { d, submit } = useUI();
  const opts = (d!.options ?? []).filter((o) => !o.id.startsWith('hand:'));
  const done = opts.find((o) => o.id === 'done');
  const rest = opts.filter((o) => o !== done);
  return (
    <>
      <Prompt text={d!.prompt} rule={d!.rule} />
      <div className="tb-preview">
        <span className="muted small">點手牌中可防禦的卡 (金框)</span>
      </div>
      <OptButtons options={rest} onPick={(o) => submit(o.id)} />
      {done && (
        <button className="primary pinned" onClick={() => submit(done.id)}>
          {done.label}
        </button>
      )}
    </>
  );
}
