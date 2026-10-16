// 成長畫面 (DG-14)、設定、遊戲結束。重要事件改由結算視窗顯示 (UI-11b)。
import { useState } from 'react';
import { abilitySpace, abilityTrackLength, characterSpace, characterTrackLength } from '../engine/tracks';
import { abilityGrowthStatus, characterGrowthStatus } from '../engine/window';
import { useUI } from './ctx';
import type { FlowSettings } from './flow';
import { Icon } from './parts';

function Modal({ title, onClose, children, wide }: { title: string; onClose: () => void; children: React.ReactNode; wide?: boolean }) {
  return (
    <div className="modal-bg" onClick={onClose}>
      <div className={`modal${wide ? ' wide' : ''}`} onClick={(e) => e.stopPropagation()}>
        <div className="panel-head">
          <span className="panel-title">{title}</span>
          <button onClick={onClose}>關閉</button>
        </div>
        {children}
      </div>
    </div>
  );
}

/** DG-14 成長預覽：兩條軌道下一格的費用與效益；不能成長時顯示原因 */
export function GrowthModal({ onClose }: { onClose: () => void }) {
  const { s, opt, anyOpt, submit } = useUI();
  const a = abilityGrowthStatus(s);
  const c = characterGrowthStatus(s);
  const ga = opt('growAbility');
  const gc = opt('growCharacter');
  const benefit = (sp: Record<string, number | undefined>) =>
    Object.entries(sp)
      .filter(([k, v]) => k !== 'cost' && v !== undefined)
      .map(([k, v]) => {
        const icon = { unlock: 'Unlocked', recruit: 'Recruit', upgrade: 'Upgrade', light: 'Light', hand_size: 'HandSize', rest: 'Rest', perm_booster: 'PermBooster' }[k] ?? k;
        return (
          <span key={k} className="gb">
            <Icon name={icon} size={14} />
            {v}
          </span>
        );
      });
  const track = (len: number, pos: number, get: (i: number) => Record<string, number | undefined>) => (
    <div className="gtrack">
      {Array.from({ length: len + 1 }, (_, i) => (
        <div key={i} className={`gcell${i === pos ? ' cur' : i < pos ? ' done' : ''}`}>
          <span className="gcost">{i === 0 ? 'Start' : `${get(i).cost} XP`}</span>
          <span className="gben">{benefit(get(i))}</span>
        </div>
      ))}
    </div>
  );
  const why = (o: ReturnType<typeof opt>, st: { ok: boolean; reason?: string }, id: string) =>
    o ? '' : !st.ok ? (st.reason ?? '') : (anyOpt(id)?.reason ?? '現在不能成長 (KC-06：只能在行動窗口)');
  return (
    <Modal title="Growth" onClose={onClose} wide>
      <div className="growth">
        <div className="grow-head">
          <Icon name="AbilityGrowth" size={18} /> Ability Growth
          <button className="primary" disabled={!ga} title={why(ga, a, 'growAbility')} onClick={() => submit({ option: 'growAbility' })}>
            成長 ({a.cost} XP)
          </button>
          <span className="muted small">{why(ga, a, 'growAbility')}</span>
        </div>
        {track(abilityTrackLength(s), s.player.abilityGrowthPos, (i) => abilitySpace(s, i) as Record<string, number | undefined>)}
        <div className="grow-head">
          <Icon name="CharacterGrowth" size={18} /> Character Growth
          <button className="primary" disabled={!gc} title={why(gc, c, 'growCharacter')} onClick={() => submit({ option: 'growCharacter' })}>
            成長 ({c.cost} XP)
          </button>
          <span className="muted small">{why(gc, c, 'growCharacter')}</span>
        </div>
        {track(characterTrackLength(s), s.player.characterGrowthPos, (i) => characterSpace(s, i) as Record<string, number | undefined>)}
        <div className="muted small">XP {s.player.xp}</div>
      </div>
    </Modal>
  );
}

export function SettingsModal({
  onClose,
  settings,
  setSettings,
  onQuit,
}: {
  onClose: () => void;
  settings: FlowSettings;
  setSettings: (s: FlowSettings) => void;
  onQuit: () => void;
}) {
  const [sure, setSure] = useState(false);
  return (
    <Modal title="設定" onClose={onClose}>
      <label className="row gap10">
        <input type="checkbox" checked={settings.stopAtEveryWindow} onChange={(e) => setSettings({ ...settings, stopAtEveryWindow: e.target.checked })} />
        每個行動窗口都停 (UI-10)
      </label>
      <label className="row gap10" style={{ marginTop: 10 }}>
        <input type="checkbox" checked={settings.phaseIntro !== false} onChange={(e) => setSettings({ ...settings, phaseIntro: e.target.checked })} />
        階段開場視窗 (UI-11a)
      </label>
      <div className="row gap10" style={{ marginTop: 10 }}>
        結算動畫 (UI-11b)
        {(['fast', 'normal', 'slow', 'off'] as const).map((k) => (
          <button key={k} className={(settings.animSpeed ?? 'normal') === k ? 'primary' : ''} onClick={() => setSettings({ ...settings, animSpeed: k })}>
            {{ fast: '快', normal: '普通', slow: '慢', off: '不播放' }[k]}
          </button>
        ))}
      </div>
      <div className="row gap10" style={{ marginTop: 16 }}>
        {sure ? (
          <>
            <span>放棄目前這局？</span>
            <button className="primary" onClick={onQuit}>
              放棄並開新遊戲
            </button>
            <button onClick={() => setSure(false)}>取消</button>
          </>
        ) : (
          <button onClick={() => setSure(true)}>新遊戲</button>
        )}
      </div>
    </Modal>
  );
}

export function GameOver({ onNew }: { onNew: () => void }) {
  const { s } = useUI();
  const o = s.outcome!;
  return (
    <div className="events">
      <div className={`events-box over ${o.result}`}>
        <div className="over-title">{o.result === 'win' ? '勝利' : '失敗'}</div>
        <div>{o.reason}</div>
        <div className="muted small">
          第 {s.round} 回合 · {o.rule}
        </div>
        <button className="primary" onClick={onNew}>
          新遊戲
        </button>
      </div>
    </div>
  );
}
