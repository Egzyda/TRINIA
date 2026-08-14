/**
 * TRINIA - AI同士の自動対局
 *
 * バランス調整用のシミュレータと、UI側の「AIの手番を進める」処理が共有する。
 */
import { createGame } from '../core/gameState';
import { applyAction } from '../core/mainPhaseEngine';
import { decideAction, makeAi, type AiContext, type Difficulty } from './index';
import { getPreset } from '../cards/decks';
import { rulesForMode, type MatchModeId, type RuleSet } from '../core/rules';
import type { GameState, PlayerId } from '../core/types';

export interface AutoplayResult {
  winner: PlayerId | null;
  reason: string | null;
  turns: number;
  finalHp: [number, number];
  bids: [number, number];
  first: PlayerId;
  state: GameState;
}

/**
 * AI が入力を求められている間、行動を適用し続ける。
 * 人間の入力待ちになったらそこで止まるので、ソロプレイ画面でもそのまま使える。
 */
export function advanceAi(
  state: GameState,
  aiPlayers: Partial<Record<PlayerId, AiContext>>,
  maxSteps = 500,
): GameState {
  let cur = state;
  for (let i = 0; i < maxSteps; i++) {
    if (cur.winner !== null) break;
    let acted = false;
    for (const key of [0, 1] as PlayerId[]) {
      const ctx = aiPlayers[key];
      if (!ctx) continue;
      const action = decideAction(cur, key, ctx);
      if (!action) continue;
      const applied = applyAction(cur, action);
      if (!applied.ok) {
        // AIが不正手を出した場合の安全弁: ターンを畳んで進行不能を避ける
        const fallback = applyAction(cur, { type: 'endTurn' });
        if (!fallback.ok) return cur;
        cur = fallback.state;
      } else {
        cur = applied.state;
      }
      acted = true;
      break;
    }
    if (!acted) break;
  }
  return cur;
}

export interface MatchConfig {
  deckA: string;
  deckB: string;
  aiA: Difficulty;
  aiB: Difficulty;
  seed: number;
  /** 対局モード（既定はスタンダード） */
  mode?: MatchModeId;
  /** モードのルールを直接上書きする（検証用） */
  rules?: RuleSet;
}

/** 1試合を最後まで自動で回す */
export function playMatch(config: MatchConfig): AutoplayResult {
  const a = getPreset(config.deckA);
  const b = getPreset(config.deckB);
  let state = createGame(
    { name: `P1(${a.name})`, deck: a.cards },
    { name: `P2(${b.name})`, deck: b.cards },
    config.seed,
    config.rules ?? rulesForMode(config.mode ?? 'standard'),
  );
  const ais: Record<PlayerId, AiContext> = {
    0: makeAi(config.aiA, config.seed ^ 0x5bf03635),
    1: makeAi(config.aiB, config.seed ^ 0x27d4eb2f),
  };
  const bids: [number, number] = [0, 0];

  state = advanceAi(state, ais, 5000);
  bids[0] = state.players[0].bid;
  bids[1] = state.players[1].bid;

  return {
    winner: state.winner,
    reason: state.winReason,
    turns: state.turn,
    finalHp: [state.players[0].baseHp, state.players[1].baseHp],
    bids,
    first: bids[0] > bids[1] ? 0 : bids[1] > bids[0] ? 1 : state.active,
    state,
  };
}
