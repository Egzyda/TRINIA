/**
 * TRINIA - 盤面評価関数
 *
 * NORMAL / HARD AI が共有する「いまどちらが有利か」の数値化。
 * 拠点HP差を主軸に、盤面・リソース・手札・特殊勝利進行度を加算する。
 */
import { getCard } from '../cards/cardFactory';
import { effectiveAttack } from '../core/gameState';
import type { FacilityInstance, GameState, PlayerId, PlayerState, UnitInstance } from '../core/types';

const W = {
  /** 拠点HP1点あたりの価値 */
  baseHp: 1.0,
  /** ユニットの攻撃力1点 / HP1点 */
  unitAttack: 1.6,
  unitHp: 1.0,
  /** キーワード補正 */
  taunt: 2.0,
  evasive: 2.5,
  magicImmune: 3.0,
  regenerate: 2.0,
  trample: 2.0,
  siege: 0.5,
  /** 施設のベース価値 + アップキープ1ptあたりの価値 */
  facilityBase: 1.5,
  facilityUpkeep: 4.0,
  facilityHp: 0.4,
  /** カウントダウン兵器のカウンタ1個 */
  countdownCounter: 9.0,
  /** 手札1枚 / 未使用リソース1pt */
  hand: 1.4,
  resource: 0.9,
  /** 相手のメインフェイズを1回奪っている状態の価値（タイムストップ） */
  skipMain: 7.0,
  /** 勝敗が確定している局面 */
  win: 100000,
} as const;

export function unitValue(unit: UnitInstance, state?: GameState): number {
  const def = getCard(unit.defId);
  // 凍結中は攻撃力が機能していないぶん価値を落とす。
  // これがないとAIが凍結魔法の価値をゼロと見なして一切撃たなくなる。
  const frozen =
    state !== undefined && unit.frozenUntilTurn !== undefined && state.turn <= unit.frozenUntilTurn;
  const attack = frozen ? 0 : effectiveAttack(unit);
  let v = attack * W.unitAttack + unit.hp * W.unitHp;
  if (def.keywords.includes('taunt')) v += W.taunt;
  if (def.keywords.includes('evasive')) v += W.evasive;
  if (def.keywords.includes('magicImmune')) v += W.magicImmune;
  if (def.keywords.includes('trample')) v += W.trample;
  if (def.keywords.includes('siege')) v += W.siege;
  if (unit.regenerateLeft > 0) v += W.regenerate;
  return v;
}

export function facilityValue(facility: FacilityInstance): number {
  const def = getCard(facility.defId);
  let v = W.facilityBase + facility.hp * W.facilityHp;
  for (const passive of def.passives ?? []) {
    if (passive.kind === 'upkeepResource') v += passive.amount * W.facilityUpkeep;
    if (passive.kind === 'damageReduction') v += 4;
    if (passive.kind === 'countdownWin') v += facility.counters * W.countdownCounter + 4;
  }
  if (def.activated) v += 3;
  return v;
}

function sideScore(state: GameState, p: PlayerState): number {
  let s = p.baseHp * W.baseHp;
  for (const u of p.units) s += unitValue(u, state);
  for (const f of p.facilities) s += facilityValue(f);
  s += p.hand.length * W.hand;
  s += (p.resources.fund + p.resources.mana + p.resources.aether) * W.resource;
  // 自分に課されたメインフェイズスキップはマイナス
  s -= p.skipMainPhases * W.skipMain;
  return s;
}

/** me視点のスコア。正なら me が有利 */
export function evaluate(state: GameState, me: PlayerId): number {
  if (state.winner !== null) return state.winner === me ? W.win : -W.win;
  const foe: PlayerId = me === 0 ? 1 : 0;
  return sideScore(state, state.players[me]) - sideScore(state, state.players[foe]);
}

/** 相手の拠点をこのターン中に削り切れる見込みがあるか（打点合計 ≧ 残HP） */
export function lethalReach(state: GameState, me: PlayerId): boolean {
  const foe = state.players[me === 0 ? 1 : 0];
  if (foe.units.length > 0) return false; // 前衛がいる間は素通しできない
  const total = state.players[me].units
    .filter((u) => !u.hasAttacked)
    .reduce((sum, u) => sum + effectiveAttack(u), 0);
  return total >= foe.baseHp;
}
