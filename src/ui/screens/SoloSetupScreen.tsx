/**
 * ソロプレイ設定画面。
 * 使用デッキと難易度を選んで対局を開始する。
 * チップ選択＋1行説明のみで構成し、スクロールなしで1画面に収める。
 */
import { useState } from 'react';
import { ChevronLeft, Play, Shuffle } from 'lucide-react';
import { DECK_PRESETS } from '../../cards/decks';
import { DIFFICULTY_DESCRIPTION, DIFFICULTY_LABEL, type Difficulty } from '../../ai';
import { MATCH_MODES, type MatchModeId } from '../../core/rules';
import type { DeckSlot } from '../deckStorage';

interface Props {
  slots: DeckSlot[];
  onBack: () => void;
  onStart: (opts: {
    myDeck: string[];
    myName: string;
    foeDeckId: string;
    difficulty: Difficulty;
    mode: MatchModeId;
  }) => void;
}

const DIFFICULTIES: Difficulty[] = ['easy', 'normal', 'hard'];

/** 相手デッキの選択肢に加える「ランダム」の特殊値。対局開始時に実際のプリセットへ解決する */
export const RANDOM_FOE_ID = 'random';

export function SoloSetupScreen({ slots, onBack, onStart }: Props) {
  const usable = slots.filter((s) => s.cards.length === 20);
  const [myDeckIdx, setMyDeckIdx] = useState(0);
  const [foeDeckId, setFoeDeckId] = useState(DECK_PRESETS[1].id);
  const [difficulty, setDifficulty] = useState<Difficulty>('normal');
  const [mode, setMode] = useState<MatchModeId>('standard');

  const myDeck = usable[myDeckIdx];
  const selectedMode = MATCH_MODES.find((m) => m.id === mode)!;
  const isRandomFoe = foeDeckId === RANDOM_FOE_ID;
  const selectedFoe = DECK_PRESETS.find((p) => p.id === foeDeckId);

  return (
    <div className="screen">
      <div className="topbar">
        <button className="icon-btn" onClick={onBack} aria-label="戻る">
          <ChevronLeft size={18} />
        </button>
        <h1>ソロプレイ</h1>
      </div>

      <div className="setup">
        <SetupRow label="対局モード">
          {/* 選択肢を等幅に並べると、幅のばらつきで行が崩れず視線が揃う */}
          <div className="seg" style={{ gridTemplateColumns: `repeat(${MATCH_MODES.length}, 1fr)` }}>
            {MATCH_MODES.map((m) => (
              <button
                key={m.id}
                className={`seg-btn ${m.id === mode ? 'active' : ''}`}
                onClick={() => setMode(m.id)}
              >
                {m.name}
              </button>
            ))}
          </div>
          <div className="setup-desc">
            拠点HP{selectedMode.overrides.BASE_HP} / 毎ターン{selectedMode.overrides.FREE_POINTS}pt /{' '}
            {selectedMode.turnsHint}
            <br />
            {selectedMode.description}
          </div>
        </SetupRow>

        <SetupRow label="使用デッキ">
          {usable.length === 0 && <span className="setup-desc">20枚のデッキがありません</span>}
          {/* 自作デッキは名前が長くなりがちなので、横並びにせず縦一列で省略なく見せる */}
          <div className="pick-list">
            {usable.map((slot, i) => (
              <button
                key={slot.id}
                className={`pick-row ${i === myDeckIdx ? 'active' : ''}`}
                onClick={() => setMyDeckIdx(i)}
              >
                <span className="pick-name">{slot.name}</span>
                <span className="pick-meta">{slot.cards.length}枚</span>
              </button>
            ))}
          </div>
        </SetupRow>

        <SetupRow label="相手デッキ">
          <button
            className={`pick-row ${isRandomFoe ? 'active' : ''}`}
            onClick={() => setFoeDeckId(RANDOM_FOE_ID)}
          >
            <Shuffle size={13} />
            <span className="pick-name">ランダム</span>
          </button>
          <div className="pick-grid">
            {DECK_PRESETS.map((preset) => (
              <button
                key={preset.id}
                className={`pick-cell ${preset.id === foeDeckId ? 'active' : ''}`}
                onClick={() => setFoeDeckId(preset.id)}
              >
                <span className={`fac-dot fac-${preset.faction}`} />
                <span className="pick-name">{preset.name.replace(/（.*/, '')}</span>
              </button>
            ))}
          </div>
          <div className="setup-desc">
            {isRandomFoe ? '対局開始時にランダムで選ばれます。' : selectedFoe?.description}
          </div>
        </SetupRow>

        <SetupRow label="難易度">
          <div className="seg" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
            {DIFFICULTIES.map((d) => (
              <button
                key={d}
                className={`seg-btn ${d === difficulty ? 'active' : ''}`}
                onClick={() => setDifficulty(d)}
              >
                {DIFFICULTY_LABEL[d]}
              </button>
            ))}
          </div>
          <div className="setup-desc">{DIFFICULTY_DESCRIPTION[difficulty]}</div>
        </SetupRow>

        <div style={{ flex: 1 }} />

        {!myDeck && (
          <div className="notice">20枚のデッキがありません。デッキ編集で作成してください。</div>
        )}
        <button
          className="btn btn-primary btn-block"
          disabled={!myDeck}
          onClick={() =>
            myDeck && onStart({ myDeck: myDeck.cards, myName: myDeck.name, foeDeckId, difficulty, mode })
          }
        >
          <Play size={16} /> 対局開始
        </button>
      </div>
    </div>
  );
}

function SetupRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="setup-row">
      <div className="setup-label">{label}</div>
      {children}
    </div>
  );
}
