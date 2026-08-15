/**
 * バトル画面の構成部品。
 * 手札カード / 場のユニット / 場の施設 / カード詳細シート。
 *
 * カード本体をタップすると「プレイ／攻撃対象選択／起動」などの本来の操作を行い、
 * 隅の情報アイコンをタップすると効果テキストの詳細シートが開く。
 * （長押しは誤操作しやすく効果確認が面倒という声から、常時タップ可能なアイコンに変更した）
 */
import { Coins, Droplet, Heart, Info, Sparkles, Swords, X } from 'lucide-react';
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

/** 隅に置く情報アイコン。親のタップ操作を奪わないよう伝播を止める */
function InfoButton({ onInfo, className }: { onInfo: () => void; className: string }) {
  return (
    <span
      className={className}
      role="button"
      tabIndex={0}
      aria-label="カード詳細を見る"
      onClick={(e) => {
        e.stopPropagation();
        onInfo();
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.stopPropagation();
          e.preventDefault();
          onInfo();
        }
      }}
    >
      <Info size={11} />
    </span>
  );
}

// ---------------------------------------------------------------------------
// 手札
// ---------------------------------------------------------------------------

interface HandCardProps {
  card: CardInstance;
  playable: boolean;
  selected: boolean;
  onTap: () => void;
  onInfo: () => void;
}

export function HandCard({ card, playable, selected, onTap, onInfo }: HandCardProps) {
  const def = getCard(card.defId);

  return (
    <div
      className={`hand-card ${selected ? 'selected' : playable ? 'playable' : 'unplayable'}`}
      role="button"
      tabIndex={0}
      onClick={onTap}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onTap();
        }
      }}
    >
      <span className="hc-cost">{formatCost(def.cost)}</span>
      <InfoButton onInfo={onInfo} className="hc-info" />
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
    </div>
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
  onInfo: () => void;
}

export function UnitChip({ unit, state, mode, onTap, onInfo }: UnitChipProps) {
  const def = getCard(unit.defId);
  const frozen = unit.frozenUntilTurn !== undefined && state.turn <= unit.frozenUntilTurn;
  const attack = effectiveAttack(unit);
  const buffed = attack > (def.attack ?? 0);

  return (
    <div
      className={`chip faction-${def.faction} ${mode} ${unit.hasAttacked ? 'exhausted' : ''}`}
      role="button"
      tabIndex={0}
      onClick={onTap}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onTap();
        }
      }}
    >
      <InfoButton onInfo={onInfo} className="chip-info" />
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
    </div>
  );
}

// ---------------------------------------------------------------------------
// 場の施設
// ---------------------------------------------------------------------------

interface FacilityChipProps {
  facility: FacilityInstance;
  mode: 'idle' | 'selectable' | 'targetable' | 'selected';
  onTap: () => void;
  onInfo: () => void;
}

export function FacilityChip({ facility, mode, onTap, onInfo }: FacilityChipProps) {
  const def = getCard(facility.defId);
  const countdown = def.passives?.find((p) => p.kind === 'countdownWin');

  return (
    <div
      className={`chip faction-${def.faction} ${mode}`}
      role="button"
      tabIndex={0}
      onClick={onTap}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onTap();
        }
      }}
    >
      <InfoButton onInfo={onInfo} className="chip-info" />
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
    </div>
  );
}

// ---------------------------------------------------------------------------
// カード詳細（情報アイコンのタップで開くボトムシート）
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
