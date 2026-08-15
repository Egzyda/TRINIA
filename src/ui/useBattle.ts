/**
 * バトル1局分の状態管理フック。
 *
 * ルールエンジンは純粋関数なので、ここがやるのは
 *   - プレイヤー入力を applyAction に渡す
 *   - AIの手番なら少し間を置いて1手ずつ進める（一気に進むと何が起きたか読めない）
 * の2つだけ。オンライン対戦を足すときは dispatch の先を
 * ローカル適用から通信経由に差し替えれば同じ画面がそのまま使える。
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createGame } from '../core/gameState';
import { applyAction } from '../core/mainPhaseEngine';
import { decideAction, makeAi, type AiContext, type Difficulty } from '../ai';
import { rulesForMode, type MatchModeId } from '../core/rules';
import type { GameAction, GameState, PlayerId } from '../core/types';

export interface BattleConfig {
  myDeck: string[];
  myName: string;
  foeDeck: string[];
  foeName: string;
  difficulty: Difficulty;
  seed: number;
  /** 人間が操作する側 */
  mySide: PlayerId;
  /** 対局モード（拠点HP・毎ターン付与pt・競り上限が変わる） */
  mode: MatchModeId;
}

/** AIの1手ごとの待ち時間(ms)。速すぎると盤面の変化が追えない */
const AI_STEP_DELAY = 420;

export interface Battle {
  state: GameState;
  error: string | null;
  /** AIが思考中（入力を受け付けない） */
  aiThinking: boolean;
  dispatch: (action: GameAction) => boolean;
  clearError: () => void;
  restart: () => void;
}

export function useBattle(config: BattleConfig): Battle {
  const foeSide: PlayerId = config.mySide === 0 ? 1 : 0;

  const makeInitial = useCallback((): GameState => {
    const setups: [{ name: string; deck: string[] }, { name: string; deck: string[] }] =
      config.mySide === 0
        ? [
            { name: config.myName, deck: config.myDeck },
            { name: config.foeName, deck: config.foeDeck },
          ]
        : [
            { name: config.foeName, deck: config.foeDeck },
            { name: config.myName, deck: config.myDeck },
          ];
    return createGame(setups[0], setups[1], config.seed, rulesForMode(config.mode));
  }, [
    config.mySide,
    config.myName,
    config.myDeck,
    config.foeName,
    config.foeDeck,
    config.seed,
    config.mode,
  ]);

  const [state, setState] = useState<GameState>(makeInitial);
  const [error, setError] = useState<string | null>(null);
  const [aiThinking, setAiThinking] = useState(false);
  const aiRef = useRef<AiContext>(makeAi(config.difficulty, config.seed ^ 0x51ed270b));

  // setState の関数更新子は同期的には実行されないため、戻り値用の ok を
  // クロージャ経由で読むと常に古い値（false）になる。state を直接使って
  // 同期的に判定することで、呼び出し側の if (dispatch(...)) が正しく動くようにする。
  const dispatch = useCallback((action: GameAction): boolean => {
    const result = applyAction(state, action);
    if (!result.ok) {
      setError(result.error ?? '不正な操作です');
      return false;
    }
    setError(null);
    setState(result.state);
    return true;
  }, [state]);

  const restart = useCallback(() => {
    aiRef.current = makeAi(config.difficulty, (Date.now() ^ 0x51ed270b) | 0);
    setState(makeInitial());
    setError(null);
  }, [config.difficulty, makeInitial]);

  // AIの手番を1手ずつ進める
  useEffect(() => {
    if (state.winner !== null) {
      setAiThinking(false);
      return;
    }
    const action = decideAction(state, foeSide, aiRef.current);
    if (!action) {
      setAiThinking(false);
      return;
    }
    setAiThinking(true);
    const timer = setTimeout(() => {
      setState((prev) => {
        // タイマー発火までに盤面が動いている可能性があるので取り直す
        const fresh = decideAction(prev, foeSide, aiRef.current);
        if (!fresh) return prev;
        const result = applyAction(prev, fresh);
        return result.ok ? result.state : prev;
      });
    }, AI_STEP_DELAY);
    return () => clearTimeout(timer);
  }, [state, foeSide]);

  return useMemo(
    () => ({
      state,
      error,
      aiThinking,
      dispatch,
      clearError: () => setError(null),
      restart,
    }),
    [state, error, aiThinking, dispatch, restart],
  );
}
