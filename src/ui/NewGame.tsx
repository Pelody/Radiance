// 開局選擇 (SU-01、SU-06、SU-07、SU-15、SU-21)。另有「官方範例開局」(Example Turn Guide 的固定設定)。
import { useState } from 'react';
import type { Difficulty } from '../engine/config';
import { LUMINARIES, PROFESSIONS, SHADES, type Element } from '../engine/data';
import type { SetupOptions } from '../engine/setup';
import scenario from '../../tests/scenario_example_turn.json';

const DIFFS: Difficulty[] = ['Ember', 'Spark', 'Flame', 'Blaze', 'Radiant', 'High Radiance'];

export function exampleSetup(): SetupOptions {
  const S = scenario.setup;
  return {
    luminary: S.luminary,
    profession: S.profession,
    hobby: S.hobby_profession,
    permSource: S.perm_booster_source_profession,
    shade: S.shade,
    difficulty: 'Blaze',
    seed: 1,
    config: { ignoreShadeSetup: true, ignoreShadeSpecial: true },
    fixed: {
      skills: S.skills.map((k) => ({ name: k.name, element: k.element as Element, unlocked: k.unlocked })),
      deck: S.deck_top_to_bottom,
      duskDeck: S.dusk_deck_top_to_bottom,
      doomDeck: S.doom_deck_top_to_bottom,
      activeTreachery: S.active_treachery,
      locationDeck: S.location_deck_top_to_bottom,
    },
  };
}

export function NewGame({ onStart }: { onStart: (o: SetupOptions) => void }) {
  const [lum, setLum] = useState<string>('Courage');
  const [prof, setProf] = useState<string>('Wayfarer');
  const others = PROFESSIONS.filter((p) => p !== prof);
  const [hobby, setHobby] = useState<string>(others[0]);
  const [perm, setPerm] = useState<string>(others[1]);
  const [shade, setShade] = useState<string>('Greed');
  const [diff, setDiff] = useState<Difficulty>('Blaze');
  const fix = (p: string) => {
    setProf(p);
    const o = PROFESSIONS.filter((x) => x !== p);
    setHobby(o[0]);
    setPerm(o[1]);
  };
  const pick = (label: string, value: string, list: readonly string[], set: (v: string) => void, disabled: string[] = []) => (
    <div className="ng-row">
      <span className="ng-label">{label}</span>
      {list.map((x) => (
        <button key={x} className={x === value ? 'primary' : ''} disabled={disabled.includes(x)} onClick={() => set(x)}>
          {x}
        </button>
      ))}
    </div>
  );
  return (
    <div className="newgame">
      <div className="logo big">Radiance</div>
      <div className="panel ng">
        {pick('Luminary', lum, LUMINARIES, setLum)}
        {pick('Profession', prof, PROFESSIONS, fix)}
        {pick('Hobby', hobby, PROFESSIONS, setHobby, [prof, perm])}
        {pick('Perm. Booster', perm, PROFESSIONS, setPerm, [prof, hobby])}
        {pick('Shade', shade, SHADES, setShade)}
        {pick('難度', diff, DIFFS, (v) => setDiff(v as Difficulty))}
        <div className="ng-row end">
          <button
            onClick={() => onStart(exampleSetup())}
            title="Example Turn Guide 的固定開局：Justice + Wayfarer vs Greed，不洗牌"
          >
            官方範例開局
          </button>
          <button
            className="primary"
            onClick={() =>
              onStart({ luminary: lum, profession: prof, hobby, permSource: perm, shade, difficulty: diff, seed: Math.floor(Math.random() * 1e9) })
            }
          >
            開始
          </button>
        </div>
        <div className="muted small">Shade 的特殊規則 (Pride、Wrath、Envy) 與大部分卡片效果將在階段 4 補齊。</div>
      </div>
    </div>
  );
}
