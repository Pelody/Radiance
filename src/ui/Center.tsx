// UI-05a 中間：任務區 + Treachery、玩家區、玩家板 (行動卡、墊子、加成卡、夥伴、攻擊卡、探索卡、嗜好市場)、手牌。
import { enemyHP, questDarkness, enemyAttack, enemyTypes, engagementCount, treacheryPV } from '../engine/calc';
import { cardName, skillMat } from '../engine/data';
import { skillUsable } from '../engine/effects';
import type { SkillState } from '../engine/types';
import { useUI, windowOption } from './ctx';
import { Badge, Card, Icon, Panel, Slot, Stat, useLongPressZoom } from './parts';

// ---------------------------------------------------------------- 任務區

export function QuestArea() {
  const { s, preview } = useUI();
  const w = s.world;
  const dark = questDarkness(s);
  // UI-09 將接戰的敵人 (Action Set 時與預覽同一套計算)
  const engage = s.phase === 'actionSet' ? (preview?.engage ?? engagementCount(s)) : 0;
  const willEngage = new Set(w.questArea.slice(Math.max(0, w.questArea.length - engage)));
  const t = w.activeTreachery;
  const pv = treacheryPV(s);
  return (
    <section className="panel quest">
      <div className="quest-main">
        <div className="panel-head">
          <span className="row gap10">
            <span className="panel-title">Quest Area</span>
            <Stat icon="Darkness" value={dark.effective} title={`Darkness (任務區黑暗${dark.ignored ? `，忽略 ${dark.ignored}` : ''})`} />
          </span>
          <span className="muted small">back ← · → front</span>
        </div>
        <div className="cards-row">
          {w.questArea.length === 0 && <span className="muted small empty">沒有敵人</span>}
          {w.questArea.map((id) => (
            <EnemyCard key={id} id={id} engage={willEngage.has(id)} />
          ))}
        </div>
      </div>
      <div className="vsep" />
      <div className="treachery">
        <div className="panel-title" style={{ marginBottom: 8 }}>
          Treachery
        </div>
        {t ? <Card id={t} w={101} /> : <Slot label="Treachery" w={141} h={101} />}
        <div className="stat tprog" title="Treachery Progress / PV">
          <Icon name="Progress" size={15} />
          <b>
            {w.treacheryProgress}
            <span className="of">/{pv}</span>
          </b>
          <div className="bar">
            <div style={{ width: `${pv ? Math.min(100, (100 * w.treacheryProgress) / pv) : 0}%` }} />
          </div>
        </div>
        {w.completedTreacheries.length > 0 && (
          <div className="legacies">
            {w.completedTreacheries.map((id) => (
              <Card key={id} id={id} w={34} title={`${cardName(id)} legacy`} />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function EnemyCard({ id, engage, onClick, selected, dim }: { id: string; engage?: boolean; onClick?: () => void; selected?: boolean; dim?: boolean }) {
  const { s } = useUI();
  const e = s.world.enemies[id];
  const disarmed = s.roundState.disarmed.includes(id);
  return (
    <Card
      id={id}
      onClick={onClick}
      selected={selected || engage}
      dim={dim}
      title={`${cardName(id)}：攻擊 ${enemyAttack(s, id)} ${enemyTypes(s, id).join('/')}`}
      badges={
        <>
          {engage && (
            <span className="engage-mark" title="將接戰 (UI-09)">
              <Icon name="Engagement" size={14} />
            </span>
          )}
          {e && e.wounds > 0 && <Badge icon="Wound" value={`${e.wounds}/${enemyHP(s, id)}`} pos="br" title="Wounds / HP" />}
          {e && e.progress > 0 && <Badge icon="Progress" value={e.progress} pos="bl" title="Progress" />}
          {disarmed && <span className="badge top">Disarm</span>}
        </>
      }
    />
  );
}

// ---------------------------------------------------------------- 玩家區

export function PlayerArea() {
  const { s, d, submit, assign, setAssign, opt } = useUI();
  const ids = s.world.playerArea;
  return (
    <section className="player-area">
      <span className="panel-title abs">Player Area</span>
      {ids.length === 0 && <span className="muted small">沒有接戰的敵人</span>}
      {ids.map((id) => {
        const a = opt(`assign:${id}`);
        const atk = opt(`attacker:${id}`);
        const click = a ? () => setAssign(id) : atk ? () => submit({ option: atk.id }) : undefined;
        const attacked = s.roundState.attackedThisPhase.includes(id) && s.phase === 'attack';
        return <EnemyCard key={id} id={id} onClick={click} selected={assign === id || (!!click && d?.type === 'window')} dim={attacked} />;
      })}
      {s.world.revealedLocation && (
        <div className="revealed">
          <span className="muted small">翻開的地點</span>
          <Card id={s.world.revealedLocation} />
        </div>
      )}
      {s.world.deferred.length > 0 && (
        <div className="deferred" title="延後的地點 (T1c)">
          <span className="muted small">延後</span>
          {s.world.deferred.map((x) => (
            <Card key={x} id={x} w={40} />
          ))}
        </div>
      )}
    </section>
  );
}

// ---------------------------------------------------------------- 玩家板

/** 技能在墊子圖上的位置 (墊子 283.5×178，依設計稿量測的比例) */
function skillRect(sk: SkillState): { l: number; t: number; w: number; h: number } {
  const rows3 = [
    [0, 0.298],
    [0.298, 0.567],
    [0.567, 0.843],
  ];
  if (sk.mat === 'luminary') {
    if (sk.column === 0) {
      const r = [
        [0, 0.444],
        [0.444, 0.848],
      ][sk.row];
      return { l: 0.367, t: r[0], w: 0.307, h: r[1] - r[0] };
    }
    const r = rows3[sk.row];
    return { l: 0.674, t: r[0], w: 0.326, h: r[1] - r[0] };
  }
  if (sk.column === 2) return { l: 0.653, t: 0.455, w: 0.347, h: 0.388 };
  const r = rows3[sk.row];
  return { l: sk.column === 0 ? 0 : 0.326, t: r[0], w: 0.328, h: r[1] - r[0] };
}

const MAT_W = 283.5;
const MAT_H = 178;

function Mat({ name }: { name: string }) {
  const { s, d, submit, preview } = useUI();
  const mat = skillMat(name);
  const look = preview?.complete ? preview.state : s;
  const skills = s.player.skills.filter((k) => k.mat === mat.mat_type);
  const lp = useLongPressZoom(mat.id); // 長按墊子 (含技能) 放大看技能文字
  return (
    <div className="mat" style={{ width: MAT_W, height: MAT_H }} {...lp.handlers}>
      <img src={`cards/${mat.id}.webp`} alt={name} draggable={false} />
      {skills.map((sk) => {
        const r = skillRect(sk);
        const usable = sk.unlocked && skillUsable(look, sk);
        const o = windowOption(d, (x) => x.data?.skill === sk.name && (x.id.startsWith('skill') || x.id.startsWith('activate:')));
        const why = !sk.unlocked ? '未解鎖' : !usable ? (sk.exhausted ? '方塊已橫置' : `未啟動：需要 ${sk.cubeElement} 加成卡`) : '可用';
        return (
          <div
            key={sk.name}
            className={`skill${sk.unlocked ? '' : ' locked'}${usable ? ' usable' : ''}${o ? ' clickable' : ''}`}
            style={{ left: r.l * MAT_W, top: r.t * MAT_H, width: r.w * MAT_W, height: r.h * MAT_H }}
            title={`${sk.name}：${why}${o ? `\n點擊：${o.label}` : ''} (DG-16)`}
            onClick={o ? lp.click(() => submit({ option: o.id })) : undefined}
          >
            <span className={`cube ${sk.cubeElement}${sk.exhausted ? ' x' : ''}`}>{sk.cubeElement[0]}</span>
            {usable && <span className="usable-tag">可用</span>}
          </div>
        );
      })}
    </div>
  );
}

export function PlayerBoard() {
  const { s, sel, setSel, d } = useUI();
  const p = s.player;
  const choosing = d?.type === 'actionSet';
  const slotCard = (slot: 'action' | 'attack' | 'booster') => (choosing ? sel[slot] : (p.actionSet[slot] ?? undefined));
  const slot = (k: 'action' | 'attack' | 'booster', label: string, left: number, top = 0) => {
    const id = slotCard(k);
    return (
      <div className="abs" style={{ left, top }}>
        {id ? (
          <Card id={id} selected={choosing} onClick={choosing ? () => setSel({ ...sel, [k]: undefined }) : undefined} title={choosing ? '點擊放回手牌' : undefined} />
        ) : (
          <Slot label={label} />
        )}
      </div>
    );
  };
  return (
    <section className="board" aria-label="玩家板">
      <div className="board-row" style={{ height: 178 }}>
        {slot('action', 'Action', 0)}
        <div className="abs mats" style={{ left: 111 }}>
          <Mat name={p.luminary} />
          <Mat name={p.profession} />
        </div>
        {slot('booster', 'Booster', 688)}
        <div className="abs" style={{ left: 799 }}>
          <Slot label="Companion" />
        </div>
      </div>
      <div className="board-row" style={{ height: 157, marginTop: 8 }}>
        <div className="abs perm" style={{ left: 0, width: 260 }} title="永久加成卡 (KC-09)">
          {p.permBoosters.map((id) => (
            <Card key={id} id={id} w={56} />
          ))}
        </div>
        {slot('attack', 'Attack', 279)}
        <div className="abs" style={{ left: 409 }}>
          {p.actionSet.explore ? <Card id={p.actionSet.explore} /> : <Slot label="Explore" />}
        </div>
        <div className="abs market" style={{ left: 688 }}>
          {p.hobbyMarket.map((id) => (
            <Card key={id} id={id} />
          ))}
          <span className="market-label">Hobby Market · {p.hobby}</span>
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------- 手牌

export function Hand() {
  const { s, d, sel, setSel, submit, opt } = useUI();
  const p = s.player;
  const choosing = d?.type === 'actionSet';
  const chosen = new Set([sel.action, sel.attack, sel.booster]);
  const click = (id: string) => {
    if (choosing) {
      if (chosen.has(id)) return;
      const k = !sel.action ? 'action' : !sel.attack ? 'attack' : !sel.booster ? 'booster' : null;
      if (k) setSel({ ...sel, [k]: id });
      return;
    }
    const o = opt(`hand:${id}`) ?? opt(id);
    if (o) submit(o.id);
  };
  const hand = p.hand.filter((id) => !(choosing && chosen.has(id)));
  return (
    <section className="hand" aria-label="Hand">
      <Stat icon="HandSize" value={p.hand.length} title="手牌" style={{ position: 'absolute', left: 0, bottom: 0 }} />
      {hand.map((id) => {
        const clickable = choosing || !!opt(`hand:${id}`) || !!opt(id);
        return <Card key={id} id={id} onClick={clickable ? () => click(id) : undefined} highlight={!choosing && clickable} />;
      })}
    </section>
  );
}

export { Panel };
