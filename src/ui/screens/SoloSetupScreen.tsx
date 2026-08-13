/**
 * ソロプレイ設定画面。
 * 使用デッキと難易度を選んで対局を開始する。
 */
import { useState } from 'react';
import { ChevronLeft, Play } from 'lucide-react';
import { DECK_PRESETS } from '../../cards/decks';
import { DIFFICULTY_DESCRIPTION, DIFFICULTY_LABEL, type Difficulty } from '../../ai';
import type { DeckSlot } from '../deckStorage';

interface Props {
  slots: DeckSlot[];
  onBack: () => void;
  onStart: (opts: { myDeck: string[]; myName: string; foeDeckId: string; difficulty: Difficulty }) => void;
}

const DIFFICULTIES: Difficulty[] = ['easy', 'normal', 'hard'];

export function SoloSetupScreen({ slots, onBack, onStart }: Props) {
  const usable = slots.filter((s) => s.cards.length === 20);
  const [myDeckIdx, setMyDeckIdx] = useState(0);
  const [foeDeckId, setFoeDeckId] = useState(DECK_PRESETS[1].id);
  const [difficulty, setDifficulty] = useState<Difficulty>('normal');

  const myDeck = usable[myDeckIdx];

  return (
    <div className="screen">
      <div className="topbar">
        <button className="icon-btn" onClick={onBack} aria-label="戻る">
          <ChevronLeft size={18} />
        </button>
        <h1>ソロプレイ</h1>
      </div>

      <div className="screen-scroll">
        <div className="room">
          <div>
            <div className="prompt-title">使用デッキ</div>
            <div className="deck-tabs" style={{ padding: 0, border: 'none' }}>
              {usable.map((slot, i) => (
                <button
                  key={slot.id}
                  className={`deck-tab ${i === myDeckIdx ? 'active' : ''}`}
                  onClick={() => setMyDeckIdx(i)}
                >
                  {slot.name}
                </button>
              ))}
            </div>
          </div>

          <div>
            <div className="prompt-title">相手デッキ</div>
            <div className="deck-tabs" style={{ padding: 0, border: 'none' }}>
              {DECK_PRESETS.map((preset) => (
                <button
                  key={preset.id}
                  className={`deck-tab ${preset.id === foeDeckId ? 'active' : ''}`}
                  onClick={() => setFoeDeckId(preset.id)}
                >
                  {preset.name.replace(/（.*/, '')}
                </button>
              ))}
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 6 }}>
              {DECK_PRESETS.find((p) => p.id === foeDeckId)?.description}
            </div>
          </div>

          <div>
            <div className="prompt-title">難易度</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {DIFFICULTIES.map((d) => (
                <button
                  key={d}
                  className={`menu-card ${d === difficulty ? '' : ''}`}
                  style={
                    d === difficulty
                      ? { borderColor: 'var(--accent)', background: 'var(--bg-panel-2)' }
                      : undefined
                  }
                  onClick={() => setDifficulty(d)}
                >
                  <span className="mc-body">
                    <span className="mc-title">{DIFFICULTY_LABEL[d]}</span>
                    <br />
                    <span className="mc-desc">{DIFFICULTY_DESCRIPTION[d]}</span>
                  </span>
                </button>
              ))}
            </div>
          </div>

          <button
            className="btn btn-primary btn-block"
            disabled={!myDeck}
            onClick={() =>
              myDeck &&
              onStart({ myDeck: myDeck.cards, myName: myDeck.name, foeDeckId, difficulty })
            }
          >
            <Play size={16} /> 対局開始
          </button>
          {!myDeck && <div className="notice">20枚のデッキがありません。デッキ編集で作成してください。</div>}
        </div>
      </div>
    </div>
  );
}
