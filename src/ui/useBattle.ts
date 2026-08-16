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
  /** 対局モード（拠点HP・毎ターン付与ptが変わる） */
  mode: MatchModeId;
}

/**
 * AIの1手ごとの待ち時間(ms)。
 *
 * 盤面が動く手（召喚・攻撃・起動・打ち消し）は演出を見せたいので長く取り、
 * 分配のような事務的な手は短く流す。
 * 一律に短くすると「いきなり状況が進んで自分のターンになる」ため。
 *
 * 攻撃は攻撃側の踏み込み・反撃・被弾フラッシュと視覚情報が特に多いので
 * 他の盤面操作よりさらに長く取る。ターン終了も、直前が攻撃などの見せ場
 * だった場合に間を置かず自分の番に切り替わると「何が起きたか分からないまま
 * 手番が回ってきた」と感じやすいため、事務的な手よりは長めに待たせる。
 */
const AI_DELAY_ATTACK = 1300;
const AI_DELAY_IMPACTFUL = 950;
const AI_DELAY_TURN_END = 850;
const AI_DELAY_ROUTINE = 420;

function stepDelayFor(action: GameAction): number {
  switch (action.type) {
    case 'attack':
      return AI_DELAY_ATTACK;
    case 'playCard':
    case 'activate':
    case 'respond':
      return AI_DELAY_IMPACTFUL;
    case 'endTurn':
      return AI_DELAY_TURN_END;
    default:
      return AI_DELAY_ROUTINE;
  }
}

/**
 * AIが不正手を出したときに進行不能を避けるための代替手。
 *
 * これが無いと applyAction 失敗時に前の state をそのまま返すことになり、
 * 参照が変わらないので React が再レンダーを省略 → state依存のeffectが
 * 二度と走らず、AIが永久に止まる（tools側の advanceAi と同じ安全弁）。
 */
function fallbackActions(state: GameState, me: PlayerId): GameAction[] {
  const p = state.players[me];
  switch (state.phase) {
    case 'allocate':
      return [{ type: 'allocate', fund: state.rules.FREE_POINTS, mana: 0, aether: 0, draw: 0 }];
    case 'respond':
      return [{ type: 'pass' }];
    case 'discard': {
      const need = Math.max(0, p.hand.length - state.rules.HAND_LIMIT);
      return [{ type: 'discard', uids: p.hand.slice(0, need).map((c) => c.uid) }];
    }
    default:
      return [{ type: 'endTurn' }];
  }
}

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

  /*
   * 進行が止まったときに再試行するためのカウンタ。
   *
   * AIの手番はこのeffect → setState → stateが変わって再実行、という連鎖で進む。
   * 何らかの理由で state が変わらないと連鎖が切れて画面が固まったままになるため、
   * 見張り役として一定時間動きがなければこれを増やしてeffectを叩き直す。
   */
  const [retryTick, setRetryTick] = useState(0);

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
        // 通常は prev === effectが見た state なので、決めた手をそのまま適用する。
        // ここで無条件に decideAction を呼び直すと ctx.plan / ctx.rngState を
        // 1手につき2回消費してしまい、HARDの計画が1手飛ばしで崩れる。
        let result = applyAction(prev, action);

        // プレイヤーの入力と競合して盤面がずれていた場合だけ決め直す
        if (!result.ok) {
          const fresh = decideAction(prev, foeSide, aiRef.current);
          if (fresh) result = applyAction(prev, fresh);
        }
        if (result.ok) return result.state;

        // それでも駄目なときの安全弁。何もせず prev を返すと参照が変わらず
        // 再レンダーされないため、このeffectが二度と走らずAIが永久に停止する。
        for (const fb of fallbackActions(prev, foeSide)) {
          const r = applyAction(prev, fb);
          if (r.ok) return r.state;
        }
        return prev;
      });
    }, stepDelayFor(action));

    // 見張り: 上のタイマーが何らかの理由で成果を出さなくても、必ず再挑戦する
    const watchdog = setTimeout(() => setRetryTick((n) => n + 1), stepDelayFor(action) + 6000);

    return () => {
      clearTimeout(timer);
      clearTimeout(watchdog);
    };
  }, [state, foeSide, retryTick]);

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
