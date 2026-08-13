/**
 * バトル画面の構成部品。
 * 手札カード / 場のユニット / 場の施設 / カード詳細シート。
 */
import { Coins, Droplet, Heart, Sparkles, Swords, X } from 'lucide-react';
import { CardArt } from './CardArt';
import { formatCost } from '../../cards/baseCard';
import { getCard } from '../../cards/cardFactory';
import { effectiveAttack } from '../../core/gameState';
import type {
  CardDef,
  CardInstance,
  FacilityInstance,
  GameState,
  UnitInstance,
} from '../../core/types';

const TYPE_LABEL: Record<CardDef['type'], string> = {
  unit: 'ユニット',
  facility: '施設',
  spell: 'スペル',
};

const FACTION_LABEL: Record<CardDef['faction'], string> = {
  fund: '資金',
  mana: '魔力',
  aether: 'エーテル',
  hybrid: '複合',
};

export function ResourceIcon({ kind, size = 12 }: { kind: 'fund' | 'mana' | 'aether'; size?: number }) {
  if (kind === 'fund') return <Coins size={size} />;
  if (kind === 'mana') return <Droplet size={size} />;
  return <Sparkles size={size} />;
}

// ---------------------------------------------------------------------------
// 手札
// ---------------------------------------------------------------------------

interface HandCardProps {
  card: CardInstance;
  playable: boolean;
  selected: boolean;
  onTap: () => void;
  onLongPress: () => void;
}

export function HandCard({ card, playable, selected, onTap, onLongPress }: HandCardProps) {
  const def = getCard(card.defId);
  let timer: ReturnType<typeof setTimeout> | undefined;

  const start = () => {
    timer = setTimeout(onLongPress, 450);
  };
  const cancel = () => {
    if (timer) clearTimeout(timer);
  };

  return (
    <button
      className={`hand-card ${selected ? 'selected' : playable ? 'playable' : 'unplayable'}`}
      onClick={onTap}
      onPointerDown={start}
      onPointerUp={cancel}
      onPointerLeave={cancel}
      onContextMenu={(e) => {
        e.preventDefault();
        onLongPress();
      }}
    >
      <span className="hc-cost">{formatCost(def.cost)}</span>
      <span className="hc-art">
        <CardArt def={def} size={26} />
      </span>
      <span className="hc-name">{def.name}</span>
      {def.type === 'unit' && (
        <span className="hc-stats">
          {def.attack}/{def.hp}
        </span>
      )}
      {def.type === 'facility' && <span className="hc-stats">HP{def.hp}</span>}
    </button>
  );
}

// ---------------------------------------------------------------------------
// 場のユニット
// ---------------------------------------------------------------------------

interface UnitChipProps {
  unit: UnitInstance;
  state: GameState;
  mode: 'idle' | 'selectable' | 'targetable' | 'selected';
  onTap: () => void;
}

export function UnitChip({ unit, state, mode, onTap }: UnitChipProps) {
  const def = getCard(unit.defId);
  const frozen = unit.frozenUntilTurn !== undefined && state.turn <= unit.frozenUntilTurn;
  const attack = effectiveAttack(unit);
  const buffed = attack > (def.attack ?? 0);

  return (
    <button
      className={`chip faction-${def.faction} ${mode} ${unit.hasAttacked ? 'exhausted' : ''}`}
      onClick={onTap}
    >
      <span className="chip-badges">
        {frozen && <span className="badge frozen">凍結</span>}
        {def.keywords.includes('taunt') && <span className="badge">挑発</span>}
        {def.keywords.includes('evasive') && <span className="badge">抜</span>}
        {unit.regenerateLeft > 0 && <span className="badge">再生</span>}
      </span>
      <span className="chip-art">
        <CardArt def={def} size={20} />
      </span>
      <span className="chip-name">{def.name}</span>
      <span className="chip-stats">
        <span className="stat-atk" style={buffed ? { color: '#7dffb0' } : undefined}>
          <Swords size={9} /> {attack}
        </span>
        <span className="stat-hp">
          <Heart size={9} /> {unit.hp}
        </span>
      </span>
    </button>
  );
}

// ---------------------------------------------------------------------------
// 場の施設
// ---------------------------------------------------------------------------

interface FacilityChipProps {
  facility: FacilityInstance;
  mode: 'idle' | 'selectable' | 'targetable' | 'selected';
  onTap: () => void;
}

export function FacilityChip({ facility, mode, onTap }: FacilityChipProps) {
  const def = getCard(facility.defId);
  const countdown = def.passives?.find((p) => p.kind === 'countdownWin');

  return (
    <button className={`chip faction-${def.faction} ${mode}`} onClick={onTap}>
      <span className="chip-badges">
        {countdown && (
          <span className="badge counter">
            {facility.counters}/{countdown.kind === 'countdownWin' ? countdown.turns : 0}
          </span>
        )}
      </span>
      <span className="chip-art">
        <CardArt def={def} size={17} />
      </span>
      <span className="chip-name">{def.name}</span>
      <span className="chip-stats">
        <span className="stat-hp">
          <Heart size={9} /> {facility.hp}
        </span>
      </span>
    </button>
  );
}

// ---------------------------------------------------------------------------
// カード詳細（長押しで開くボトムシート）
// ---------------------------------------------------------------------------

export function CardSheet({ def, onClose }: { def: CardDef; onClose: () => void }) {
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-head">
          <div className="sheet-art">
            <CardArt def={def} size={32} />
          </div>
          <div style={{ flex: 1 }}>
            <div className="sheet-title">{def.name}</div>
            <div className="sheet-meta">
              No.{def.no} / {FACTION_LABEL[def.faction]} / {TYPE_LABEL[def.type]} / コスト{' '}
              {def.altCosts ? def.altCosts.map(formatCost).join(' または ') : formatCost(def.cost)}
              {def.type === 'unit' && ` / 攻${def.attack} HP${def.hp}`}
              {def.type === 'facility' && ` / HP${def.hp}`}
            </div>
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="閉じる">
            <X size={16} />
          </button>
        </div>
        <div className="sheet-text">{def.text}</div>
      </div>
    </div>
  );
}
