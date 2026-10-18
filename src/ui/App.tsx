// 主畫面 (UI-05a)：1600×1000 設計，依視窗大小等比例縮放 (UI-08a)。
import { useEffect, useMemo, useState } from 'react';
import { cardImagePath, getCard } from '../engine/data';
import { Counts, StatusPanel, Tracks } from './Right';
import { Hand, PlayerArea, PlayerBoard, QuestArea } from './Center';
import { Header } from './Header';
import { GrowthPanel, LogPanel, MapPanel, WorldPanel } from './World';
import { GameOver, GrowthModal, SettingsModal } from './Modals';
import { DecisionModal, EffectPicker, PhaseIntro, Resolution, isModalDecision } from './overlays';
import type { Option } from '../engine/core';
import { NewGame } from './NewGame';
import { TurnBar } from './TurnBar';
import { UIContext, makeOptLookup, type UI } from './ctx';
import { ZoomContext, type ZoomTarget } from './parts';
import { actionSetPreview, type ActionSel } from './preview';
import { useGameStore } from './store';

const W = 1600;
const H = 1000;

function useScale(): number {
  const calc = () => Math.min(window.innerWidth / W, window.innerHeight / H);
  const [k, setK] = useState(calc);
  useEffect(() => {
    const f = () => setK(calc());
    window.addEventListener('resize', f);
    return () => window.removeEventListener('resize', f);
  }, []);
  return k;
}

export function App() {
  const store = useGameStore();
  const scale = useScale();
  const [zoom, setZoom] = useState<ZoomTarget | null>(null);
  const [sel, setSel] = useState<ActionSel>({});
  const [assign, setAssign] = useState<string | null>(null);
  const [modal, setModal] = useState<'growth' | 'settings' | null>(null);
  /** UI-11a 本次開啟已經看過開場的階段 (round|phase) */
  const [introduced, setIntroduced] = useState<Set<string>>(() => new Set());
  /** UI-11c 決定視窗暫時收起 (看盤面) */
  const [hidden, setHidden] = useState(false);
  /** UI-11d 同一張卡有多個效果 */
  const [picker, setPicker] = useState<Option[] | null>(null);
  const v = store.view;

  // 待決策改變時清掉暫存的選擇
  const sig = v?.pending ? `${v.state.round}|${v.state.phase}|${v.pending.type}|${v.pending.prompt}|${store.game?.session.answers.length}` : '';
  useEffect(() => {
    if (v?.pending?.type !== 'actionSet') setSel({});
    setAssign(null);
    setHidden(false);
    setPicker(null);
  }, [sig]); // eslint-disable-line react-hooks/exhaustive-deps

  const ui: UI | null = useMemo(() => {
    if (!v) return null;
    const d = v.pending;
    const preview = d?.type === 'actionSet' ? actionSetPreview(v.state, sel) : null;
    return { s: v.state, d, submit: store.submit, sel, setSel, preview, assign, setAssign, pickEffect: setPicker, ...makeOptLookup(d) };
  }, [v, sel, assign, store.submit]);

  const stage = (content: React.ReactNode) => (
    <div className="viewport">
      <div className="stage" style={{ width: W, height: H, transform: `scale(${scale})` }}>
        {content}
      </div>
    </div>
  );

  if (!ui) return stage(<NewGame onStart={store.start} />);

  // UI-11 彈出視窗一次只開一個：結算 → 階段開場 → 決定視窗；遊戲結束在結算之後
  const introKey = `${ui.s.round}|${ui.s.phase}`;
  const showResolution = store.events.length > 0;
  const showIntro = !showResolution && !ui.s.outcome && !!ui.d && store.settings.phaseIntro !== false && !introduced.has(introKey);
  const showDecision = !showResolution && !showIntro && !ui.s.outcome && isModalDecision(ui.d) && !hidden;

  return stage(
    <UIContext.Provider value={ui}>
      <ZoomContext.Provider value={setZoom}>
        <div className="screen">
          <Header onUndo={store.undo} canUndo={store.canUndo} onGrowth={() => setModal('growth')} onSettings={() => setModal('settings')} />
          <div className="body">
            <aside className="left" aria-label="世界">
              <WorldPanel />
              <MapPanel />
              <GrowthPanel onOpen={() => setModal('growth')} />
              <LogPanel />
            </aside>
            <main className="center">
              <QuestArea />
              <PlayerArea />
              <TurnBar error={store.error} decisionHidden={hidden} onShowDecision={() => setHidden(false)} />
              <PlayerBoard />
              <Hand />
            </main>
            <aside className="right" aria-label="狀態與軌道">
              <StatusPanel />
              <Tracks />
              <Counts />
            </aside>
          </div>
          {zoom && <Zoom z={zoom} scale={scale} />}
          {modal === 'growth' && <GrowthModal onClose={() => setModal(null)} />}
          {modal === 'settings' && (
            <SettingsModal
              onClose={() => setModal(null)}
              settings={store.settings}
              setSettings={store.setSettings}
              onQuit={() => {
                setModal(null);
                store.quit();
              }}
            />
          )}
          {showResolution && <Resolution key={store.events.length} events={store.events} speed={store.settings.animSpeed} onClose={store.dismissEvents} />}
          {showIntro && <PhaseIntro onClose={() => setIntroduced(new Set([...introduced, introKey]))} />}
          {showDecision && <DecisionModal onHide={() => setHidden(true)} />}
          {picker && (
            <EffectPicker
              options={picker}
              onClose={() => setPicker(null)}
              onPick={(o) => {
                setPicker(null);
                store.submit({ option: o.id });
              }}
            />
          )}
          {ui.s.outcome && !showResolution && <GameOver onNew={store.quit} />}
        </div>
      </ZoomContext.Provider>
    </UIContext.Provider>,
  );
}

/** UI-04 放大 (滑鼠停留／觸控長按)：一律顯示在畫面正中間 (Paul 要求) */
function Zoom({ z }: { z: ZoomTarget; scale: number }) {
  const c = getCard(z.id);
  const big = c.type === 'skill_mat' ? { w: 1010, h: 636 } : c.rotated ? { w: 448, h: 320 } : { w: 320, h: 448 };
  return (
    <div className="zoom" style={{ left: (W - big.w) / 2, top: (H - big.h) / 2, width: big.w, height: big.h }}>
      <img src={cardImagePath(z.id)} alt={c.name ?? z.id} />
    </div>
  );
}
