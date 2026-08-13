/**
 * TRINIA - オークション（先攻競り）エンジン
 *
 * 仕様書 2.2:
 *  - 両者が「先攻権に支払うHP」を同時に暗黙入力（0〜10）。
 *  - 高い側が先攻。提示分だけ拠点HPを失った状態でスタート。
 *  - 低い側が後攻。拠点HPは満タン。
 *  - 同点ならランダムに先後を決定し、後攻側のみ初期リソース+1ptを得る。
 *
 * 「ゲーム開始時の運要素を極小化する」という設計思想の中核なので、
 * 判定はサーバ（Cloud Functions / Workers）でも同じコードを使えるよう純粋関数にしている。
 */
import { RULES } from './rules';
import { nextInt } from './rng';
import { drawCard, log } from './gameState';
import type { GameState, PlayerId, ResourceKind } from './types';

export interface AuctionOutcome {
  first: PlayerId;
  second: PlayerId;
  tie: boolean;
  /** 先攻側が支払ったHP */
  paidHp: number;
}

export function isValidBid(amount: number): boolean {
  return Number.isInteger(amount) && amount >= 0 && amount <= RULES.MAX_BID;
}

/** 両者の提示が揃ったか */
export function bothBidsIn(state: GameState): boolean {
  return state.players[0].bid >= 0 && state.players[1].bid >= 0;
}

/**
 * 提示済みの両者のbidから先後を決定し、状態に反映する。
 * 後攻ボーナスのリソース種別は bonusResource で指定（既定は資金）。
 */
export function resolveAuction(state: GameState, bonusResource: ResourceKind = 'fund'): AuctionOutcome {
  const [a, b] = state.players;
  let first: PlayerId;
  let tie = false;

  if (a.bid > b.bid) {
    first = 0;
  } else if (b.bid > a.bid) {
    first = 1;
  } else {
    tie = true;
    const d = nextInt(state.rngState, 2);
    state.rngState = d.state;
    first = d.value as PlayerId;
  }

  const second: PlayerId = first === 0 ? 1 : 0;
  const firstPlayer = state.players[first];
  const secondPlayer = state.players[second];

  // 先攻側のみ提示HPを支払う。後攻側は満タンのまま。
  const paidHp = tie ? 0 : firstPlayer.bid;
  firstPlayer.baseHp = RULES.BASE_HP - paidHp;
  secondPlayer.baseHp = RULES.BASE_HP;

  // 後攻補正。既定は仕様書どおり同点時のみ（先攻の価値はオークションで支払わせる）
  const bonus = tie || RULES.SECOND_PLAYER_BONUS_ALWAYS ? RULES.SECOND_PLAYER_BONUS : 0;
  if (bonus > 0) secondPlayer.resources[bonusResource] += bonus;
  if (tie || RULES.SECOND_PLAYER_BONUS_ALWAYS) {
    for (let i = 0; i < RULES.SECOND_PLAYER_BONUS_CARDS; i++) drawCard(state, second);
  }

  if (tie) {
    log(
      state,
      null,
      `オークション同点（${a.bid}）。ランダム判定で ${firstPlayer.name} が先攻。` +
        `後攻の ${secondPlayer.name} は初期リソース+${bonus}pt を得た。`,
    );
  } else {
    log(
      state,
      null,
      `オークション: ${firstPlayer.name} が ${firstPlayer.bid} 提示で先攻（HP${firstPlayer.baseHp}スタート）、` +
        `${secondPlayer.name} は ${secondPlayer.bid} 提示で後攻（HP${secondPlayer.baseHp}スタート）。`,
    );
  }

  state.active = first;
  state.priority = first;
  return { first, second, tie, paidHp };
}
