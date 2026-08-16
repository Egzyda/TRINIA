/**
 * TRINIA - ルール定数と対局モード
 *
 * 仕様書 2.1 のパラメータを一箇所に集約する。
 * バランス調整はここと data/cards_master.json のみを触れば完結する。
 *
 * ルールセットは対局ごとに `GameState.rules` として保持する。
 * これにより「短時間モード」のようなルール違いの卓を、
 * グローバル状態を書き換えずに同時に走らせられる
 * （AIの探索が別ルールの盤面を汚さない／オンライン対戦で卓ごとに合意できる）。
 */
export interface RuleSet {
  /** 拠点HP初期値 */
  BASE_HP: number;
  /** 初期手札枚数（引き直しなし） */
  INITIAL_HAND: number;
  /** デッキ枚数 */
  DECK_SIZE: number;
  /** 同名カードの最大採用枚数 */
  MAX_COPIES: number;
  /** ターン終了時の手札上限 */
  HAND_LIMIT: number;
  /** ターン開始時に無条件で付与されるフリーポイント */
  FREE_POINTS: number;
  /** 追加ドロー1枚あたりのポイント消費 */
  DRAW_COST: number;
  /** 前衛ゾーンの最大ユニット数 */
  MAX_UNITS: number;
  /** 施設ゾーンの最大枠数 */
  MAX_FACILITIES: number;
  /**
   * 後攻プレイヤーが毎回得る初期リソースpt。
   *
   * 先攻/後攻はコイントスで決め、拠点HPは両者満タンで始まる。以前は先攻権を
   * 拠点HPのオークションで競らせていたが、AIの入札ヒューリスティックの精度に
   * 結果が依存してしまい、実測では何もしないより悪い先攻勝率（64.9%）になっていた。
   * コイントス＋固定ボーナスに切り替えたところ、この値(+1pt)だけで先攻勝率51.1%まで
   * 収まることを実測済み（docs/BALANCE.md §14）。
   */
  SECOND_PLAYER_BONUS: number;
  /** 後攻プレイヤーが追加で引く初期手札（さらに細かく調整したい場合の予備の摘み） */
  SECOND_PLAYER_BONUS_CARDS: number;
  /** 引き分け判定に使う最大ターン数（無限ループ防止の安全弁） */
  TURN_LIMIT: number;
}

export const DEFAULT_RULES: Readonly<RuleSet> = {
  BASE_HP: 50,
  INITIAL_HAND: 6,
  DECK_SIZE: 20,
  MAX_COPIES: 2,
  HAND_LIMIT: 7,
  FREE_POINTS: 2,
  DRAW_COST: 1,
  MAX_UNITS: 3,
  MAX_FACILITIES: 3,
  SECOND_PLAYER_BONUS: 1,
  SECOND_PLAYER_BONUS_CARDS: 0,
  TURN_LIMIT: 200,
};

/**
 * デッキ構築や画面表示など「特定の対局に属さない」場面で参照する既定値。
 * 対局中のルールは必ず `GameState.rules` を見ること。
 */
export const RULES: RuleSet = { ...DEFAULT_RULES };

/** 検証ツール用に既定値を書き換える。ゲーム本体は触らない */
export function configureRules(partial: Partial<RuleSet>): void {
  Object.assign(RULES, partial);
}

export function resetRules(): void {
  Object.assign(RULES, DEFAULT_RULES);
}

// ---------------------------------------------------------------------------
// 対局モード
// ---------------------------------------------------------------------------

export type MatchModeId = 'quick' | 'standard';

export interface MatchMode {
  id: MatchModeId;
  name: string;
  description: string;
  /** 目安の所要ターン数（1人あたり） */
  turnsHint: string;
  overrides: Partial<RuleSet>;
}

/**
 * 対局モードの定義。
 *
 * クイックは「拠点HPを削るだけ」ではなく「毎ターンの付与ptを増やして加速する」形にしてある。
 * HPだけ削るとアグロ一強になり（実測で強襲部隊が75%）、
 * 施設を建てて戦力を整えるという本作の骨格が機能しなくなるため。
 * 付与ptを3にすると重いデッキも展開が間に合い、勝率の散らばりが標準ルール並みに収まる。
 */
export const MATCH_MODES: MatchMode[] = [
  {
    id: 'standard',
    name: 'スタンダード',
    description: '施設を建てて戦力を整える、じっくり型の標準ルール。',
    turnsHint: '1人あたり約20ターン',
    overrides: { BASE_HP: 40, FREE_POINTS: 2 },
  },
  {
    id: 'quick',
    name: 'クイック',
    description: '拠点HPが低く、毎ターンのポイントが3ptに増える加速ルール。短期決戦向け。',
    turnsHint: '1人あたり約14ターン',
    overrides: { BASE_HP: 30, FREE_POINTS: 3 },
  },
];

export function getMatchMode(id: MatchModeId): MatchMode {
  const mode = MATCH_MODES.find((m) => m.id === id);
  if (!mode) throw new Error(`未知の対局モード: ${id}`);
  return mode;
}

/** 対局モードから、その卓で使うルールセットを組み立てる */
export function rulesForMode(id: MatchModeId): RuleSet {
  return { ...RULES, ...getMatchMode(id).overrides };
}

// ---------------------------------------------------------------------------
// デッキ構築の検証（対局に属さないので既定値を使う）
// ---------------------------------------------------------------------------

export function validateDeck(defIds: string[]): { ok: boolean; error?: string } {
  if (defIds.length !== RULES.DECK_SIZE) {
    return {
      ok: false,
      error: `デッキは${RULES.DECK_SIZE}枚である必要があります（現在${defIds.length}枚）`,
    };
  }
  const counts = new Map<string, number>();
  for (const id of defIds) counts.set(id, (counts.get(id) ?? 0) + 1);
  for (const [id, n] of counts) {
    if (n > RULES.MAX_COPIES) {
      return { ok: false, error: `同名カードは${RULES.MAX_COPIES}枚までです（${id}が${n}枚）` };
    }
  }
  return { ok: true };
}
