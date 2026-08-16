/**
 * デッキ編集画面（仕様書 3.1）
 * 20枚 / 同名2枚まで / 最大3スロット保存。
 */
import { useMemo, useState } from 'react';
import { Check, ChevronLeft, Minus, Pencil, Plus } from 'lucide-react';
import { CardArt } from '../components/CardArt';
import { ALL_CARDS } from '../../cards/cardFactory';
import { formatCost } from '../../cards/baseCard';
import { RULES } from '../../core/rules';
import { MAX_SLOTS, slotStatus, type DeckSlot } from '../deckStorage';
import type { CardType, Faction } from '../../core/types';

/**
 * マスターデータへの追加順(no)がバラついていても整列して見えるようにする。
 * 「すべて」表示では属性(資金/魔力/エーテル/複合)でまとまり、
 * 各属性内はタイプ(ユニット→施設→スペル)でまとまる。
 */
const FACTION_ORDER: Record<Faction, number> = { fund: 0, mana: 1, aether: 2, hybrid: 3 };
const TYPE_ORDER: Record<CardType, number> = { unit: 0, facility: 1, spell: 2 };

interface Props {
  slots: DeckSlot[];
  onChange: (slots: DeckSlot[]) => void;
  onBack: () => void;
}

const FILTERS: Array<{ id: Faction | 'all'; label: string }> = [
  { id: 'all', label: 'すべて' },
  { id: 'fund', label: '資金' },
  { id: 'mana', label: '魔力' },
  { id: 'aether', label: 'エーテル' },
  { id: 'hybrid', label: '複合' },
];

export function DeckScreen({ slots, onChange, onBack }: Props) {
  const [slotIdx, setSlotIdx] = useState(0);
  const [filter, setFilter] = useState<Faction | 'all'>('all');
  const [renaming, setRenaming] = useState<string | null>(null);

  const slot = slots[slotIdx] ?? { id: 'slot1', name: 'デッキ1', cards: [] };
  const counts = useMemo(() => {
    const map = new Map<string, number>();
    for (const id of slot.cards) map.set(id, (map.get(id) ?? 0) + 1);
    return map;
  }, [slot.cards]);

  const visible = ALL_CARDS.filter((c) => filter === 'all' || c.faction === filter).sort(
    (a, b) =>
      FACTION_ORDER[a.faction] - FACTION_ORDER[b.faction] ||
      TYPE_ORDER[a.type] - TYPE_ORDER[b.type] ||
      a.no - b.no,
  );
  const status = slotStatus(slot);

  const update = (cards: string[]) => {
    const next = slots.slice();
    next[slotIdx] = { ...slot, cards };
    onChange(next);
  };

  const rename = (name: string) => {
    const next = slots.slice();
    next[slotIdx] = { ...slot, name: name.trim() || slot.name };
    onChange(next);
  };

  const add = (defId: string) => {
    if (slot.cards.length >= RULES.DECK_SIZE) return;
    if ((counts.get(defId) ?? 0) >= RULES.MAX_COPIES) return;
    update([...slot.cards, defId]);
  };

  const remove = (defId: string) => {
    const idx = slot.cards.lastIndexOf(defId);
    if (idx < 0) return;
    const next = slot.cards.slice();
    next.splice(idx, 1);
    update(next);
  };

  return (
    <div className="screen">
      <div className="topbar">
        <button className="icon-btn" onClick={onBack} aria-label="戻る">
          <ChevronLeft size={18} />
        </button>
        <h1>デッキ編集</h1>
      </div>

      <div className="deck-tabs">
        {Array.from({ length: MAX_SLOTS }, (_, i) => slots[i]).map((s, i) => (
          <button
            key={i}
            className={`deck-tab ${i === slotIdx ? 'active' : ''}`}
            onClick={() => setSlotIdx(i)}
          >
            {s ? s.name : `スロット${i + 1}`}
          </button>
        ))}
      </div>

      <div className="deck-name-row">
        <span className="deck-name-current">{slot.name}</span>
        <button
          className="icon-btn"
          aria-label="デッキ名を変更"
          onClick={() => setRenaming(slot.name)}
        >
          <Pencil size={13} />
        </button>
      </div>

      <div className="deck-tabs">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            className={`deck-tab ${f.id === filter ? 'active' : ''}`}
            onClick={() => setFilter(f.id)}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="screen-scroll">
        <div className="card-list">
          {visible.map((def) => {
            const n = counts.get(def.id) ?? 0;
            return (
              <div className={`card-row ${n > 0 ? 'owned' : ''}`} key={def.id}>
                <span className="cr-art">
                  <CardArt def={def} size={22} />
                </span>
                <span className="cr-cost">{formatCost(def.cost)}</span>
                <span className="cr-body">
                  <span className="cr-name">
                    {def.name}
                    {def.type === 'unit' && (
                      <span style={{ color: 'var(--text-dim)', fontWeight: 400 }}>
                        {' '}
                        攻{def.attack}/HP{def.hp}
                      </span>
                    )}
                    {def.type === 'facility' && (
                      <span style={{ color: 'var(--text-dim)', fontWeight: 400 }}> HP{def.hp}</span>
                    )}
                  </span>
                  <span className="cr-text">{def.text}</span>
                </span>
                <span className="counter-btns">
                  <button className="icon-btn" onClick={() => remove(def.id)} disabled={n === 0}>
                    <Minus size={14} />
                  </button>
                  <span className="count" style={n > 0 ? { color: 'var(--accent)' } : undefined}>
                    {n}
                  </span>
                  <button
                    className="icon-btn"
                    onClick={() => add(def.id)}
                    disabled={n >= RULES.MAX_COPIES || slot.cards.length >= RULES.DECK_SIZE}
                  >
                    <Plus size={14} />
                  </button>
                </span>
              </div>
            );
          })}
        </div>
      </div>

      <div className="deck-footer">
        <span className={`deck-count ${status.ok ? 'ok' : 'ng'}`}>
          {slot.cards.length} / {RULES.DECK_SIZE}
        </span>
        <span style={{ fontSize: 11, color: 'var(--text-dim)', flex: 1 }}>{status.message}</span>
        <button className="btn btn-primary" onClick={onBack} disabled={!status.ok}>
          <Check size={15} /> 保存
        </button>
      </div>

      {renaming !== null && (
        <div className="sheet-backdrop" onClick={() => setRenaming(null)}>
          <div className="sheet" onClick={(e) => e.stopPropagation()}>
            <div className="sheet-title" style={{ marginBottom: 10 }}>
              デッキ名を変更
            </div>
            <input
              className="rename-input"
              value={renaming}
              autoFocus
              maxLength={20}
              onChange={(e) => setRenaming(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  rename(renaming);
                  setRenaming(null);
                }
              }}
            />
            <div className="prompt-actions" style={{ marginTop: 12 }}>
              <button className="btn" onClick={() => setRenaming(null)}>
                キャンセル
              </button>
              <button
                className="btn btn-primary"
                onClick={() => {
                  rename(renaming);
                  setRenaming(null);
                }}
              >
                <Check size={15} /> 決定
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
