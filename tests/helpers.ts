/**
 * テスト用の盤面組み立てヘルパー。
 * 「この状況でこのカードを撃ったらこうなる」を最短で書けるようにする。
 */
import { createGame, buildFacility, nextUid, summonUnit } from '../src/core/gameState';
import { applyAction } from '../src/core/mainPhaseEngine';
import { RULES } from '../src/core/rules';
import { makeCardInstance } from '../src/cards/cardFactory';
import { DECK_PRESETS } from '../src/cards/decks';
import type { GameState, PlayerId, Resources } from '../src/core/types';

export interface BoardSetup {
  seed?: number;
  active?: PlayerId;
  /** 各プレイヤーの手札（defId配列）。指定した側は手札を総入れ替えする */
  hands?: Partial<Record<PlayerId, string[]>>;
  units?: Partial<Record<PlayerId, string[]>>;
  facilities?: Partial<Record<PlayerId, string[]>>;
  resources?: Partial<Record<PlayerId, Partial<Resources>>>;
  baseHp?: Partial<Record<PlayerId, number>>;
  /** 山札を差し替える（召集令状のサーチ検証用） */
  decks?: Partial<Record<PlayerId, string[]>>;
}

/** メインフェイズから始まる任意の盤面を作る */
export function board(setup: BoardSetup = {}): GameState {
  const [a, b] = DECK_PRESETS;
  const state = createGame(
    { name: 'A', deck: a.cards },
    { name: 'B', deck: b.cards },
    setup.seed ?? 1234,
  );

  state.phase = 'main';
  state.turn = 1;
  state.active = setup.active ?? 0;
  state.priority = state.active;
  for (const p of state.players) p.bid = 0;

  for (const pid of [0, 1] as PlayerId[]) {
    const p = state.players[pid];

    if (setup.hands?.[pid]) {
      p.hand = setup.hands[pid]!.map((defId) => makeCardInstance(nextUid(state, 'c'), defId, pid));
    }
    if (setup.decks?.[pid]) {
      p.deck = setup.decks[pid]!.map((defId) => makeCardInstance(nextUid(state, 'c'), defId, pid));
    }
    for (const defId of setup.units?.[pid] ?? []) summonUnit(state, pid, defId);
    for (const defId of setup.facilities?.[pid] ?? []) buildFacility(state, pid, defId);
    if (setup.resources?.[pid]) Object.assign(p.resources, setup.resources[pid]);
    if (setup.baseHp?.[pid] !== undefined) p.baseHp = setup.baseHp[pid]!;
  }
  return state;
}

/** 手札の中から defId に一致する最初のカードのuidを返す */
export function handUid(state: GameState, pid: PlayerId, defId: string): string {
  const card = state.players[pid].hand.find((c) => c.defId === defId);
  if (!card) throw new Error(`手札に ${defId} がありません`);
  return card.uid;
}

/** 場のユニットのうち defId に一致する最初のもののuidを返す */
export function unitUid(state: GameState, pid: PlayerId, defId: string): string {
  const unit = state.players[pid].units.find((u) => u.defId === defId);
  if (!unit) throw new Error(`場に ${defId} がありません`);
  return unit.uid;
}

export function facilityUid(state: GameState, pid: PlayerId, defId: string): string {
  const f = state.players[pid].facilities.find((x) => x.defId === defId);
  if (!f) throw new Error(`場に施設 ${defId} がありません`);
  return f.uid;
}

/**
 * 何もせずにターンだけを進める。
 * 分配は資金へ全振り、手札は溢れた分だけ捨てる。
 * 「Nターン後にどうなっているか」を検証したいテストで使う。
 */
export function passTurns(state: GameState, turns: number): GameState {
  let s = state;
  const stopTurn = s.turn + turns;
  for (let guard = 0; guard < 400; guard++) {
    if (s.winner !== null) break;
    if (s.turn >= stopTurn && s.phase === 'main') break;

    if (s.phase === 'allocate') {
      s = applyAction(s, { type: 'allocate', fund: RULES.FREE_POINTS, mana: 0, aether: 0, draw: 0 }).state;
    } else if (s.phase === 'main') {
      s = applyAction(s, { type: 'endTurn' }).state;
    } else if (s.phase === 'discard') {
      const p = s.players[s.active];
      const uids = p.hand.slice(0, p.hand.length - RULES.HAND_LIMIT).map((c) => c.uid);
      s = applyAction(s, { type: 'discard', uids }).state;
    } else if (s.phase === 'respond') {
      s = applyAction(s, { type: 'pass' }).state;
    } else {
      break;
    }
  }
  return s;
}
