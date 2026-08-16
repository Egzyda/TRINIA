/**
 * TRINIA - 先攻・後攻の決定
 *
 * 以前は「拠点HPをどれだけ払うか」を両者が同時提示するオークション方式だったが、
 * AIの入札ヒューリスティックの精度に結果が依存してしまい、
 * 実測では何もしないより悪い先攻勝率（64.9%）になっていた（docs/BALANCE.md §13-14）。
 * コイントスで先後を決め、後攻に固定ボーナスを与える方式に切り替えたところ、
 * SECOND_PLAYER_BONUS=1pt だけで先攻勝率51.1%まで収まることを実測済み。
 *
 * サーバ（Cloud Functions / Workers）でも同じコードを使えるよう純粋関数にしている。
 */
import { nextInt } from './rng';
import { drawCard, log } from './gameState';
import type { GameState, PlayerId, ResourceKind } from './types';

export interface FirstPlayerOutcome {
  first: PlayerId;
  second: PlayerId;
}

/** コイントスで先後を決め、後攻に固定ボーナスを与える。マリガン完了時に一度だけ呼ぶ */
export function resolveFirstPlayer(state: GameState, bonusResource: ResourceKind = 'fund'): FirstPlayerOutcome {
  const d = nextInt(state.rngState, 2);
  state.rngState = d.state;
  const first = d.value as PlayerId;
  const second: PlayerId = first === 0 ? 1 : 0;

  state.firstPlayer = first;
  state.active = first;
  state.priority = first;

  const secondPlayer = state.players[second];
  const bonus = state.rules.SECOND_PLAYER_BONUS;
  if (bonus > 0) secondPlayer.resources[bonusResource] += bonus;
  for (let i = 0; i < state.rules.SECOND_PLAYER_BONUS_CARDS; i++) drawCard(state, second);

  log(
    state,
    null,
    `コイントス: ${state.players[first].name} が先攻。` +
      `後攻の ${secondPlayer.name} は初期リソース+${bonus}ptを得た。`,
  );

  return { first, second };
}
